/**
 * Caricamento multiplo nella pagina Documenti (E1b-11): le regole come funzioni
 * pure. Il componente non decide niente da solo, e scripts/verify-upload-batch.mjs
 * prova ogni regola senza avviare l'app.
 *
 * Quattro cose, tutte senza stato e senza effetti:
 *   1. la selezione: tetto sul numero di file e file non caricabili, con un
 *      messaggio che dice cosa è rimasto fuori e perché (screenSelection);
 *   2. lo stato di ogni file lungo la catena caricamento → classificazione →
 *      estrazione, come riduttore di eventi (applyFileEvent);
 *   3. cosa si può riprovare: solo i file che NON sono arrivati in archivio
 *      (uploadRetryIds);
 *   4. un solo messaggio a fine caricamento (summarizeUploadBatch).
 *
 * PERCHE' "RIPROVA" TOCCA SOLO I FALLITI DEL CARICAMENTO: un file che ha
 * fallito in classificazione o in estrazione ha già la sua riga in `documents`.
 * Ricaricarlo creerebbe una seconda versione dello stesso documento. Quelli si
 * riprendono con "Classifica documenti" e "Estrai dati", che lavorano sulla riga
 * che c'è già.
 *
 * Import relativi tra moduli di lib: vedi document-rows.ts.
 */
import { ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_SIZE } from './document-upload'
import { endSentence, namesList, type BulkAssignSummary, type BulkFailure } from './document-table'
import { pluralize } from './pluralize'

// ============================================================
// 1. Selezione
// ============================================================

/**
 * Quanti file in un solo gesto. Il tetto limita il tempo di un batch che gira
 * nel browser (B58: chiudendo la scheda si ferma) e la spesa AI per gesto, fino
 * a due chiamate per PDF. Valore provvisorio, da ritoccare dopo la misura su
 * documenti reali.
 */
export const MAX_UPLOAD_BATCH_FILES = 20

const BYTES_PER_MB = 1024 * 1024

export const REJECT_UNSUPPORTED_TYPE = 'Tipo file non supportato (PDF, immagini, Word)'
export const REJECT_TOO_LARGE = `File troppo grande (max ${MAX_DOCUMENT_SIZE / BYTES_PER_MB} MB)`

/** Solo ciò che serve a decidere: File del browser ne è un'istanza. */
export type SelectedFile = { name: string; type: string; size: number }

/**
 * Perché un file non si può caricare, o null se si può. Prima il tipo, poi la
 * dimensione: stesso ordine dei controlli che il caricamento fa per file, che
 * restano come seconda difesa e usano questa stessa funzione.
 */
export function fileRejectionReason(file: Pick<SelectedFile, 'type' | 'size'>): string | null {
  if (!ALLOWED_DOCUMENT_MIME.has(file.type)) return REJECT_UNSUPPORTED_TYPE
  if (file.size > MAX_DOCUMENT_SIZE) return REJECT_TOO_LARGE
  return null
}

export type RejectedFile = { name: string; reason: string }

export type SelectionResult<T extends SelectedFile> = {
  /** I file che entrano nella lista, nell'ordine ricevuto. */
  accepted: T[]
  /** I file rimasti fuori per tipo o dimensione. Vuoto se la selezione supera il tetto. */
  rejected: RejectedFile[]
  /** true se la selezione ha superato il tetto: in quel caso non entra nessun file. */
  overLimit: boolean
  /** Cosa dire a chi ha scelto i file; null se è andato tutto bene. */
  message: string | null
}

/**
 * Oltre il tetto non entra NESSUN file: i file arrivano dal selettore in ordine
 * alfabetico, e tenere "i primi N" lascerebbe fuori file a caso senza che chi
 * li ha scelti possa prevederlo. Meglio rifare la scelta con numeri giusti.
 *
 * Sotto il tetto entrano tutti i file caricabili; gli altri non si perdono in
 * silenzio, finiscono nel messaggio con nome e motivo. La selezione sostituisce
 * la precedente, come prima: il chiamante rimpiazza la lista con `accepted`.
 */
