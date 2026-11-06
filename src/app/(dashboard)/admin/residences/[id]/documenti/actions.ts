'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireCaller } from '@/lib/require-caller'
import { authorizeDocumentActor, PG_INVALID_TEXT_REPRESENTATION } from '@/lib/document-access'
import { checkUnitAssignment, documentUnitChangeEventUnitId, documentUnitChangePayload } from '@/lib/document-unit'
import { extractionIsCurrent } from '@/lib/document-extraction'
import {
  documentCorrectionPayload,
  isNoopCorrection,
  manualInstallerOverrides,
  normalizeOverrideInput,
  overridableKeys,
  overrideRequiresExtraction,
  resolveProposalInstaller,
  type CorrectionSource,
  type OverrideRow,
  type PreviousOverride,
} from '@/lib/document-overrides'
import { logActivityEvent } from '@/lib/activity-log'
import type { DocumentCategory, UserRole } from '@/types/database'
import { ALLOWED_DOCUMENT_MIME } from '@/lib/document-upload'
import {
  DOC_TYPES,
  SISTEMI,
  buildSupplierProposal,
  supplierVatNumberToWrite,
  type DocType,
  type ManualInstaller,
  type Sistema,
  type SupplierProposalCandidate,
  type SupplierInstallationRef,
} from '@/lib/document-classification'
import { friendlySupplierError, isVatUniqueViolation } from '@/lib/supplier-errors'
import { computeResidenceChecklist } from '@/lib/document-checklist'
import { PREVIEW_URL_TTL_SECONDS, previewKind, type PreviewKind } from '@/lib/document-preview'
import { ZIP_MAX_FILES, ZIP_URL_TTL_SECONDS } from '@/lib/document-table'
import {
  DELETE_MAX_DOCUMENTS,
  DOCUMENT_SNAPSHOT_COLUMNS,
  documentDeletedPayload,
  documentFileNotRemovedPayload,
  fileRemovalFailures,
  findDeleteBlockers,
  type DeleteBlocker,
  type DocumentSnapshot,
} from '@/lib/document-delete'

type AuthorizedUser = { user: { id: string } }
type AuthError = { error: string }

// Le action di questo file si dividono in tre gruppi con autorizzazioni
// diverse, e i tre helper sotto sono la sola fonte di verità di ciascuno.
// Lo split non è cosmetico: rispecchia tre RLS diverse, quindi allargare
// un solo helper è anche la garanzia che il gate applicativo non prometta
// più di quanto il DB conceda.

// Gestione documenti (upload + conferma classificazione): super_admin del
// builder e admin assegnato alla residenza. Lo scope per residenza NON si
// verifica qui — lo fanno le RLS che ricevono questo client scoped-utente:
// storage "documents bucket: upload scoped residenza" (022) e
// "documents: admin e super_admin gestiscono" (002_rls.sql), entrambe con
// un ramo admin via czero_can_access_residence.
async function getAuthorizedDocumentUser(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<AuthorizedUser | AuthError> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'super_admin' && profile.role !== 'admin')) {
    return { error: 'Permessi insufficienti' }
  }

  return { user }
}

// Eccezioni checklist: solo super_admin. Decidere che una voce attesa non
// si applica a questa residenza è composizione del fascicolo di consegna,
// non manutenzione ordinaria. La policy "checklist_exception: super_admin
// gestisce tutto" (027) non ha un ramo admin: allargare questo helper senza
// una migrazione darebbe all'admin un errore RLS grezzo sull'upsert, o lo
// zero-righe fuorviante di clearChecklistException, invece di un rifiuto
// pulito.
async function getAuthorizedChecklistManager(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<AuthorizedUser | AuthError> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return { error: 'Permessi insufficienti' }
  }

  return { user }
}

// Proposta fornitore dalle DiCo: solo super_admin, come le eccezioni
// checklist, ma con in più il builder_id — il match cerca nell'anagrafica
// del costruttore, non della residenza, e senza builder non c'è anagrafica
// in cui cercare (stesso gate di documenti/page.tsx). Rispecchia la policy
// "supplier_installations: super_admin gestisce" (039), che non ha un ramo
// admin: allargare questo helper darebbe all'admin un errore RLS grezzo
// invece di un rifiuto pulito.
async function getAuthorizedSupplierLinker(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ user: { id: string }; builderId: string; fullName: string | null } | AuthError> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // maybeSingle: "nessun profilo" è un esito di dominio (data null, error null),
  // un errore di rete o di RLS no — non devono collassare nello stesso messaggio.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, builder_id, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('[documenti] lettura profilo fallita in getAuthorizedSupplierLinker', {
      code: profileError.code,
      message: profileError.message,
    })
    return { error: 'Errore tecnico, riprova.' }
  }
  if (!profile || profile.role !== 'super_admin') {
    return { error: 'Permessi insufficienti' }
  }
  if (!profile.builder_id) return { error: 'Nessun builder associato al tuo account' }

  // `fullName` serve al registro attività, che congela l'attore al momento
  // dell'atto (confirmSupplierProposal → documento_corretto). Il ruolo è
  // sempre super_admin: il ramo sopra rifiuta tutto il resto.
  return { user, builderId: profile.builder_id as string, fullName: (profile.full_name as string | null) ?? null }
}

// Unica fonte di verità per il path storage di un documento: stesso
// pattern per upload server-side (sopra) e client-direct (sotto), la
// 022 lo assume per estrarre residenceId dal 1° segmento del path.
function buildDocumentStoragePath(residenceId: string, category: DocumentCategory, fileName: string) {
  const ext = fileName.split('.').pop() ?? 'bin'
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '')
  const safeTitle = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  return {
    storagePath: `${residenceId}/${category}/${Date.now()}_${safeTitle}.${ext}`,
    nameWithoutExt,
  }
}

// ============================================================
// Upload client-direct (B1). uploadDocumentiAdmin (upload monolitico
// server-side) è stata rimossa in questo commit: DocumentiClient ora
// chiama queste due action, zero altri chiamanti rimasti (verificato
// con grep prima della rimozione — la PWA usa uploadDocument, funzione
// separata in un altro file, mai toccata).
//
// createUploadUrl genera la signed upload URL: qui, e solo qui,
// viene verificata l'autorizzazione — la chiamata a
// createSignedUploadUrl richiede il permesso INSERT su
// storage.objects (022_storage_documents_scoped_rls.sql), quindi il
// client scoped-utente usato qui fa rispettare la stessa policy
// scoped-residenza di oggi. Il successivo uploadToSignedUrl dal
// browser non richiede permessi RLS aggiuntivi (il token è l'unica
// credenziale) — prova nel docstring di
// @supabase/storage-js/src/packages/StorageFileApi.ts:268-272 e
// 374-378, non nei docs pubblici che sono ambigui su questo punto.
// ============================================================

export type SignedUploadUrlResult =
  | { signedUrl: string; token: string; path: string }
  | { error: string }

export async function createUploadUrl(
  residenceId: string,
  category: DocumentCategory,
  fileName: string,
  contentType: string
): Promise<SignedUploadUrlResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedDocumentUser(supabase)
  if ('error' in auth) return { error: auth.error }

  if (!residenceId || !category || !fileName) {
    return { error: 'Parametri obbligatori mancanti' }
  }
  if (!ALLOWED_DOCUMENT_MIME.has(contentType)) {
    return { error: 'Tipo file non supportato (PDF, immagini, Word)' }
  }

  const { storagePath } = buildDocumentStoragePath(residenceId, category, fileName)

  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUploadUrl(storagePath)

  if (error || !data) {
    return { error: `Errore generazione URL: ${error?.message ?? 'sconosciuto'}` }
  }

  return { signedUrl: data.signedUrl, token: data.token, path: data.path }
}

// L'id torna al client per l'auto-classificazione post-upload (B4): il
// client deve sapere ESATTAMENTE quali righe ha appena creato, senza
// indovinarle da un refresh dei props (timing non affidabile).
export type ConfirmDocumentResult = { success: true; id: string } | { error: string }

export type ConfirmDocumentInput = {
  residenceId: string
  unitId: string | null
  category: DocumentCategory
  title: string
  storagePath: string
  fileName: string
  fileDate: string | null
}

