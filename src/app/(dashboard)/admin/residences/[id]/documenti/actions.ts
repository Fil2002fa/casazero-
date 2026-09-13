'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { DocumentCategory } from '@/types/database'
import { ALLOWED_DOCUMENT_MIME } from '@/lib/document-upload'
import {
  DOC_TYPES,
  SISTEMI,
  buildSupplierProposal,
  type DocType,
  type Sistema,
  type SupplierProposalCandidate,
  type SupplierInstallationRef,
} from '@/lib/document-classification'
import { friendlySupplierError } from '@/lib/supplier-errors'
import { computeResidenceChecklist } from '@/lib/document-checklist'

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
): Promise<{ user: { id: string }; builderId: string } | AuthError> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, builder_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'super_admin') {
    return { error: 'Permessi insufficienti' }
  }
  if (!profile.builder_id) return { error: 'Nessun builder associato al tuo account' }

  return { user, builderId: profile.builder_id as string }
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
async function expectationKeyExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  residenceId: string,
  expectationKey: string
): Promise<boolean> {
  const checklist = await computeResidenceChecklist(supabase, residenceId)
  return checklist.expectations.some(e => e.expectationKey === expectationKey)
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

  if (!(await expectationKeyExists(supabase, residenceId, expectationKey))) {
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
}

export type ConfirmSupplierProposalResult = { success: true } | { error: string }

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
// La partita IVA NON viene scritta in anagrafica, né sul fornitore creato né
// su quello esistente: è un concern separato (commit successivo).
//
// Due rami:
//   • per_piva / simile_per_nome → collega il fornitore esistente.
//   • nessun_match              → crea il fornitore, poi lo collega.
//
// Non transazionale, stesso tradeoff di createSupplier
// (residences/[id]/fornitori/actions.ts): supabase-js su REST non espone una
// transazione multi-statement. Se nel secondo ramo il collegamento fallisce,
// il fornitore resta creato senza collegamento — uno stato incompleto ma mai
// corrotto (nessun record a metà, nessun dato inconsistente). Qui il recupero
// è anche guidato: ricaricando, la proposta trova quel fornitore per nome ed
// esce "Collega", non un secondo "Crea", quindi ritentare non produce un
// doppione.
export async function confirmSupplierProposal(input: {
  documentId: string
  expected: SupplierProposalExpectation
}): Promise<ConfirmSupplierProposalResult> {
  const supabase = await createClient()
  const auth = await getAuthorizedSupplierLinker(supabase)
  if ('error' in auth) return { error: auth.error }

  const { documentId, expected } = input
  if (!documentId || !expected) return { error: 'Parametri non validi' }

  // RLS "documents: admin e super_admin gestiscono" (002): un documento fuori
  // dal costruttore dell'utente torna come nessuna riga, non come errore.
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('residence_id, doc_type, sistema, extracted_metadata')
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

  // Verbale jsonb: letto in difesa, accettate solo stringhe.
  const metadata = (doc.extracted_metadata ?? {}) as Record<string, unknown>
  const ragioneSociale = typeof metadata.ragione_sociale_installatore === 'string'
    ? metadata.ragione_sociale_installatore
    : null
  const partitaIva = typeof metadata.partita_iva_installatore === 'string'
    ? metadata.partita_iva_installatore
    : null

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
  if (proposal.kind === 'sistema_mancante') {
    return { error: 'Sistema non classificato: correggi prima la classificazione.' }
  }
  if (proposal.kind === 'gia_collegato') {
    return { error: `${proposal.supplier.name} è già collegato per questo sistema in questa residenza: non c'è nulla da scrivere.` }
  }

  const serverSupplierId = proposal.kind === 'nessun_match' ? null : proposal.supplier.id
  if (
    proposal.kind !== expected.kind
    || proposal.sistema !== expected.sistema
    || serverSupplierId !== expected.supplierId
  ) {
    return { error: 'La proposta è cambiata da quando hai aperto la pagina. Ricarica e rileggila prima di confermare.' }
  }

  let supplierId: string
  let createdName: string | null = null

  if (proposal.kind === 'nessun_match') {
    // residence_id = residenza di prima creazione (039): quella del documento.
    // Nessun vat_number: la P.IVA in anagrafica è il commit successivo.
    const { data: created, error: createError } = await supabase
      .from('suppliers')
      .insert({
        residence_id: doc.residence_id,
        builder_id: auth.builderId,
        name: proposal.ragioneSociale,
      })
      .select('id')
      .single()

    if (createError || !created) {
      return { error: `Errore creazione fornitore: ${createError ? friendlySupplierError(createError.message) : 'sconosciuto'}` }
    }
    supplierId = created.id as string
    createdName = proposal.ragioneSociale
  } else {
    supplierId = proposal.supplier.id
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

  const documentiPath = `/admin/residences/${doc.residence_id}/documenti`

  if (installError) {
    if (createdName !== null) {
      // Il fornitore ormai esiste: la pagina va rinfrescata comunque, o la
      // proposta continuerebbe a dire "Crea" su un fornitore già creato.
      revalidatePath(documentiPath)
      return {
        error: `Fornitore ${createdName} creato, ma collegamento non riuscito. ${installationInsertError(installError)} Ricarica la pagina per riprovare.`,
      }
    }
    return { error: installationInsertError(installError) }
  }

  revalidatePath(documentiPath)
  return { success: true }
}