export function screenSelection<T extends SelectedFile>(
  files: readonly T[],
  max: number = MAX_UPLOAD_BATCH_FILES,
): SelectionResult<T> {
  if (files.length === 0) return { accepted: [], rejected: [], overLimit: false, message: null }

  if (files.length > max) {
    return {
      accepted: [],
      rejected: [],
      overLimit: true,
      message: `Hai scelto ${pluralize(files.length, 'file', 'file')}: il massimo è ${max} per volta. Scegline meno, poi ripeti con gli altri.`,
    }
  }

  const accepted: T[] = []
  const rejected: RejectedFile[] = []
  for (const file of files) {
    const reason = fileRejectionReason(file)
    if (reason === null) accepted.push(file)
    else rejected.push({ name: file.name, reason })
  }

  if (rejected.length === 0) return { accepted, rejected, overLimit: false, message: null }

  const reasons = [...new Set(rejected.map(r => r.reason))]
  const head = pluralize(rejected.length, 'file escluso', 'file esclusi')
  return {
    accepted,
    rejected,
    overLimit: false,
    message: endSentence(`${head}: ${namesList(rejected.map(r => r.name))}. Motivo: ${reasons.join('; ')}`),
  }
}

// ============================================================
// 2. Stato di ogni file
// ============================================================

export type FilePhase =
  | 'in_coda'            // scelto, il caricamento non è partito
  | 'in_caricamento'     // upload e riga in archivio in corso
  | 'caricato'           // in archivio, aspetta il suo turno di classificazione
  | 'in_classificazione'
  | 'classificato'       // tipo estraibile, aspetta il suo turno di estrazione
  | 'in_estrazione'
  | 'completo'           // fine della catena, senza altro da fare
  | 'fallito'            // fine della catena, vedi failedAt

export type FailureStage = 'caricamento' | 'classificazione' | 'estrazione'

/**
 * `failedAt` e `error` hanno senso solo con phase 'fallito'. L'`error` del
 * caricamento è il testo delle action; quello di classificazione ed estrazione
 * lo compone il chiamante dalla causa fissa di batch-failures.ts, mai dal
 * messaggio grezzo della route.
 */
export type FileState = { phase: FilePhase; failedAt?: FailureStage; error?: string }

export const INITIAL_FILE_STATE: FileState = { phase: 'in_coda' }

export type FileEvent =
  | { type: 'upload_start' }
  | { type: 'upload_ok' }
  | { type: 'upload_fail'; error: string }
  | { type: 'classify_start' }
  /** `extractable`: il tipo letto è estraibile e la classificazione è completata (stessa regola che avvia l'estrazione). */
  | { type: 'classify_ok'; extractable: boolean }
  | { type: 'classify_fail'; error: string }
  | { type: 'extract_start' }
  | { type: 'extract_ok' }
  /** Il documento è cambiato sotto e non è più estraibile: non è un fallimento. */
  | { type: 'extract_skip' }
  | { type: 'extract_fail'; error: string }
  /** Il servizio AI è giù e il batch si ferma: i file ancora in attesa non partiranno. */
  | { type: 'stopped'; error: string }

const failed = (failedAt: FailureStage, error: string): FileState => ({ phase: 'fallito', failedAt, error })

/**
 * Un evento fuori sequenza lascia lo stato com'è (stesso oggetto), mai un salto.
 * 'completo' e 'fallito' sono finali.
 */
export function applyFileEvent(state: FileState, event: FileEvent): FileState {
  switch (state.phase) {
    case 'in_coda':
      if (event.type === 'upload_start') return { phase: 'in_caricamento' }
      return state
    case 'in_caricamento':
      if (event.type === 'upload_ok') return { phase: 'caricato' }
      if (event.type === 'upload_fail') return failed('caricamento', event.error)
      return state
    case 'caricato':
      if (event.type === 'classify_start') return { phase: 'in_classificazione' }
      if (event.type === 'stopped') return failed('classificazione', event.error)
      return state
    case 'in_classificazione':
      if (event.type === 'classify_ok') return { phase: event.extractable ? 'classificato' : 'completo' }
      if (event.type === 'classify_fail' || event.type === 'stopped') return failed('classificazione', event.error)
      return state
    case 'classificato':
      if (event.type === 'extract_start') return { phase: 'in_estrazione' }
      if (event.type === 'stopped') return failed('estrazione', event.error)
      return state
    case 'in_estrazione':
      if (event.type === 'extract_ok' || event.type === 'extract_skip') return { phase: 'completo' }
      if (event.type === 'extract_fail' || event.type === 'stopped') return failed('estrazione', event.error)
      return state
    case 'completo':
    case 'fallito':
      return state
  }
}