// Stesso pattern di public.czero_storage_first_uuid (022): il 1° segmento
// del path deve essere uno UUID, altrimenti si tratta un path malformato
// come "nessuna residenza" invece di far esplodere un parse di UUID.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function residenceIdFromStoragePath(storagePath: string): string | null {
  const [first] = storagePath.split('/')
  return UUID_RE.test(first) ? first : null
}

// Il client ha già caricato il file con la signed URL prima di chiamare
// questa action: qui si verifica che l'oggetto esista davvero (invece
// di fidarsi del client) e poi si scrive la riga documents. L'upload e
// la riga DB sono due chiamate separate: se la conferma non arriva mai
// (tab chiuso, rete caduta), il file resta un orfano in storage senza
// una riga documents
// — nessun errore da intercettare, nessuna riga "pending" introdotta di
// proposito (deciso in FASE 0: niente nuovo invariante di filtro per
// proteggere file orfani innocui). La riconciliazione bucket↔tabella
// è uno script a mano (commit successivo del piano B1), non un cron.
export async function confirmDocument(input: ConfirmDocumentInput): Promise<ConfirmDocumentResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedDocumentUser(supabase)
  if ('error' in auth) return { error: auth.error }

  const { residenceId, unitId, category, title, storagePath, fileName, fileDate } = input
  if (!residenceId || !category || !storagePath || !title) {
    return { error: 'Parametri obbligatori mancanti' }
  }

  // Un utente autorizzato su più residenze potrebbe (per bug client o
  // in mala fede) passare un residenceId diverso dalla residenza reale
  // codificata nel path: senza questo controllo la RLS tabella e la
  // .list() sopra passerebbero comunque, creando una riga visibile in
  // una residenza ma con un path che punta a un'altra — stessa famiglia
  // di bug della legge "categoria dal DB, mai dal path" (022, footer).
  const pathResidenceId = residenceIdFromStoragePath(storagePath)
  if (!pathResidenceId || pathResidenceId.toLowerCase() !== residenceId.toLowerCase()) {
    return { error: 'Percorso storage incoerente con la residenza indicata' }
  }

  // L'unità scelta deve essere della stessa residenza: la FK su units(id) e la
  // policy di scrittura di documents non lo controllano. Stessa regola di
  // setDocumentUnit (checkUnitAssignment), applicata prima di toccare lo
  // storage. Letta col client di sessione: un'unità fuori dal perimetro
  // dell'utente è "non trovata", un errore di lettura è tecnico.
  if (unitId !== null) {
    if (typeof unitId !== 'string' || unitId === '') return { error: 'Parametri non validi' }
    const { data: unitRow, error: unitError } = await supabase
      .from('units')
      .select('id, residence_id')
      .eq('id', unitId)
      .maybeSingle()
    if (unitError && unitError.code !== PG_INVALID_TEXT_REPRESENTATION) {
      console.error('[confirmDocument] lettura unità fallita', { unitId, code: unitError.code, message: unitError.message })
      return { error: 'Errore tecnico, riprova.' }
    }
    const unitCheck = checkUnitAssignment(
      { residence_id: residenceId, unit_id: null },
      unitId,
      unitError ? null : (unitRow as { id: string; residence_id: string } | null),
    )
    if (!unitCheck.ok) return { error: unitCheck.error }
  }

  const lastSlash = storagePath.lastIndexOf('/')
  const folder = storagePath.slice(0, lastSlash)
  const objectName = storagePath.slice(lastSlash + 1)
  const { data: listing } = await supabase.storage
    .from('documents')
    .list(folder, { search: objectName })

  if (!listing?.some(o => o.name === objectName)) {
    return { error: 'File non trovato in storage: upload non completato' }
  }

  const { data: inserted, error: dbError } = await supabase
    .from('documents')
    .insert({
      residence_id: residenceId,
      unit_id: unitId,
      category,
      title,
      storage_path: storagePath,
      file_name: fileName,
      file_date: fileDate || new Date().toISOString().split('T')[0],
      uploaded_by: auth.user.id,
    })
    .select('id')
    .single()

  if (dbError || !inserted) {
    // Cleanup file orfano se l'insert DB fallisce
    await supabase.storage.from('documents').remove([storagePath])
    return { error: `Errore salvataggio: ${dbError?.message ?? 'sconosciuto'}` }
  }

  revalidatePath(`/admin/residences/${residenceId}/documenti`)
  return { success: true, id: inserted.id as string }
}

export type ConfirmClassificationResult = { success: true } | { error: string }

// Conferma umana della classificazione AI (decisione #7: l'AI propone, l'umano
// decide). È l'UNICO punto che scrive reviewed_by/reviewed_at, e li scrive
// SERVER-SIDE (auth.user.id + now()), mai da valori passati dal client. Usa il
// client scoped-utente: la policy RLS "documents: admin e super_admin
// gestiscono" (002_rls.sql) autorizza l'UPDATE al super_admin del builder
// proprietario e all'admin assegnato alla residenza — il residente non ha
// alcuna policy di scrittura su documents.
//
// sistema = verità confermata dell'impianto (OPZIONE B, B4): scritta nella
// colonna dedicata, mai in extracted_metadata (che resta il verbale immutabile
// della proposta AI e NON va riallineato). null = nessun impianto specifico.
export async function confirmClassification(input: {
  documentId: string
  docType: DocType
  sistema: Sistema | null
}): Promise<ConfirmClassificationResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedDocumentUser(supabase)
  if ('error' in auth) return { error: auth.error }

  const { documentId, docType, sistema } = input
  if (!documentId || !(DOC_TYPES as string[]).includes(docType)) {
    return { error: 'Parametri non validi' }
  }
  if (sistema !== null && !(SISTEMI as string[]).includes(sistema)) {
    return { error: 'Parametri non validi' }
  }

  const { data, error } = await supabase
    .from('documents')
    .update({
      doc_type: docType,
      sistema,
      classification_status: 'completata',
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .select('residence_id')

  if (error) return { error: `Errore salvataggio: ${error.message}` }
  // RLS può filtrare la riga senza errore se il documento è fuori dallo scope
  // del super_admin: nessuna riga aggiornata.
  if (!data || data.length === 0) {
    return { error: 'Documento non trovato o non accessibile' }
  }

  revalidatePath(`/admin/residences/${data[0].residence_id}/documenti`)
  return { success: true }
}

export type ChecklistExceptionResult = { success: true } | { error: string }

// Verifica che una expectation_key corrisponda a un'attesa REALE e corrente
// della residenza (BASE+DERIVATO, ricalcolate ora) — non solo "ben formata".
// La funzione privata expectationKey di document-checklist.ts non basta e
// non va esportata per questo: verificare il FORMATO di una chiave non dice
// nulla su se quell'attesa esiste ancora oggi per questa residenza (B4 C5
// FASE 0, punto 3 — rischio di chiave orfana su cambi futuri della mappa).
// Riusata da entrambe le action sotto.
//
// Tre esiti, non un boolean: 'non_disponibile' (lettura fallita, già loggata
// da computeResidenceChecklist) non deve diventare "voce non trovata".
async function expectationKeyExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  residenceId: string,
  expectationKey: string
): Promise<'si' | 'no' | 'non_disponibile'> {
  const checklist = await computeResidenceChecklist(supabase, residenceId)
  if (!checklist.available) return 'non_disponibile'
  return checklist.expectations.some(e => e.expectationKey === expectationKey) ? 'si' : 'no'
}

