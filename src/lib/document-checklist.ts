// ============================================================
// B4 — Rilevamento documenti mancanti (Pilastro Consegna).
// Helper server-side UNICO che calcola la checklist di consegna di una
// residenza: atteso (BASE + DERIVATO) − presente − non applicabile.
// DETERMINISTICO, nessuna chiamata AI (l'AI ha già classificato in B3).
//
// Riceve il client Supabase come parametro (le pagine passano il client
// user-scoped di src/lib/supabase/server.ts:5 → la RLS fa lo scoping;
// nessun service client qui). Firma: computeResidenceChecklist(supabase, id).
//
// VINCOLO (bug class contatore/lista): `counts` è derivato dallo STESSO
// array `expectations` con una reduce, dentro questo helper. Mai una
// seconda query, mai un ricalcolo altrove.
// ============================================================
import type { createClient } from '@/lib/supabase/server'
import type { CompletionMode, ItemActivation } from '@/types/database'
import {
  DOC_TYPE_LABELS,
  SISTEMA_LABELS,
  type DocType,
  type Sistema,
} from '@/lib/document-classification'
import {
  isCountable,
  LIVE_STATUS_FIELDS,
  LIVE_STATUS_TEMPLATE_FIELDS,
} from '@/lib/maintenance-status'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

// Il client tipizzato inferisce `maintenance_templates` come array dal parse
// della select string; a runtime è un oggetto (FK many-to-one). Stesso cast
// `as unknown as` degli altri chiamanti di isCountable (es. (app)/manutenzioni
// /page.tsx:74) per riusare l'helper senza reimplementarlo.
type PlanRow = {
  template_id: string
  status: string
  next_due_date: string | null
  completion_mode: CompletionMode | null
  activation_status: ItemActivation
  maintenance_templates: { completion_mode: CompletionMode | null; is_active: boolean } | null
}

// Scope della checklist. In v1 si usano solo condominium/dossier_admin/residence
// ('unit' resta nello schema 027 ma la risoluzione per-unità arriva con B4.5).
export type ChecklistScope = 'unit' | 'condominium' | 'dossier_admin' | 'residence'
type CountedScope = 'condominium' | 'dossier_admin' | 'residence'

export type ChecklistOrigin = 'base' | 'derived' | 'both'

export type MatchingDocument = {
  id: string
  label: string
  // reviewed_by non nullo = confermato da umano; nullo = auto-conferma AI.
  // La provenienza è informativa: il match NON dipende da reviewed_by
  // (PRESENTE = classification_status 'completata', decisione B4 C4).
  reviewedBy: string | null
}

export type ChecklistExpectation = {
  expectationKey: string
  scope: ChecklistScope
  docType: DocType
  sistema: Sistema | null
  label: string
  origin: ChecklistOrigin
  sourceTemplateIds: string[]
  satisfied: boolean
  notApplicable: boolean
  expectedFrom: string | null
  note: string | null
  matchingDocuments: MatchingDocument[]
}

export type ScopeCounts = {
  total: number
  satisfied: number
  missing: number
  notApplicable: number
}

export type ChecklistResult = {
  expectations: ChecklistExpectation[]
  counts: Record<CountedScope, ScopeCounts>
  warnings: string[]
}

// ------------------------------------------------------------
// MAPPA DERIVATA — template_id UUID → attese documentali.
// Agganciata agli UUID (verificati sul DB il 23/07/2026), MAI ai titoli:
// i titoli dei template sono descrizioni editabili e solo 2 su 7 combaciano
// col testo atteso (FASE 0 B4 C4). Un rename del titolo non deve rompere la
// mappa. La guardia in fondo avvisa se un UUID sparisce dal catalogo attivo.
// Solo dai 19 del catalogo v2: le proposte B5 fuori catalogo NON generano
// attese in v1. I template scope=unit (pompa di calore, VMC) generano attese
// scope=residence: in v1 il per-unità non esiste, il documento deve esistere
// "da qualche parte nella residenza" (decisione B4 C4).
// ------------------------------------------------------------
type DerivedSpec = { docType: DocType; sistema: Sistema | null; scope: ChecklistScope }