/** La riga di stato di un file, in parole brevi. L'errore, se c'è, si mostra a parte. */
export function fileStatusLabel(state: FileState): string {
  switch (state.phase) {
    case 'in_coda': return 'In coda'
    case 'in_caricamento': return 'Caricamento…'
    case 'caricato': return 'Caricato, in attesa di classificazione'
    case 'in_classificazione': return 'Classificazione…'
    case 'classificato': return 'Classificato, in attesa dei dati'
    case 'in_estrazione': return 'Estrazione dei dati…'
    case 'completo': return 'Fatto'
    case 'fallito':
      if (state.failedAt === 'caricamento') return 'Non caricato'
      if (state.failedAt === 'classificazione') return 'Non classificato'
      return 'Dati non estratti'
  }
}

/** true finché la catena di quel file non è finita (né completo né fallito). */
export function isFileInFlight(state: FileState): boolean {
  return state.phase !== 'completo' && state.phase !== 'fallito'
}

/** La fase di caricamento è finita per questo file: ha una riga in archivio o è fallito. */
function isUploadSettled(state: FileState): boolean {
  return state.phase !== 'in_coda' && state.phase !== 'in_caricamento'
}

/** "Caricamento: X di Y": i file la cui fase di caricamento è finita, bene o male. */
export function uploadProgress(states: readonly FileState[]): { done: number; total: number } {
  return { done: states.filter(isUploadSettled).length, total: states.length }
}

// ============================================================
// 3. Cosa si riprova
// ============================================================

type Identified = { id: string; state: FileState }

/** Gli id dei soli file che non sono arrivati in archivio, nell'ordine ricevuto. */
export function uploadRetryIds(tasks: readonly Identified[]): string[] {
  return tasks
    .filter(t => t.state.phase === 'fallito' && t.state.failedAt === 'caricamento')
    .map(t => t.id)
}

// ============================================================
// 4. Un solo messaggio a fine caricamento
// ============================================================

/**
 * "N caricati, M falliti: nomi", sul modello di summarizeBulkAssign. Conta il
 * solo caricamento: classificazione ed estrazione hanno già i loro banner e non
 * si dicono due volte. Con dei falliti il toast è persistente, perché i nomi si
 * leggono e il motivo (uno solo, se è lo stesso per tutti) è l'indizio su cosa
 * ritentare.
 *
 * Null se non c'è niente da riepilogare: lista vuota, oppure un file con il
 * caricamento ancora aperto (mai riepilogare un batch in corso).
 */
export function summarizeUploadBatch(
  entries: readonly { name: string; state: FileState }[],
): BulkAssignSummary | null {
  if (entries.length === 0) return null
  if (entries.some(e => !isUploadSettled(e.state))) return null

  const failures: BulkFailure[] = entries
    .filter(e => e.state.phase === 'fallito' && e.state.failedAt === 'caricamento')
    .map(e => ({ name: e.name, error: e.state.error ?? 'Errore sconosciuto' }))
  const uploaded = entries.length - failures.length

  if (failures.length === 0) {
    return {
      kind: 'success',
      message: `${pluralize(uploaded, 'documento caricato', 'documenti caricati')}.`,
      persistent: false,
    }
  }

  const reasons = new Set(failures.map(f => f.error))
  const reason = reasons.size === 1 ? ` Motivo: ${[...reasons][0]}` : ''
  const names = namesList(failures.map(f => f.name))
  const failedText = pluralize(failures.length, 'fallito', 'falliti')
  if (uploaded === 0) {
    return { kind: 'error', message: endSentence(`Nessun documento caricato, ${failedText}: ${names}.${reason}`), persistent: true }
  }
  return {
    kind: 'warning',
    message: endSentence(`${pluralize(uploaded, 'caricato', 'caricati')}, ${failedText}: ${names}.${reason}`),
    persistent: true,
  }
}