// Segna una voce della checklist di consegna come non applicabile (B4 C5b,
// motivazione obbligatoria dalla revisione "audit"). unit_id sempre NULL in
// v1 (nessuno scope per-unità, decisione B4 C4). Upsert idempotente sul
// vincolo UNIQUE NULLS NOT DISTINCT (residence_id, expectation_key,
// unit_id) di residence_checklist_exception (027, spiegato in 028) — stesso
// pattern onConflict di admin-actions.ts:26 e welcome/[token]/accept/page.tsx:66.
//
// expected_from NON è nel payload: omesso di proposito, non azzerato. Un
// upsert Supabase/PostgREST genera il DO UPDATE SET solo per le colonne
// presenti nell'oggetto — ometterla la lascia intatta su un conflitto
// (un residuo "atteso da" di un ciclo precedente non applicabile→annulla
// non va perso solo perché si riesclude la voce). "Atteso da" non ha un
// campo dedicato in QUESTO flusso: escludere un documento non significa
// aspettarlo da qualcuno (028, IN SCOPE).
//
// marked_by = chi ha eseguito QUESTA esclusione: scritto qui e SOLO qui
// (clearChecklistException non lo tocca), risponde a "Escluso da... il..."
// in UI. created_by resta il campo esistente, indipendente.
export async function setChecklistException(
  residenceId: string,
  expectationKey: string,
  note: string
): Promise<ChecklistExceptionResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedChecklistManager(supabase)
  if ('error' in auth) return { error: auth.error }

  if (!residenceId || !expectationKey) {
    return { error: 'Parametri obbligatori mancanti' }
  }

  const trimmedNote = note.trim()
  if (!trimmedNote) {
    return { error: 'La motivazione è obbligatoria' }
  }

  const exists = await expectationKeyExists(supabase, residenceId, expectationKey)
  if (exists === 'non_disponibile') {
    return { error: 'Elenco dei documenti non disponibile, riprova tra poco.' }
  }
  if (exists === 'no') {
    return { error: 'Voce non trovata tra le attese correnti della residenza' }
  }

  const { error } = await supabase
    .from('residence_checklist_exception')
    .upsert(
      {
        residence_id: residenceId,
        expectation_key: expectationKey,
        unit_id: null,
        not_applicable: true,
        note: trimmedNote,
        created_by: auth.user.id,
        marked_by: auth.user.id,
      },
      { onConflict: 'residence_id,expectation_key,unit_id' }
    )

  if (error) return { error: `Errore salvataggio: ${error.message}` }

  revalidatePath(`/admin/residences/${residenceId}/documenti`)
  return { success: true }
}

// Annulla il "non applicabile": la voce torna mancante. MAI un DELETE — note
// ed expected_from si conservano (decisione B4 C5 #6, chiusa), la riga resta
// come traccia della configurazione. Stesso pattern RLS-filtra-in-silenzio
// di confirmClassification sopra: .select() dopo l'update, zero righe =
// eccezione non trovata o non accessibile.
export async function clearChecklistException(
  residenceId: string,
  expectationKey: string
): Promise<ChecklistExceptionResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedChecklistManager(supabase)
  if ('error' in auth) return { error: auth.error }

  if (!residenceId || !expectationKey) {
    return { error: 'Parametri obbligatori mancanti' }
  }

  // Nessun ricalcolo qui: a differenza di setChecklistException, questa
  // action non scrive una riga nuova da input del client, agisce solo su
  // una riga già esistente. L'UPDATE con .select() sotto, zero righe = già
  // la difesa completa (chiave inesistente, residenza altrui, riga assente
  // finiscono tutte nello stesso errore, senza bisogno di ricalcolare la
  // checklist prima).
  const { data, error } = await supabase
    .from('residence_checklist_exception')
    .update({ not_applicable: false })
    .eq('residence_id', residenceId)
    .eq('expectation_key', expectationKey)
    .is('unit_id', null)
    .select('id')

  if (error) return { error: `Errore salvataggio: ${error.message}` }
  if (!data || data.length === 0) {
    return { error: 'Eccezione non trovata o non accessibile' }
  }

  revalidatePath(`/admin/residences/${residenceId}/documenti`)
  return { success: true }
}

// ============================================================
// Proposta fornitore dalle dichiarazioni di conformità (blocco e)
// ============================================================

// Cosa l'utente ha LETTO nel pannello quando ha premuto il bottone. Non è
// ciò che verrà scritto: fornitore, sistema e residenza del collegamento
// vengono tutti dal ricalcolo server-side. Serve a una cosa sola — rifiutare
// se il ricalcolo dà un esito diverso da quello mostrato.
export type SupplierProposalExpectation = {
  kind: 'per_piva' | 'simile_per_nome' | 'nessun_match'
  sistema: Sistema
  supplierId: string | null
  // P.IVA che la frase ha dichiarato "verrà registrata" in anagrafica, null se
  // non ne prometteva nessuna. Deve coincidere col ricalcolo come il resto:
  // l'utente non deve vedersi scrivere — o non scrivere — una P.IVA diversa da
  // quella che ha letto.
  vatNumber: string | null
}

export type ConfirmSupplierProposalResult = { success: true } | { error: string }

const PROPOSAL_CHANGED_ERROR =
  'La proposta è cambiata da quando hai aperto la pagina. Ricarica e rileggila prima di confermare.'

// I due vincoli della 039 sull'INSERT del collegamento.
//   • WITH CHECK di "supplier_installations: super_admin gestisce": fornitore
//     e residenza del costruttore dell'utente, documento sorgente della stessa
//     residenza. PostgREST lo restituisce come 42501, messaggio tecnico in
//     inglese.
//   • UNIQUE (supplier_id, residence_id, sistema): passa dall'helper condiviso
//     con la pagina fornitori, così la stessa violazione dice la stessa cosa
//     su entrambe le superfici.
function installationInsertError(error: { code?: string; message: string }): string {
  if (error.code === '42501') {
    return 'Collegamento non consentito: fornitore e residenza devono appartenere al tuo costruttore, e il documento a questa residenza.'
  }
  return friendlySupplierError(error.message)
}