const DERIVED_MAP: Record<string, DerivedSpec[]> = {
  // Manutenzione impianto climatizzazione / pompa di calore (scope template: unit)
  'fc529672-3045-4799-8a10-01614a2a1dc3': [
    { docType: 'libretto_impianto',    sistema: 'termico', scope: 'residence' },
    { docType: 'dich_conformita_dm37', sistema: 'termico', scope: 'residence' },
    { docType: 'manuale',              sistema: 'termico', scope: 'residence' },
    { docType: 'garanzia',             sistema: 'termico', scope: 'residence' },
  ],
  // VMC: sostituzione filtri (unit)
  '010214e7-7058-4d5d-a70c-69654aa66fa0': [
    { docType: 'dich_conformita_dm37', sistema: 'vmc', scope: 'residence' },
    { docType: 'manuale',              sistema: 'vmc', scope: 'residence' },
  ],
  // VMC: pulizia condotti (unit) — stesse due attese: collidono con quelle sopra
  '70b3f1dd-f0ad-427c-9d38-f99143900778': [
    { docType: 'dich_conformita_dm37', sistema: 'vmc', scope: 'residence' },
    { docType: 'manuale',              sistema: 'vmc', scope: 'residence' },
  ],
  // Manutenzione impianto fotovoltaico (condominium)
  '7296f859-9ad6-45bb-8d1a-298f93a50146': [
    { docType: 'dich_conformita_dm37', sistema: 'fotovoltaico', scope: 'condominium' },
    { docType: 'garanzia',             sistema: 'fotovoltaico', scope: 'condominium' },
  ],
  // Verifica linee vita (condominium)
  '1fd67a1e-8381-4ddc-b383-25739150dca2': [
    { docType: 'cert_linee_vita', sistema: null, scope: 'condominium' },
  ],
  // Verifica messa a terra condominiale (condominium) — collide con la riga
  // base condominium:dich_conformita_dm37:elettrico → origin 'both'
  '4a74e428-62dc-436f-813f-eb58ddfa9bfe': [
    { docType: 'dich_conformita_dm37', sistema: 'elettrico', scope: 'condominium' },
  ],
  // Controllo antenna TV/parabola (condominium)
  '3fb467a8-157a-4c31-88f5-2d8dd61f7527': [
    { docType: 'dich_conformita_dm37', sistema: 'altro', scope: 'condominium' },
  ],
}

// Chiave canonica anti-duplicazione. Placeholder NULL = stringa vuota, allineato
// al commento della migrazione 027: coalesce(sistema, '').
function expectationKey(scope: string, docType: string, sistema: string | null): string {
  return `${scope}:${docType}:${sistema ?? ''}`
}

// Label di un'attesa derivata da doc_type + (eventuale) sistema, dalle costanti
// di document-classification. Le attese BASE usano invece la label curata in DB.
function derivedLabel(docType: DocType, sistema: Sistema | null): string {
  const base = DOC_TYPE_LABELS[docType]
  return sistema ? `${base} · ${SISTEMA_LABELS[sistema]}` : base
}

const SCOPE_RANK: Record<string, number> = {
  condominium: 0,
  dossier_admin: 1,
  residence: 2,
  unit: 3,
}