// Conferma la proposta di fornitore di una dichiarazione di conformità:
// scrive la riga "ha realizzato" con source = 'documento' e il documento come
// prova, creando prima il fornitore se non è in anagrafica.
//
// IL CLIENT NON DECIDE NULLA. Dal client arrivano solo l'id del documento e
// l'esito che l'utente ha letto. Residenza, sistema e impresa si leggono qui
// dalla riga documents; anagrafica e collegamenti si rileggono qui; l'esito si
// ricalcola qui con la stessa buildSupplierProposal del pannello. Se il
// ricalcolo differisce da quanto mostrato (anagrafica cambiata, documento
// riclassificato, collegamento creato nel frattempo) si rifiuta, invece di
// scrivere un collegamento che l'utente non ha mai letto.
//
// Partita IVA in anagrafica — supplierVatNumberToWrite, fonte unica col
// pannello: solo su "simile per nome" confermato e solo se il fornitore non ne
// ha già una (mai sovrascrivere); sul fornitore creato da "nessun match", che
// nasce con quella del documento se presente. Su "per P.IVA" il fornitore ce
// l'ha già per definizione.
//
// Due rami:
//   • per_piva / simile_per_nome → P.IVA (se dovuta), poi collega il
//                                  fornitore esistente.
//   • nessun_match              → crea il fornitore con la P.IVA, poi lo
//                                  collega.
//
// Impresa digitata a mano (manual): oltre a guidare la proposta, alla conferma
// diventa correzione del documento (document_field_overrides, R10 7b) —
// ragione sociale e P.IVA, decise da manualInstallerOverrides. Mai in
// extracted_metadata.
//
// ORDINE (non invertire): correzioni del documento per prime, poi P.IVA del
// fornitore, collegamento per ultimo. Sul fornitore: se la P.IVA del
// documento risulta già di un altro fornitore (idx_suppliers_builder_vat), il
// match per nome era sbagliato e si abortisce TUTTO prima che il collegamento
// esista. Con il collegamento scritto per primo, lo stesso errore lascerebbe
// in piedi un collegamento al fornitore sbagliato.
//
// Non transazionale, stesso tradeoff di createSupplier
// (residences/[id]/fornitori/actions.ts): supabase-js su REST non espone una
// transazione multi-statement. Se il collegamento fallisce dopo la prima
// scrittura, resta uno stato incompleto ma mai corrotto — il fornitore creato,
// oppure la P.IVA registrata sul fornitore confermato dall'umano — senza
// collegamento. Il messaggio d'errore dice quale dei due.
//
// Recupero dopo quel fallimento: ricaricando, la proposta si ricalcola. Se il
// documento porta una P.IVA, ora il fornitore la ha, l'esito è "per P.IVA"
// sullo stesso fornitore e ritentare non duplica nulla. Senza P.IVA il
// recupero passa dal nome e NON è garantito in due casi, provati come limiti
// in scripts/verify-supplier-match.mjs:
//   • omonimi già in anagrafica: la proposta indica il primo per id, che può
//     non essere il fornitore appena creato;
//   • ragione sociale di sole forme societarie ("S.r.l."): la chiave di nome è
//     null, l'esito resta "nessun match" e ritentare crea un doppione.
export async function confirmSupplierProposal(input: {
  documentId: string
  expected: SupplierProposalExpectation
  // Impresa digitata a mano: usata SOLO se l'impresa effettiva (correzione >
  // verbale) non ha ragione sociale (resolveProposalInstaller), altrimenti
  // ignorata. Mai scritta in extracted_metadata.
  manual?: ManualInstaller | null
}): Promise<ConfirmSupplierProposalResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedSupplierLinker(supabase)
  if ('error' in auth) return { error: auth.error }

  const { documentId, expected, manual } = input
  if (!documentId || !expected) return { error: 'Parametri non validi' }

  // RLS "documents: admin e super_admin gestiscono" (002): un documento fuori
  // dal costruttore dell'utente torna come nessuna riga, non come errore.
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('residence_id, unit_id, title, doc_type, sistema, extracted_metadata')
    .eq('id', documentId)
    .maybeSingle()

  if (docError) return { error: `Errore lettura documento: ${docError.message}` }
  if (!doc) return { error: 'Documento non trovato o non accessibile' }

  // documents.sistema è TEXT senza CHECK (026): il valore in colonna non è
  // garantito tra i 14 sistemi. supplier_installations il CHECK ce l'ha (039),
  // ma rivalidare qui dà un messaggio leggibile invece di una violazione
  // grezza — e impedisce che un valore fuori lista arrivi al ricalcolo.
  if (doc.sistema !== null && !(SISTEMI as string[]).includes(doc.sistema)) {
    return { error: 'Il sistema del documento non è valido: correggi prima la classificazione.' }
  }

  // Correzioni manuali del documento (048): l'impresa della proposta è quella
  // EFFETTIVA, correzione > verbale, come nel pannello (resolveProposalInstaller,
  // fonte unica). SELECT con il client dell'utente: la RLS della 048 delega a
  // documents, che il super_admin del builder legge.
  const { data: overrideRows, error: overridesError } = await supabase
    .from('document_field_overrides')
    .select('for_doc_type, field_key, value, set_by, set_at')
    .eq('document_id', documentId)
  if (overridesError) {
    console.error('[confirmSupplierProposal] lettura correzioni fallita', { documentId, overridesError })
    return { error: 'Errore tecnico nella lettura delle correzioni del documento, riprova.' }
  }

  // Verbale jsonb: letto in difesa, accettate solo stringhe.
  const metadata = (doc.extracted_metadata ?? {}) as Record<string, unknown>
  const verbaleInstaller = {
    ragione_sociale_installatore: typeof metadata.ragione_sociale_installatore === 'string'
      ? metadata.ragione_sociale_installatore
      : null,
    partita_iva_installatore: typeof metadata.partita_iva_installatore === 'string'
      ? metadata.partita_iva_installatore
      : null,
  }
  const currentOverrideRows = (overrideRows ?? []) as OverrideRow[]
  const installer = resolveProposalInstaller(doc.doc_type, verbaleInstaller, currentOverrideRows, manual)
  if (installer.manualError !== null) return { error: installer.manualError }
  const { ragioneSociale, partitaIva } = installer

  // Correzioni che l'impresa digitata a mano lascia sul documento (R10, 7b).
  // Decise qui, prima di qualunque scrittura, così un valore non valido rifiuta
  // tutto; scritte più sotto, prima di fornitore e collegamento.
  const overridePlan = manualInstallerOverrides(doc.doc_type, verbaleInstaller, currentOverrideRows, manual)
  if ('error' in overridePlan) return { error: overridePlan.error }

  // Stessi due scope di documenti/page.tsx: anagrafica builder-wide,
  // collegamenti della sola residenza del documento.
  const [{ data: fornitori, error: suppliersError }, { data: installazioni, error: installationsError }] =
    await Promise.all([
      supabase
        .from('suppliers')
        .select('id, name, vat_number')
        .eq('builder_id', auth.builderId),
      supabase
        .from('supplier_installations')
        .select('supplier_id, sistema')
        .eq('residence_id', doc.residence_id),
    ])

  const readError = suppliersError ?? installationsError
  if (readError) return { error: `Errore lettura anagrafica: ${readError.message}` }

  const proposal = buildSupplierProposal({
    docType: doc.doc_type as DocType | null,
    sistema: doc.sistema as Sistema | null,
    ragioneSociale,
    partitaIva,
    fornitori: (fornitori ?? []) as SupplierProposalCandidate[],
    installazioni: (installazioni ?? []) as SupplierInstallationRef[],
  })

  if (proposal.kind === 'non_applicabile') {
    return { error: 'Questo documento non propone un fornitore da collegare.' }
  }
  if (proposal.kind === 'impresa_mancante') {
    return { error: 'Impresa installatrice non rilevata nel documento: inserisci la ragione sociale.' }
  }
  if (proposal.kind === 'sistema_mancante') {
    return { error: 'Sistema non classificato: correggi prima la classificazione.' }
  }
  if (proposal.kind === 'gia_collegato') {
    return { error: `${proposal.supplier.name} è già collegato per questo sistema in questa residenza: non c'è nulla da scrivere.` }
  }

  const serverSupplierId = proposal.kind === 'nessun_match' ? null : proposal.supplier.id
  const vatNumberToWrite = supplierVatNumberToWrite(proposal)
  if (
    proposal.kind !== expected.kind
    || proposal.sistema !== expected.sistema
    || serverSupplierId !== expected.supplierId
    || vatNumberToWrite !== expected.vatNumber
  ) {
    return { error: PROPOSAL_CHANGED_ERROR }
  }

  // PRIMA riga scritta: l'impresa digitata a mano diventa correzione del
  // documento (document_field_overrides), prima di fornitore e collegamento.
  // "Collegamento prima, correzione dopo" è il flusso dell'utente, non l'ordine
  // delle scritture: se il collegamento fallisce, la correzione resta sul
  // documento (è un dato del documento, vero a prescindere dal collegamento) e
  // la pagina la mostra; l'ordine inverso lascerebbe un collegamento al
  // fornitore appena creato con un documento che continua a non riportare
  // l'impresa. Scrittura col service client: l'accesso al documento è già
  // provato dalla lettura sopra, sotto RLS, del super_admin del builder.
  let overridesWritten = 0
  if (overridePlan.writes.length > 0) {
    const svc = createServiceClient()
    for (const w of overridePlan.writes) {
      const res = await upsertDocumentFieldOverride(svc, {
        documentId,
        forDocType: doc.doc_type as string,
        fieldKey: w.fieldKey,
        value: w.value,
        userId: auth.user.id,
        logTag: '[confirmSupplierProposal]',
        audit: {
          residenceId: doc.residence_id as string,
          unitId: (doc.unit_id as string | null) ?? null,
          title: (doc.title as string | null) ?? null,
          actorRole: 'super_admin',
          actorName: auth.fullName,
          source: 'proposta_fornitore',
        },
      })
      if ('error' in res) {
        if (overridesWritten > 0) revalidatePath(`/admin/residences/${doc.residence_id}/documenti`)
        return {
          error: `${res.error} Nessun fornitore è stato creato o collegato.`
            + (overridesWritten > 0 ? ' Ricarica la pagina: una parte delle correzioni è già salvata sul documento.' : ''),
        }
      }
      overridesWritten++
    }
  }
  const documentiPath = `/admin/residences/${doc.residence_id}/documenti`
  // Da qui una correzione può essere già scritta: ogni uscita con errore
  // rinfresca la pagina (il form manuale non c'è più, il nome è effettivo) e lo
  // dice, così chi legge sa che ritentare non richiede di riscrivere l'impresa.
  const fail = (error: string): ConfirmSupplierProposalResult => {
    if (overridesWritten === 0) return { error }
    revalidatePath(documentiPath)
    return { error: `${error} L'impresa è già salvata come correzione del documento.` }
  }

  let supplierId: string
  // Cosa è già scritto quando si arriva al collegamento: serve solo al
  // messaggio di un fallimento a metà, che deve dire cosa è rimasto.
  let createdName: string | null = null
  let vatRegisteredOn: string | null = null

  if (proposal.kind === 'nessun_match') {
    // residence_id = residenza di prima creazione (039): quella del documento.
    const { data: created, error: createError } = await supabase
      .from('suppliers')
      .insert({
        residence_id: doc.residence_id,
        builder_id: auth.builderId,
        name: proposal.ragioneSociale,
        vat_number: vatNumberToWrite,
      })
      .select('id')
      .single()

    if (createError || !created) {
      // Collisione possibile solo per una scrittura concorrente: se il ricalcolo
      // sopra avesse visto quella P.IVA, l'esito sarebbe stato "per P.IVA".
      if (createError && isVatUniqueViolation(createError.message)) {
        return fail(`Nessun fornitore creato: la partita IVA ${vatNumberToWrite} del documento risulta già di un altro fornitore di questo costruttore. Ricarica la pagina: la proposta lo indicherà.`)
      }
      return fail(`Errore creazione fornitore: ${createError ? friendlySupplierError(createError.message) : 'sconosciuto'}`)
    }
    supplierId = created.id as string
    createdName = proposal.ragioneSociale
  } else {
    supplierId = proposal.supplier.id

    if (vatNumberToWrite !== null) {
      // Solo su simile_per_nome (supplierVatNumberToWrite). Il filtro
      // vat_number IS NULL rende il "mai sovrascrivere" vero anche contro una
      // scrittura concorrente fra la lettura sopra e questo UPDATE: zero righe
      // = il fornitore ha ormai una P.IVA, e la frase letta ("verrà registrata")
      // non è più vera.
      const { data: updated, error: vatError } = await supabase
        .from('suppliers')
        .update({ vat_number: vatNumberToWrite })
        .eq('id', supplierId)
        .is('vat_number', null)
        .select('id')

      if (vatError) {
        if (isVatUniqueViolation(vatError.message)) {
          return fail(`Collegamento non creato: la partita IVA ${vatNumberToWrite} del documento risulta di un altro fornitore di questo costruttore, quindi ${proposal.supplier.name} non è l'impresa della dichiarazione — il match per nome era sbagliato.`)
        }
        return fail(`Errore registrazione partita IVA: ${vatError.message}`)
      }
      if (!updated || updated.length === 0) return fail(PROPOSAL_CHANGED_ERROR)

      vatRegisteredOn = proposal.supplier.name
    }
  }

  const { error: installError } = await supabase
    .from('supplier_installations')
    .insert({
      supplier_id: supplierId,
      residence_id: doc.residence_id,
      sistema: proposal.sistema,
      source: 'documento',
      source_document_id: documentId,
    })

  if (installError) {
    const reason = installationInsertError(installError)
    // Qualcosa ormai è scritto: la pagina va rinfrescata comunque, o la
    // proposta continuerebbe a descrivere uno stato che non esiste più.
    if (createdName !== null) {
      revalidatePath(documentiPath)
      const conPiva = vatNumberToWrite !== null ? ` con partita IVA ${vatNumberToWrite}` : ''
      return fail(`Fornitore ${createdName} creato${conPiva}, ma collegamento non riuscito. ${reason} Ricarica la pagina per riprovare.`)
    }
    if (vatRegisteredOn !== null) {
      revalidatePath(documentiPath)
      return fail(`Partita IVA ${vatNumberToWrite} registrata su ${vatRegisteredOn}, ma collegamento non riuscito. ${reason} Ricarica la pagina per riprovare.`)
    }
    return fail(reason)
  }

  revalidatePath(documentiPath)
  return { success: true }
}

// ============================================================
// Correzioni manuali dei campi estratti (R10, tabella
// document_field_overrides, migrazione 048). Vivono sopra i due verbali AI,
// che non si toccano mai: salvare = upsert, ripristinare il valore AI =
// DELETE (stato corrente, lo storico sta in activity_events: evento
// documento_corretto, migrazione 049).
//
// Autorizzazione: admin e super_admin con lo scope di authorizeDocumentActor
// (residenza assegnata / builder). Scrittura solo via service role: la 048
// non concede INSERT/UPDATE/DELETE ad authenticated. Il DB non ha CHECK su
// field_key né su for_doc_type, quindi chiave e valore si validano qui con le
// stesse funzioni pure che usa il merge in lettura.
// ============================================================

export type SaveDocumentFieldOverrideResult = { success: true } | { error: string }
export type ClearDocumentFieldOverrideResult = { success: true } | { error: string }

const OVERRIDE_TECH_ERROR = 'Errore tecnico, riprova.'

// Unica scrittura di una correzione (upsert sulla chiave primaria), usata da
// "Correggi dati" (saveDocumentFieldOverride) e dalla conferma della proposta
// fornitore con impresa digitata a mano (confirmSupplierProposal). Non
// autorizza e non valida: chi chiama ha già verificato l'accesso al documento
// e normalizzato il valore (normalizeOverrideInput / manualInstallerOverrides).
// `svc` è il service client: la 048 non concede scritture ad authenticated.
//
// Scrive anche l'evento documento_corretto (un evento per CAMPO, 049). Il
// registro non blocca mai l'atto: logActivityEvent non solleva (activity-log.ts)
// e la lettura della correzione precedente, se fallisce, si logga e l'override si
// scrive lo stesso (had_previous null). L'attore viene dal chiamante, che lo ha
// letto dalla sessione: mai da input.
type CorrectionAudit = {
  residenceId: string
  unitId: string | null
  title: string | null
  actorRole: UserRole | null
  actorName: string | null
  source: CorrectionSource
}

async function upsertDocumentFieldOverride(
  svc: ReturnType<typeof createServiceClient>,
  input: {
    documentId: string; forDocType: string; fieldKey: string; value: string | null
    userId: string; logTag: string; audit: CorrectionAudit
  },
): Promise<{ ok: true } | { error: string }> {
  // Correzione manuale precedente, per il registro (mai il valore AI). Lettura
  // e upsert non sono atomici: due salvataggi concorrenti possono lasciare un
  // `previous` datato nel registro; accettato.
  let previous: PreviousOverride = { known: false }
  const { data: previousRow, error: previousError } = await svc
    .from('document_field_overrides')
    .select('value')
    .eq('document_id', input.documentId)
    .eq('for_doc_type', input.forDocType)
    .eq('field_key', input.fieldKey)
    .maybeSingle()
  if (previousError) {
    console.error(`${input.logTag} lettura correzione precedente fallita`, { documentId: input.documentId, fieldKey: input.fieldKey, previousError })
  } else {
    previous = previousRow
      ? { known: true, exists: true, value: (previousRow.value as string | null) ?? null }
      : { known: true, exists: false }
  }

  // set_at va passato: sul conflitto il DO UPDATE aggiorna solo le colonne presenti.
  const { error: upsertError } = await svc
    .from('document_field_overrides')
    .upsert(
      {
        document_id: input.documentId,
        for_doc_type: input.forDocType,
        field_key: input.fieldKey,
        value: input.value,
        set_by: input.userId,
        set_at: new Date().toISOString(),
      },
      { onConflict: 'document_id,for_doc_type,field_key' },
    )
  if (upsertError) {
    console.error(`${input.logTag} upsert fallito`, { documentId: input.documentId, fieldKey: input.fieldKey, upsertError })
    return { error: OVERRIDE_TECH_ERROR }
  }

  // Stesso valore già corretto a mano: l'override è riscritto (set_by/set_at),
  // ma non è un atto da registrare.
  if (!isNoopCorrection(previous, input.value)) {
    await logActivityEvent(svc, {
      residenceId: input.audit.residenceId,
      unitId: input.audit.unitId,
      eventType: 'documento_corretto',
      actorId: input.userId,
      actorRole: input.audit.actorRole,
      actorName: input.audit.actorName,
      payload: documentCorrectionPayload({
        documentId: input.documentId,
        title: input.audit.title,
        docType: input.forDocType,
        fieldKey: input.fieldKey,
        action: 'impostato',
        value: input.value,
        previous,
        source: input.audit.source,
      }),
    })
  }
  return { ok: true }
}