export async function computeResidenceChecklist(
  supabase: ServerSupabase,
  residenceId: string
): Promise<ChecklistResult> {
  const warnings: string[] = []

  // Le 5 query sono indipendenti fra loro: nessuna usa l'output di un'altra
  // (il merge/match che segue legge solo i risultati già arrivati). In
  // Promise.all invece che sequenziali — stesso risultato, ~300ms → ~176ms
  // misurato su Cavaccio (FASE 0 C5-0).
  const [
    { data: baseRows },
    { data: planRows },
    { data: catalogRows },
    { data: excRows },
    { data: docRows },
  ] = await Promise.all([
    // (a) BASE — righe di template attive, ordinate per sort_order.
    supabase
      .from('document_checklist_template')
      .select('scope, doc_type, sistema, label, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),

    // (b) DERIVATO — piano attivo della residenza (forma canonica di
    // (app)/manutenzioni/page.tsx:47-54 + template_id). Filtro 'inclusa' in
    // SQL, is_active del template in JS via isCountable (riuso).
    supabase
      .from('maintenance_items')
      .select(`template_id, ${LIVE_STATUS_FIELDS}, maintenance_templates!inner(${LIVE_STATUS_TEMPLATE_FIELDS})`)
      .eq('residence_id', residenceId)
      .eq('activation_status', 'inclusa'),

    // (f) GUARDIA UUID — ogni UUID della mappa deve esistere fra i template
    // is_active del catalogo; altrimenti warning (le sue attese non nascono).
    supabase
      .from('maintenance_templates')
      .select('id')
      .eq('is_active', true),

    // (d) ECCEZIONI — per residenza, unit_id IS NULL (v1). Annotano un'attesa
    // esistente (not_applicable / expected_from / note); una chiave orfana
    // che non corrisponde a nessuna attesa viene ignorata più sotto.
    supabase
      .from('residence_checklist_exception')
      .select('expectation_key, not_applicable, expected_from, note')
      .eq('residence_id', residenceId)
      .is('unit_id', null),

    // (e) MATCH — documenti confermati (PRESENTE = classification_status
    // 'completata'). Un documento soddisfa un'attesa se doc_type combacia E
    // (sistema attesa NULL, oppure sistema doc NULL, oppure combaciano:
    // asimmetria voluta). Scope residence = qualunque documento della
    // residenza; condominium/dossier_admin = solo documenti con unit_id NULL.
    supabase
      .from('documents')
      .select('id, title, file_name, doc_type, sistema, unit_id, reviewed_by')
      .eq('residence_id', residenceId)
      .eq('classification_status', 'completata'),
  ])

  const activeTemplateIds = new Set<string>()
  for (const row of (planRows ?? []) as unknown as PlanRow[]) {
    if (isCountable(row)) activeTemplateIds.add(row.template_id)
  }

  const catalogIds = new Set((catalogRows ?? []).map(r => r.id as string))
  for (const uuid of Object.keys(DERIVED_MAP)) {
    if (!catalogIds.has(uuid)) {
      warnings.push(
        `Mappa derivata: template ${uuid} non è più fra i template attivi del catalogo — le sue attese sono state saltate`
      )
    }
  }

  // MERGE (c) — BASE e DERIVATO in una Map per expectation_key: una collisione
  // arricchisce l'attesa esistente, non ne crea una seconda.
  const byKey = new Map<string, ChecklistExpectation>()
  const sortByKey = new Map<string, number>()

  for (const b of baseRows ?? []) {
    const scope = b.scope as ChecklistScope
    const docType = b.doc_type as DocType
    const sistema = (b.sistema ?? null) as Sistema | null
    const key = expectationKey(scope, docType, sistema)
    byKey.set(key, {
      expectationKey: key,
      scope,
      docType,
      sistema,
      label: b.label as string,
      origin: 'base',
      sourceTemplateIds: [],
      satisfied: false,
      notApplicable: false,
      expectedFrom: null,
      note: null,
      matchingDocuments: [],
    })
    sortByKey.set(key, (b.sort_order as number | null) ?? Number.MAX_SAFE_INTEGER)
  }

  for (const templateId of activeTemplateIds) {
    const specs = DERIVED_MAP[templateId]
    if (!specs) continue
    for (const spec of specs) {
      const key = expectationKey(spec.scope, spec.docType, spec.sistema)
      const existing = byKey.get(key)
      if (existing) {
        // base → both; derived resta derived (accumula i template sorgente);
        // both resta both.
        if (existing.origin === 'base') existing.origin = 'both'
        if (!existing.sourceTemplateIds.includes(templateId)) {
          existing.sourceTemplateIds.push(templateId)
        }
      } else {
        byKey.set(key, {
          expectationKey: key,
          scope: spec.scope,
          docType: spec.docType,
          sistema: spec.sistema,
          label: derivedLabel(spec.docType, spec.sistema),
          origin: 'derived',
          sourceTemplateIds: [templateId],
          satisfied: false,
          notApplicable: false,
          expectedFrom: null,
          note: null,
          matchingDocuments: [],
        })
      }
    }
  }

  // (d) ECCEZIONI — annotano un'attesa esistente (not_applicable /
  // expected_from / note); una chiave orfana che non corrisponde a nessuna
  // attesa viene ignorata.
  for (const e of excRows ?? []) {
    const exp = byKey.get(e.expectation_key as string)
    if (!exp) continue
    exp.notApplicable = (e.not_applicable as boolean) ?? false
    exp.expectedFrom = (e.expected_from as string | null) ?? null
    exp.note = (e.note as string | null) ?? null
  }

  // (e) MATCH — vedi regola sopra (docRows fetchato in Promise.all).
  const docs = docRows ?? []
  for (const exp of byKey.values()) {
    for (const doc of docs) {
      if (doc.doc_type !== exp.docType) continue
      if ((exp.scope === 'condominium' || exp.scope === 'dossier_admin') && doc.unit_id !== null) {
        continue
      }
      const docSistema = (doc.sistema ?? null) as Sistema | null
      if (exp.sistema !== null && docSistema !== null && docSistema !== exp.sistema) continue
      exp.matchingDocuments.push({
        id: doc.id as string,
        label: (doc.title as string | null) ?? (doc.file_name as string),
        reviewedBy: (doc.reviewed_by as string | null) ?? null,
      })
    }
    exp.satisfied = exp.matchingDocuments.length > 0
  }

  // Array unico ordinato: per scope, poi sort_order base (le attese solo-derivate
  // in coda), poi chiave come tiebreak stabile.
  const expectations = [...byKey.values()].sort((a, b) => {
    const sr = (SCOPE_RANK[a.scope] ?? 99) - (SCOPE_RANK[b.scope] ?? 99)
    if (sr !== 0) return sr
    const sa = sortByKey.get(a.expectationKey) ?? Number.MAX_SAFE_INTEGER
    const sb = sortByKey.get(b.expectationKey) ?? Number.MAX_SAFE_INTEGER
    if (sa !== sb) return sa - sb
    return a.expectationKey.localeCompare(b.expectationKey)
  })

  // counts: UNICA fonte = l'array expectations (reduce). Mai una seconda query.
  const counts: Record<CountedScope, ScopeCounts> = {
    condominium:   { total: 0, satisfied: 0, missing: 0, notApplicable: 0 },
    dossier_admin: { total: 0, satisfied: 0, missing: 0, notApplicable: 0 },
    residence:     { total: 0, satisfied: 0, missing: 0, notApplicable: 0 },
  }
  for (const exp of expectations) {
    if (exp.scope === 'unit') continue // non usato in v1
    const c = counts[exp.scope]
    c.total++
    if (exp.notApplicable) c.notApplicable++
    else if (exp.satisfied) c.satisfied++
    else c.missing++
  }

  return { expectations, counts, warnings }
}