export async function saveDocumentFieldOverride(input: {
  documentId: string
  fieldKey: string
  value: string | null
}): Promise<SaveDocumentFieldOverrideResult> {
  const { documentId, fieldKey, value } = input ?? {}
  if (typeof documentId !== 'string' || documentId === '' || typeof fieldKey !== 'string' || fieldKey === '') {
    return { error: 'Parametri non validi' }
  }
  if (value !== null && typeof value !== 'string') return { error: 'Parametri non validi' }

  const caller = await requireCaller('saveDocumentFieldOverride', ['admin', 'super_admin'])
  if ('error' in caller) return { error: caller.error }

  const svc = createServiceClient()
  const actor = await authorizeDocumentActor(svc, caller.userId, documentId, '[saveDocumentFieldOverride]')
  if (!actor.ok) return { error: actor.error }
  const { doc } = actor

  // Chiave ammessa per il doc_type corrente + valore normalizzato (vuoto = null).
  const normalized = normalizeOverrideInput(doc.doc_type, fieldKey, value)
  if ('error' in normalized) return { error: normalized.error }

  // Le chiavi dell'estrazione valgono solo sopra un'estrazione corrente
  // (anche 'fallita' o 'saltata'): senza riga da correggere sarebbero inerti.
  // L'impresa installatrice della DiCo no, sta nel verbale di classificazione.
  if (overrideRequiresExtraction(fieldKey)) {
    const { data: extraction, error: extractionError } = await svc
      .from('document_extractions')
      .select('for_doc_type')
      .eq('document_id', documentId)
      .maybeSingle()
    if (extractionError) {
      console.error('[saveDocumentFieldOverride] lettura estrazione fallita', { documentId, extractionError })
      return { error: OVERRIDE_TECH_ERROR }
    }
    if (!extractionIsCurrent(doc, extraction)) {
      return { error: 'Per correggere questo campo serve prima l’estrazione dei dati del documento.' }
    }
  }

  const written = await upsertDocumentFieldOverride(svc, {
    documentId,
    forDocType: doc.doc_type as string,
    fieldKey,
    value: normalized.value,
    userId: caller.userId,
    logTag: '[saveDocumentFieldOverride]',
    audit: {
      residenceId: doc.residence_id,
      unitId: doc.unit_id,
      title: doc.title,
      actorRole: caller.role,
      actorName: caller.fullName,
      source: 'correggi_dati',
    },
  })
  if ('error' in written) return { error: written.error }

  revalidatePath(`/admin/residences/${doc.residence_id}/documenti`)
  return { success: true }
}

export async function clearDocumentFieldOverride(input: {
  documentId: string
  fieldKey: string
}): Promise<ClearDocumentFieldOverrideResult> {
  const { documentId, fieldKey } = input ?? {}
  if (typeof documentId !== 'string' || documentId === '' || typeof fieldKey !== 'string' || fieldKey === '') {
    return { error: 'Parametri non validi' }
  }

  const caller = await requireCaller('clearDocumentFieldOverride', ['admin', 'super_admin'])
  if ('error' in caller) return { error: caller.error }

  const svc = createServiceClient()
  const actor = await authorizeDocumentActor(svc, caller.userId, documentId, '[clearDocumentFieldOverride]')
  if (!actor.ok) return { error: actor.error }
  const { doc } = actor

  if (!overridableKeys(doc.doc_type).includes(fieldKey)) {
    return { error: 'Questo campo non è modificabile per questo tipo di documento.' }
  }

  // Solo la correzione del tipo attuale: quelle di altri tipi (D6) restano.
  // Nessuna riga corrispondente = già al valore AI, esito positivo.
  const { data: deleted, error: deleteError } = await svc
    .from('document_field_overrides')
    .delete()
    .eq('document_id', documentId)
    .eq('for_doc_type', doc.doc_type as string)
    .eq('field_key', fieldKey)
    .select('value')
  if (deleteError) {
    console.error('[clearDocumentFieldOverride] delete fallito', { documentId, fieldKey, deleteError })
    return { error: OVERRIDE_TECH_ERROR }
  }

  // Un evento solo se una correzione è stata davvero tolta (come voce_archiviata
  // con count 0): "già al valore AI" non è un atto. Il registro non blocca mai
  // l'atto già compiuto (logActivityEvent non solleva).
  if (deleted && deleted.length > 0) {
    await logActivityEvent(svc, {
      residenceId: doc.residence_id,
      unitId: doc.unit_id,
      eventType: 'documento_corretto',
      actorId: caller.userId,
      actorRole: caller.role,
      actorName: caller.fullName,
      payload: documentCorrectionPayload({
        documentId,
        title: doc.title,
        docType: doc.doc_type as string,
        fieldKey,
        action: 'ripristinato',
        value: null,
        previous: { known: true, exists: true, value: (deleted[0].value as string | null) ?? null },
        source: 'correggi_dati',
      }),
    })
  }

  revalidatePath(`/admin/residences/${doc.residence_id}/documenti`)
  return { success: true }
}

// ============================================================
// Assegna / cambia / toglie l'unità di un documento (E1a, D2).
//
// Gate: requireCaller + authorizeDocumentActor, cioè lo stesso perimetro di
// authorizeResidenceActor (super_admin del builder proprietario, admin
// assegnato alla residenza) risolto a partire dal documento. L'unità di
// destinazione si legge col service client e deve essere della STESSA
// residenza del documento (checkUnitAssignment): la FK su units(id) e la
// policy di scrittura di documents non lo controllano. La scrittura passa dal
// client di SESSIONE, così la policy "documents: admin e super_admin
// gestiscono" resta la seconda barriera.
//
// Scrive l'evento documento_unita_cambiata (migrazione 051, payload piatto:
// document_id, title, doc_type, from_unit_id, to_unit_id). Solo se l'unità è
// davvero cambiata; il registro non blocca mai l'atto già compiuto.
//
// Effetti da conoscere: unit_id decide la lettura (policy "documents:
// lettura se si ha accesso") e la checklist B4 (un documento di unità non
// soddisfa le voci di condominio e dossier_admin, document-checklist.ts).
// storage_path non cambia: il file non si sposta.
// ============================================================

const UNIT_TECH_ERROR = 'Errore tecnico, riprova.'

export type SetDocumentUnitResult = { success: true } | { error: string }

export async function setDocumentUnit(input: {
  documentId: string
  unitId: string | null
  // false = non rigenerare la pagina a fine chiamata: l'assegnazione multipla
  // (tabella, E1b 7a) fa un ciclo di chiamate e ricarica una volta sola alla
  // fine. Default true: ogni altro chiamante resta com'era.
  revalidate?: boolean
}): Promise<SetDocumentUnitResult> {
  const { documentId, unitId } = input ?? {}
  const revalidate = input?.revalidate !== false
  if (typeof documentId !== 'string' || documentId === '') return { error: 'Parametri non validi' }
  if (unitId !== null && (typeof unitId !== 'string' || unitId === '')) return { error: 'Parametri non validi' }

  const caller = await requireCaller('setDocumentUnit', ['admin', 'super_admin'])
  if ('error' in caller) return { error: caller.error }

  const svc = createServiceClient()
  const actor = await authorizeDocumentActor(svc, caller.userId, documentId, '[setDocumentUnit]')
  if (!actor.ok) return { error: actor.error }
  const { doc } = actor

  // Unità di destinazione: "non trovata" è un esito di dominio (riga assente,
  // id non UUID), un errore di lettura no.
  let targetUnit: { id: string; residence_id: string } | null = null
  if (unitId !== null) {
    const { data, error } = await svc
      .from('units')
      .select('id, residence_id')
      .eq('id', unitId)
      .maybeSingle()
    if (error && error.code !== PG_INVALID_TEXT_REPRESENTATION) {
      console.error('[setDocumentUnit] lettura unità fallita', { documentId, unitId, code: error.code, message: error.message })
      return { error: UNIT_TECH_ERROR }
    }
    targetUnit = error ? null : (data as { id: string; residence_id: string } | null)
  }

  const check = checkUnitAssignment(doc, unitId, targetUnit)
  if (!check.ok) return { error: check.error }
  if (check.change === 'invariata') return { success: true }

  const supabase = await createClient()
  const { data: updated, error: updateError } = await supabase
    .from('documents')
    .update({ unit_id: unitId })
    .eq('id', documentId)
    .eq('residence_id', doc.residence_id)
    .select('id')
  if (updateError) {
    console.error('[setDocumentUnit] update fallito', { documentId, unitId, code: updateError.code, message: updateError.message })
    return { error: UNIT_TECH_ERROR }
  }
  // La RLS può filtrare la riga senza errore: zero righe = non aggiornato.
  if (!updated || updated.length === 0) return { error: 'Documento non trovato o non accessibile' }

  await logActivityEvent(svc, {
    residenceId: doc.residence_id,
    unitId: documentUnitChangeEventUnitId(doc.unit_id, unitId),
    eventType: 'documento_unita_cambiata',
    actorId: caller.userId,
    actorRole: caller.role,
    actorName: caller.fullName,
    payload: documentUnitChangePayload({
      documentId,
      title: doc.title,
      docType: doc.doc_type,
      fromUnitId: doc.unit_id,
      toUnitId: unitId,
    }),
  })

  if (revalidate) revalidatePath(`/admin/residences/${doc.residence_id}/documenti`)
  return { success: true }
}

// ============================================================
// Anteprima del documento (E1b). Una signed URL NUOVA a ogni chiamata, a
// scadenza breve (PREVIEW_URL_TTL_SECONDS), senza download forzato: il PDF si
// apre nel viewer nativo del browser, l'immagine in un <img>. "Apri a schermo
// intero" richiama questa action al clic, perché l'URL dell'iframe scade.
//
// Doppio controllo: authorizeDocumentActor (super_admin del builder
// proprietario, admin assegnato alla residenza; chi non rientra riceve
// "Documento non trovato") e poi la firma con il client di SESSIONE, così la
// policy di lettura del bucket documents resta la seconda barriera. Non passa
// da /api/download, che accetta un path qualunque e forza il download.
// ============================================================

export type DocumentPreviewResult =
  | { url: string; kind: PreviewKind; expiresInSeconds: number }
  | { error: string }

export async function getDocumentPreviewUrl(input: { documentId: string }): Promise<DocumentPreviewResult> {
  const { documentId } = input ?? {}
  if (typeof documentId !== 'string' || documentId === '') return { error: 'Parametri non validi' }

  const caller = await requireCaller('getDocumentPreviewUrl', ['admin', 'super_admin'])
  if ('error' in caller) return { error: caller.error }

  const svc = createServiceClient()
  const actor = await authorizeDocumentActor(svc, caller.userId, documentId, '[getDocumentPreviewUrl]')
  if (!actor.ok) return { error: actor.error }
  const { doc } = actor

  const kind = previewKind(doc.storage_path)

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.storage_path, PREVIEW_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) {
    // Il file non c'è nello storage (esito di dominio) oppure il guasto è
    // tecnico (rete, permessi, configurazione): messaggi diversi.
    const status = (error as { statusCode?: string | number } | null)?.statusCode
    const notFound = String(status) === '404' || /not found/i.test(error?.message ?? '')
    console.error('[getDocumentPreviewUrl] firma fallita', { documentId, status, message: error?.message })
    return { error: notFound ? 'Il file di questo documento non è nello storage.' : 'Anteprima non disponibile per un problema tecnico, riprova.' }
  }

  return { url: data.signedUrl, kind, expiresInSeconds: PREVIEW_URL_TTL_SECONDS }
}

// ============================================================
// Signed URL per "Scarica in ZIP" (E1b, 7a-4). Il browser scarica i file da
// questi URL e compone lo ZIP: nessun byte passa da qui.
//
// Tutto o niente sull'autorizzazione: ogni id passa da authorizeDocumentActor
// (stesso perimetro di anteprima e assegnazione) E deve appartenere alla
// residenza corrente. Basta un id fuori perimetro o inesistente perché
// l'action risponda con un errore e NESSUN URL: una selezione con un id
// estraneo non è un errore dell'utente ma un client manomesso o uno stato
// vecchio, e non si scarica niente "a metà". Il fallimento di una singola firma
// (file assente dallo storage) invece è per-file: il resto si scarica.
// Le firme si fanno col client di SESSIONE, così la policy di lettura del bucket
// documents resta la seconda barriera (come in getDocumentPreviewUrl).
// ============================================================

export type DocumentDownloadFile = { id: string; url: string } | { id: string; error: string }
export type DocumentDownloadUrlsResult =
  | { residenceName: string; files: DocumentDownloadFile[] }
  | { error: string }

export async function getDocumentsDownloadUrls(input: {
  residenceId: string
  documentIds: string[]
}): Promise<DocumentDownloadUrlsResult> {
  const { residenceId, documentIds } = input ?? {}
  if (typeof residenceId !== 'string' || !UUID_RE.test(residenceId)) return { error: 'Parametri non validi' }
  if (!Array.isArray(documentIds) || documentIds.length === 0) return { error: 'Parametri non validi' }
  if (documentIds.some(id => typeof id !== 'string' || !UUID_RE.test(id))) return { error: 'Parametri non validi' }
  const ids = [...new Set(documentIds)]
  if (ids.length > ZIP_MAX_FILES) {
    return { error: `Si possono scaricare al massimo ${ZIP_MAX_FILES} documenti alla volta.` }
  }

  const caller = await requireCaller('getDocumentsDownloadUrls', ['admin', 'super_admin'])
  if ('error' in caller) return { error: caller.error }

  const svc = createServiceClient()
  const actors = await Promise.all(
    ids.map(id => authorizeDocumentActor(svc, caller.userId, id, '[getDocumentsDownloadUrls]')),
  )
  const technical = actors.find(a => !a.ok && a.status >= 500)
  if (technical && !technical.ok) return { error: technical.error }
  if (actors.some(a => !a.ok || a.doc.residence_id !== residenceId)) {
    return { error: 'Alcuni documenti non sono di questa residenza o non sono accessibili. Nessun file scaricato.' }
  }
  const docs = actors.flatMap(a => (a.ok ? [a.doc] : []))

  const { data: residence, error: residenceError } = await svc
    .from('residences')
    .select('name')
    .eq('id', residenceId)
    .maybeSingle()
  if (residenceError || !residence) {
    console.error('[getDocumentsDownloadUrls] lettura residences fallita', { residenceId, message: residenceError?.message })
    return { error: 'Errore tecnico, riprova' }
  }

  const supabase = await createClient()
  const { data: signed, error: signError } = await supabase.storage
    .from('documents')
    .createSignedUrls(docs.map(d => d.storage_path), ZIP_URL_TTL_SECONDS)
  if (signError || !signed) {
    console.error('[getDocumentsDownloadUrls] firma fallita', { residenceId, message: signError?.message })
    return { error: 'Download non disponibile per un problema tecnico, riprova.' }
  }

  const byPath = new Map(signed.map(s => [s.path, s]))
  const files: DocumentDownloadFile[] = docs.map(d => {
    const s = byPath.get(d.storage_path)
    if (s?.signedUrl) return { id: d.id, url: s.signedUrl }
    console.error('[getDocumentsDownloadUrls] firma del file fallita', { documentId: d.id, message: s?.error })
    return { id: d.id, error: 'File non trovato nello storage' }
  })
  return { residenceName: residence.name as string, files }
}

// ============================================================
// Elimina documenti (E1b, 7b). Azione irreversibile, singola o multipla: le due
// action sotto valgono per entrambe. Regole pure in document-delete.ts
// (verify:docdelete).
//
// Il DB non blocca niente (supplier_installations SET NULL, attachments
// CASCADE), quindi il blocco è qui: checkDocumentsDeletable lo calcola
// all'apertura della finestra di conferma, che su un bloccato non offre il
// bottone Elimina; deleteDocuments lo ripete, perché il client non è una barriera
// e lo stato può essere cambiato nel frattempo. Basta un bloccato e non si
// elimina niente.
//
// Sequenza di deleteDocuments, nell'ordine:
//   1. DELETE in un solo statement col client di SESSIONE: atomico (tutto il
//      multiplo o niente) e la policy "documents: admin e super_admin
//      gestiscono" resta la seconda barriera. Estrazioni e correzioni spariscono
//      in CASCADE.
//   2. Un evento documento_eliminato per documento, con lo snapshot: scritto
//      PRIMA di toccare il file, così il path resta tracciato anche se il
//      processo si interrompe.
//   3. Rimozione dei file col client di SESSIONE (policy "documents bucket:
//      delete scoped residenza"), solo per i documenti il cui evento è stato
//      scritto: senza evento il file resta, ed è l'unica traccia
//      (/api/reconcile-documents lo mostra come orfano).
// Il registro è append-only, quindi un file non rimosso è una riga a sé
// (documento_file_non_rimosso). Nessun rollback: il documento è già eliminato.
//
// Finestra nota e accettata: un'installazione collegata tra il controllo e il
// DELETE finirebbe a NULL senza errore.
// ============================================================

const DELETE_TECH_ERROR = 'Errore tecnico, nessun documento eliminato. Riprova.'
const DELETE_NOT_ACCESSIBLE_ERROR = 'Alcuni documenti non sono di questa residenza o non sono accessibili. Nessun documento eliminato.'

type DeleteTarget = { userId: string; role: UserRole; fullName: string | null; ids: string[] }

// Input, ruolo e perimetro, condivisi dalle due action. Tutto o niente: basta un
// id fuori residenza o inesistente perché l'action risponda con un errore.
async function authorizeDelete(
  svc: ReturnType<typeof createServiceClient>,
  action: string,
  input: { residenceId: string; documentIds: string[] },
): Promise<DeleteTarget | { error: string }> {
  const { residenceId, documentIds } = input ?? {}
  if (typeof residenceId !== 'string' || !UUID_RE.test(residenceId)) return { error: 'Parametri non validi' }
  if (!Array.isArray(documentIds) || documentIds.length === 0) return { error: 'Parametri non validi' }
  if (documentIds.some(id => typeof id !== 'string' || !UUID_RE.test(id))) return { error: 'Parametri non validi' }
  const ids = [...new Set(documentIds)]
  if (ids.length > DELETE_MAX_DOCUMENTS) {
    return { error: `Si possono eliminare al massimo ${DELETE_MAX_DOCUMENTS} documenti alla volta.` }
  }

  const caller = await requireCaller(action, ['admin', 'super_admin'])
  if ('error' in caller) return { error: caller.error }

  const actors = await Promise.all(ids.map(id => authorizeDocumentActor(svc, caller.userId, id, `[${action}]`)))
  const technical = actors.find(a => !a.ok && a.status >= 500)
  if (technical && !technical.ok) return { error: technical.error }
  if (actors.some(a => !a.ok || a.doc.residence_id !== residenceId)) return { error: DELETE_NOT_ACCESSIBLE_ERROR }

  return { userId: caller.userId, role: caller.role, fullName: caller.fullName, ids }
}

// Chi blocca l'eliminazione. Service client: il blocco deve vedere ogni riga,
// anche quelle che la RLS nasconderebbe a chi agisce.
async function readDeleteBlockers(
  svc: ReturnType<typeof createServiceClient>,
  docs: readonly { id: string; title: string }[],
  action: string,
): Promise<{ blockers: DeleteBlocker[] } | { error: string }> {
  const ids = docs.map(d => d.id)
  const [installations, attachments] = await Promise.all([
    svc.from('supplier_installations').select('source_document_id').in('source_document_id', ids),
    svc.from('attachments').select('document_id').in('document_id', ids),
  ])
  if (installations.error || attachments.error) {
    console.error(`[${action}] lettura dei blocchi fallita`, {
      installations: installations.error?.message,
      attachments: attachments.error?.message,
    })
    return { error: DELETE_TECH_ERROR }
  }
  return {
    blockers: findDeleteBlockers(
      docs,
      (installations.data ?? []).map(r => r.source_document_id as string),
      (attachments.data ?? []).map(r => r.document_id as string),
    ),
  }
}

export type DocumentsDeletableResult = { blockers: DeleteBlocker[] } | { error: string }

// Sola lettura: all'apertura della finestra di conferma.
export async function checkDocumentsDeletable(input: {
  residenceId: string
  documentIds: string[]
}): Promise<DocumentsDeletableResult> {
  const svc = createServiceClient()
  const target = await authorizeDelete(svc, 'checkDocumentsDeletable', input)
  if ('error' in target) return { error: target.error }

  const { data, error } = await svc.from('documents').select('id, title').in('id', target.ids)
  if (error || !data) {
    console.error('[checkDocumentsDeletable] lettura documents fallita', { message: error?.message })
    return { error: 'Errore tecnico, riprova.' }
  }
  return readDeleteBlockers(svc, data as { id: string; title: string }[], 'checkDocumentsDeletable')
}

export type DeleteDocumentsResult =
  // Almeno un bloccato: non è stato eliminato niente.
  | { blockers: DeleteBlocker[] }
  | { error: string }
  // Titoli grezzi: li rende summarizeDocumentDelete.
  | { deleted: number; notDeleted: string[]; notLogged: string[]; filesLeft: string[] }

export async function deleteDocuments(input: {
  residenceId: string
  documentIds: string[]
}): Promise<DeleteDocumentsResult> {
  const svc = createServiceClient()
  const target = await authorizeDelete(svc, 'deleteDocuments', input)
  if ('error' in target) return { error: target.error }
  const { residenceId } = input
  const { ids } = target

  const { data: rows, error: readError } = await svc
    .from('documents')
    .select(DOCUMENT_SNAPSHOT_COLUMNS)
    .in('id', ids)
    .eq('residence_id', residenceId)
  if (readError || !rows) {
    console.error('[deleteDocuments] lettura snapshot fallita', { residenceId, message: readError?.message })
    return { error: DELETE_TECH_ERROR }
  }
  const snapshots = rows as unknown as DocumentSnapshot[]
  if (snapshots.length !== ids.length) return { error: DELETE_NOT_ACCESSIBLE_ERROR }

  const blocked = await readDeleteBlockers(svc, snapshots, 'deleteDocuments')
  if ('error' in blocked) return { error: blocked.error }
  if (blocked.blockers.length > 0) return { blockers: blocked.blockers }

  const supabase = await createClient()
  const { data: deletedRows, error: deleteError } = await supabase
    .from('documents')
    .delete()
    .in('id', ids)
    .eq('residence_id', residenceId)
    .select('id')
  if (deleteError) {
    console.error('[deleteDocuments] delete fallito', { residenceId, ids, code: deleteError.code, message: deleteError.message })
    return { error: DELETE_TECH_ERROR }
  }
  // Da qui l'atto è irreversibile: nessun errore oltre questo punto fa fallire
  // l'action, ogni esito finisce nel riepilogo. La RLS può filtrare le righe
  // senza errore: vale solo ciò che è tornato.
  const deletedIds = new Set((deletedRows ?? []).map(r => r.id as string))
  const deleted = snapshots.filter(d => deletedIds.has(d.id))
  const notDeleted = snapshots.filter(d => !deletedIds.has(d.id)).map(d => d.title)
  if (notDeleted.length > 0) {
    console.error('[deleteDocuments] righe non eliminate', { residenceId, ids: snapshots.filter(d => !deletedIds.has(d.id)).map(d => d.id) })
  }

  const logged: DocumentSnapshot[] = []
  const notLogged: string[] = []
  for (const doc of deleted) {
    const ok = await logActivityEvent(svc, {
      residenceId,
      unitId: doc.unit_id,
      eventType: 'documento_eliminato',
      actorId: target.userId,
      actorRole: target.role,
      actorName: target.fullName,
      payload: documentDeletedPayload(doc),
    })
    if (ok) {
      logged.push(doc)
    } else {
      // Evento perso: il log è l'unica traccia del path, e il file resta.
      console.error('[deleteDocuments] evento non scritto, file lasciato nel bucket', { documentId: doc.id, storagePath: doc.storage_path })
      notLogged.push(doc.title)
    }
  }

  const filesLeft: string[] = []
  if (logged.length > 0) {
    const paths = logged.map(d => d.storage_path)
    let removedNames: string[] | null = null
    try {
      const { data: removed, error: removeError } = await supabase.storage.from('documents').remove(paths)
      if (removeError) console.error('[deleteDocuments] rimozione file fallita', { residenceId, message: removeError.message })
      else removedNames = (removed ?? []).map(o => o.name)
    } catch (err) {
      console.error('[deleteDocuments] rimozione file fallita', { residenceId, err })
    }

    const failures = fileRemovalFailures(paths, removedNames)
    for (const doc of logged) {
      const reason = failures.get(doc.storage_path)
      if (!reason) continue
      filesLeft.push(doc.title)
      console.error('[deleteDocuments] file non rimosso', { documentId: doc.id, storagePath: doc.storage_path, reason })
      await logActivityEvent(svc, {
        residenceId,
        unitId: doc.unit_id,
        eventType: 'documento_file_non_rimosso',
        actorId: target.userId,
        actorRole: target.role,
        actorName: target.fullName,
        payload: documentFileNotRemovedPayload(doc, reason),
      })
    }
  }

  // La pagina residenza legge anch'essa i documenti (page.tsx).
  revalidatePath(`/admin/residences/${residenceId}/documenti`)
  revalidatePath(`/admin/residences/${residenceId}`)
  return { deleted: deleted.length, notDeleted, notLogged, filesLeft }
}
