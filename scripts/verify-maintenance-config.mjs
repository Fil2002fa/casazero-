// ============================================================
// CasaZero — verifica delle regole di Configura per voce (3a).
// Uso:  node --experimental-strip-types scripts/verify-maintenance-config.mjs
//       (oppure: npm run verify:maintconfig)
// ------------------------------------------------------------
// COSA GARANTISCE: che src/lib/maintenance-config.ts e completion-mode.ts
// applichino le regole stabilite: valori uniformi/misti mai uniformati in
// automatico; il segnaposto "valori diversi" mai scritto e un campo non
// toccato che non finisce nel payload; whitelist a mano (nessuno spread, ogni
// campo fuori lista rifiutato); residente rifiutato sulle parti comuni;
// fornitore solo tra quelli ammessi; garanzia con trim, vuoto = NULL, tetto a
// 500; dual-write di priority derivata dalla modalità; verso promemoria status
// in_attesa e date future tenute, passate o nulle a oggi + frequenza; da
// promemoria il cancello di consegna (non consegnata, senza override, senza
// completamenti); archiviate con i soli campi di configurazione; residente <->
// amministratore senza tocchi a data e status; input mai mutati.
//
// PERCHE' ESISTE: un Configura che scrive la data sbagliata su 12 unità, che
// lascia una promemoria "scaduta" muta per il cron o che salva il segnaposto
// come valore passa il type-check e si scopre solo dopo la scrittura.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente; exit 2 = import fallito — mai confuso con un esito positivo.
// ============================================================
import { register } from 'node:module'
register('./ts-resolve-hooks.mjs', import.meta.url)

let C, M
try {
  C = await import(new URL('../src/lib/completion-mode.ts', import.meta.url).href)
  M = await import(new URL('../src/lib/maintenance-config.ts', import.meta.url).href)
} catch (err) {
  console.error(`\n✗ Impossibile importare il modulo: ${err.message}`)
  process.exit(2)
}
const { modeToPriority, priorityToMode, isCompletionMode } = C
const {
  uniformValue, buildConfigRows, buildConfigChanges, validateConfigChanges, planConfigWrite,
  MIXED_VALUE, WARRANTY_MAX_LENGTH,
} = M

let fallimenti = 0
let eseguiti = 0
function check(label, ottenuto, atteso) {
  eseguiti++
  const a = JSON.stringify(ottenuto)
  const b = JSON.stringify(atteso)
  if (a === b) return
  fallimenti++
  console.error(`✗ ${label}\n    atteso:   ${b}\n    ottenuto: ${a}`)
}

const TODAY = '2026-06-15'
const PAST = '2026-01-10'
const FUTURE = '2027-01-10'
let seq = 0
// Istanza di prova: voce t1, unità u<n> consegnata, residente (dal template), 12 mesi, futura.
const it = (o = {}) => ({
  id: o.id ?? `i${++seq}`,
  template_id: o.tpl ?? 't1',
  unit_id: o.unit === undefined ? `u${seq}` : o.unit,
  status: o.status ?? 'in_attesa',
  next_due_date: o.due === undefined ? FUTURE : o.due,
  completion_mode: o.mode ?? null,
  obligation_type: o.obl ?? null,
  activation_status: o.act ?? 'inclusa',
  frequency_months: o.freq ?? null,
  warranty_info: o.warranty ?? null,
  supplier_id: o.supplier ?? null,
  due_basis_override: o.override ?? null,
  has_completions: o.completions ?? false,
  suppliers: o.supplier ? { id: o.supplier, name: o.supplierName ?? 'Ditta' } : null,
  maintenance_templates: {
    title: o.title ?? 'Voce',
    category: o.cat ?? 'Termico',
    completion_mode: o.tplMode ?? 'residente',
    obligation_type: o.tplObl ?? 'B',
    frequency_months: o.tplFreq === undefined ? 12 : o.tplFreq,
    is_active: o.tplActive ?? true,
  },
  units: o.unit === null ? null : { delivery_date: o.delivery === undefined ? '2026-01-01' : o.delivery },
})
const clone = x => JSON.parse(JSON.stringify(x))
const planOf = (rows, changes) => planConfigWrite(rows, changes, TODAY)
const fieldsOf = (plan, id) => plan.rows.find(r => r.id === id)?.fields

// ---------------------------------------------------------------------------
// completion-mode: dual-write
// ---------------------------------------------------------------------------
check('modeToPriority promemoria', modeToPriority('promemoria'), 'N1')
check('modeToPriority residente', modeToPriority('residente'), 'N2')
check('modeToPriority amministratore', modeToPriority('amministratore'), 'N3')
check('modeToPriority null', modeToPriority(null), null)
check('priorityToMode N1', priorityToMode('N1'), 'promemoria')
check('priorityToMode N2', priorityToMode('N2'), 'residente')
check('priorityToMode N3', priorityToMode('N3'), 'amministratore')
check('priorityToMode sconosciuta', priorityToMode('N9'), null)
check('priorityToMode chiave di prototipo', priorityToMode('constructor'), null)
check('priorityToMode null', priorityToMode(null), null)
check('isCompletionMode valido', isCompletionMode('residente'), true)
check('isCompletionMode N1', isCompletionMode('N1'), false)
check('isCompletionMode non stringa', isCompletionMode(3), false)

// ---------------------------------------------------------------------------
// uniformValue
// ---------------------------------------------------------------------------
check('uniform: vuoto', uniformValue([]), { kind: 'empty' })
check('uniform: uno solo', uniformValue(['a']), { kind: 'uniform', value: 'a' })
check('uniform: tutti uguali', uniformValue(['a', 'a', 'a']), { kind: 'uniform', value: 'a' })
check('uniform: due distinti = misto', uniformValue(['a', 'b', 'a']), { kind: 'mixed', distinct: 2 })
check('uniform: null e valore = misto (mai uniformato)', uniformValue([null, 'a']), { kind: 'mixed', distinct: 2 })
check('uniform: tutti null = uniforme null', uniformValue([null, null]), { kind: 'uniform', value: null })

// ---------------------------------------------------------------------------
// buildConfigRows
// ---------------------------------------------------------------------------
{
  const items = [
    it({ id: 'a1', tpl: 't1', title: 'Beta', cat: 'Termico', mode: 'amministratore', supplier: 's1', supplierName: 'Idro' }),
    it({ id: 'a2', tpl: 't1', title: 'Beta', cat: 'Termico', mode: 'amministratore', supplier: 's1', supplierName: 'Idro' }),
    it({ id: 'b1', tpl: 't2', title: 'Alfa', cat: 'Termico', mode: 'residente', warranty: '  2 anni ' }),
    it({ id: 'b2', tpl: 't2', title: 'Alfa', cat: 'Termico', mode: 'promemoria', warranty: '2 anni' }),
    it({ id: 'c1', tpl: 't3', title: 'Antenna', cat: 'Coperture', unit: null, tplMode: 'amministratore' }),
    // archiviata: non entra nei valori del piano
    it({ id: 'b3', tpl: 't2', title: 'Alfa', cat: 'Termico', mode: 'residente', act: 'archiviata', supplier: 's9' }),
    // template spento a catalogo: non entra
    it({ id: 'd1', tpl: 't4', title: 'Spenta', tplActive: false }),
    // voce solo archiviata: non compare
    it({ id: 'e1', tpl: 't5', title: 'Solo archiviata', act: 'archiviata' }),
  ]
  const snapshot = clone(items)
  const rows = buildConfigRows(items)
  check('rows: solo le voci del piano attivo, ordinate per categoria e titolo',
    rows.map(r => r.templateId), ['t3', 't2', 't1'])
  const t1 = rows.find(r => r.templateId === 't1')
  const t2 = rows.find(r => r.templateId === 't2')
  const t3 = rows.find(r => r.templateId === 't3')
  check('rows: t1 modalità uniforme', t1.mode, { kind: 'uniform', value: 'amministratore' })
  check('rows: t1 fornitore uniforme con nome', [t1.supplier, t1.supplierName], [{ kind: 'uniform', value: 's1' }, 'Idro'])
  check('rows: t1 conteggio', t1.count, 2)
  check('rows: t2 modalità mista (promemoria + residente)', t2.mode, { kind: 'mixed', distinct: 2 })
  check('rows: t2 le archiviate non contano nel fornitore', t2.supplier, { kind: 'uniform', value: null })
  check('rows: t2 garanzia con trim uguale = uniforme', t2.warranty, { kind: 'uniform', value: '2 anni' })
  check('rows: t2 senza fornitore: nome null', t2.supplierName, null)
  check('rows: t3 parti comuni', t3.scope, 'common')
  check('rows: t1 ambito unità', t1.scope, 'unit')
  check('rows: obbligo ereditato dal template', t1.obligation, { kind: 'uniform', value: 'B' })
  check('rows: frequenza ereditata dal template', t1.frequency, { kind: 'uniform', value: 12 })
  check('rows: input non mutato', items, snapshot)

  const mixedScope = buildConfigRows([it({ tpl: 'x' }), it({ tpl: 'x', unit: null })])
  check('rows: ambito misto unità + parti comuni', mixedScope[0].scope, 'mixed')
  const mixedFreq = buildConfigRows([it({ tpl: 'x', freq: 6 }), it({ tpl: 'x', freq: 12 })])
  check('rows: frequenze diverse = valori diversi', mixedFreq[0].frequency, { kind: 'mixed', distinct: 2 })
}

// ---------------------------------------------------------------------------
// buildConfigChanges
// ---------------------------------------------------------------------------
{
  const [uni] = buildConfigRows([
    it({ tpl: 'u', mode: 'residente', supplier: 's1', warranty: 'Due anni' }),
    it({ tpl: 'u', mode: 'residente', supplier: 's1', warranty: 'Due anni' }),
  ])
  const [mix] = buildConfigRows([
    it({ tpl: 'm', mode: 'residente', supplier: 's1', warranty: 'A' }),
    it({ tpl: 'm', mode: 'promemoria', supplier: 's2', warranty: 'B' }),
  ])
  const same = { completion_mode: 'residente', supplier_id: 's1', warranty_info: 'Due anni' }
  check('changes: nessun cambio = vuoto', buildConfigChanges(uni, same), {})
  check('changes: solo la modalità cambiata', buildConfigChanges(uni, { ...same, completion_mode: 'amministratore' }),
    { completion_mode: 'amministratore' })
  check('changes: fornitore a nessuno = null scritto', buildConfigChanges(uni, { ...same, supplier_id: null }),
    { supplier_id: null })
  check('changes: garanzia svuotata = null', buildConfigChanges(uni, { ...same, warranty_info: '   ' }),
    { warranty_info: null })
  check('changes: garanzia uguale con spazi = nessun cambio', buildConfigChanges(uni, { ...same, warranty_info: '  Due anni  ' }), {})

  const allMixed = { completion_mode: MIXED_VALUE, supplier_id: MIXED_VALUE, warranty_info: MIXED_VALUE }
  check('changes: segnaposto intatto su tutti i campi = vuoto (sentinella mai scritta)', buildConfigChanges(mix, allMixed), {})
  check('changes: un solo campo misto toccato, gli altri no',
    buildConfigChanges(mix, { ...allMixed, supplier_id: 's1' }), { supplier_id: 's1' })
  check('changes: campo misto portato a un valore anche uguale a una delle unità',
    buildConfigChanges(mix, { ...allMixed, completion_mode: 'residente' }), { completion_mode: 'residente' })
  check('changes: segnaposto mai nei valori',
    JSON.stringify(buildConfigChanges(mix, allMixed)).includes(MIXED_VALUE), false)
}

// ---------------------------------------------------------------------------
// validateConfigChanges
// ---------------------------------------------------------------------------
{
  const ctx = { hasCommonAreaRows: false, allowedSupplierIds: new Set(['s1', 's2']) }
  const ctxCommon = { ...ctx, hasCommonAreaRows: true }
  const ok = (raw, c = ctx) => { const v = validateConfigChanges(raw, c); return v.ok ? v.changes : v.code }

  check('valida: modalità valida', ok({ completion_mode: 'amministratore' }), { completion_mode: 'amministratore' })
  check('valida: modalità sigla abolita', ok({ completion_mode: 'N1' }), 'modalita_non_valida')
  check('valida: modalità null', ok({ completion_mode: null }), 'modalita_non_valida')
  check('valida: residente su parti comuni rifiutato', ok({ completion_mode: 'residente' }, ctxCommon), 'residente_su_parti_comuni')
  check('valida: amministratore su parti comuni ammesso', ok({ completion_mode: 'amministratore' }, ctxCommon), { completion_mode: 'amministratore' })
  check('valida: promemoria su parti comuni ammesso', ok({ completion_mode: 'promemoria' }, ctxCommon), { completion_mode: 'promemoria' })

  check('valida: garanzia con trim', ok({ warranty_info: '  3 anni  ' }), { warranty_info: '3 anni' })
  check('valida: garanzia vuota = null', ok({ warranty_info: '   ' }), { warranty_info: null })
  check('valida: garanzia null', ok({ warranty_info: null }), { warranty_info: null })
  check('valida: garanzia 500 caratteri ok', ok({ warranty_info: 'x'.repeat(WARRANTY_MAX_LENGTH) }), { warranty_info: 'x'.repeat(WARRANTY_MAX_LENGTH) })
  check('valida: garanzia 501 caratteri rifiutata', ok({ warranty_info: 'x'.repeat(WARRANTY_MAX_LENGTH + 1) }), 'garanzia_troppo_lunga')
  check('valida: garanzia lunga solo per gli spazi ok dopo il trim', ok({ warranty_info: ' '.repeat(600) + 'a' }), { warranty_info: 'a' })
  check('valida: garanzia non stringa', ok({ warranty_info: 5 }), 'garanzia_non_valida')

  check('valida: fornitore ammesso', ok({ supplier_id: 's1' }), { supplier_id: 's1' })
  check('valida: fornitore null (nessuno)', ok({ supplier_id: null }), { supplier_id: null })
  check('valida: fornitore di un altro builder', ok({ supplier_id: 's9' }), 'fornitore_non_valido')
  check('valida: fornitore non stringa', ok({ supplier_id: 7 }), 'fornitore_non_valido')
  check('valida: il segnaposto non è un fornitore', ok({ supplier_id: MIXED_VALUE }), 'fornitore_non_valido')
  check('valida: il segnaposto non è una modalità', ok({ completion_mode: MIXED_VALUE }), 'modalita_non_valida')

  // whitelist: ogni campo che il client non deve poter scrivere
  for (const k of ['status', 'next_due_date', 'obligation_type', 'frequency_months', 'priority',
    'activation_status', 'due_basis_override', 'id', 'template_id', 'residence_id', 'unit_id', '__proto__x']) {
    check(`valida: campo ${k} rifiutato`, ok({ completion_mode: 'residente', [k]: 'x' }), 'campo_non_ammesso')
  }
  check('valida: campo fuori lista rifiutato anche da solo', ok({ status: 'completata' }), 'campo_non_ammesso')
  check('valida: priority da sola rifiutata (la deriva il server)', ok({ priority: 'N1' }), 'campo_non_ammesso')
  check('valida: chiavi undefined ignorate', ok({ completion_mode: 'residente', status: undefined }), { completion_mode: 'residente' })

  check('valida: oggetto vuoto', ok({}), 'nessuna_modifica')
  check('valida: solo undefined', ok({ completion_mode: undefined }), 'nessuna_modifica')
  check('valida: null', ok(null), 'input_non_valido')
  check('valida: array', ok([]), 'input_non_valido')
  check('valida: stringa', ok('x'), 'input_non_valido')

  // nessuno spread: un getter o una chiave ereditata non passa
  const withProto = Object.create({ status: 'scaduta' })
  withProto.completion_mode = 'residente'
  check('valida: output costruito a mano, senza chiavi ereditate', ok(withProto), { completion_mode: 'residente' })
  const raw = { completion_mode: 'residente', warranty_info: ' a ' }
  const rawSnap = clone(raw)
  validateConfigChanges(raw, ctx)
  check('valida: input non mutato', raw, rawSnap)
  const out = validateConfigChanges(raw, ctx)
  check('valida: output è un oggetto nuovo', out.changes === raw, false)
}

// ---------------------------------------------------------------------------
// planConfigWrite
// ---------------------------------------------------------------------------

// Fornitore e garanzia: solo le righe che cambiano
{
  const rows = [it({ id: 'a', supplier: 's1', warranty: 'X' }), it({ id: 'b', supplier: null, warranty: null })]
  const plan = planOf(rows, { supplier_id: 's1' })
  check('piano: fornitore scritto solo dove cambia', plan.rows, [{ id: 'b', fields: { supplier_id: 's1' } }])
  check('piano: fornitore non tocca date né status', plan.summary.needsConfirm, false)
  const plan2 = planOf(rows, { supplier_id: null })
  check('piano: nessuno scrive null dove c\'era un fornitore', plan2.rows, [{ id: 'a', fields: { supplier_id: null } }])
  const plan3 = planOf(rows, { warranty_info: 'Y' })
  check('piano: garanzia su tutte le righe che differiscono', plan3.rows.map(r => r.id), ['a', 'b'])
  const plan4 = planOf(rows, { warranty_info: null })
  check('piano: garanzia svuotata solo dove c\'era', plan4.rows, [{ id: 'a', fields: { warranty_info: null } }])
  const plan5 = planOf(rows, { warranty_info: 'X', supplier_id: 's1' })
  check('piano: nulla da scrivere = nessuna riga', plan5.rows.map(r => r.id), ['b'])
  check('piano: nessuna modifica = piano vuoto', planOf(rows, {}).rows, [])
}

// Residente <-> amministratore: data e status non si toccano, priority sì
{
  const rows = [
    it({ id: 'a', mode: 'residente', due: PAST, status: 'scaduta' }),
    it({ id: 'b', mode: 'residente', due: FUTURE, status: 'in_corso' }),
    it({ id: 'c', mode: 'amministratore', due: FUTURE }),
  ]
  const plan = planOf(rows, { completion_mode: 'amministratore' })
  check('piano: residente->amministratore scrive modalità e priority N3',
    plan.rows, [
      { id: 'a', fields: { completion_mode: 'amministratore', priority: 'N3' } },
      { id: 'b', fields: { completion_mode: 'amministratore', priority: 'N3' } },
    ])
  check('piano: riga già nella modalità di arrivo non toccata', plan.rows.some(r => r.id === 'c'), false)
  check('piano: tra residente e amministratore niente conferma', plan.summary.needsConfirm, false)
  check('piano: modeChanged', plan.summary.modeChanged, 2)
  const plan2 = planOf(rows, { completion_mode: 'residente' })
  check('piano: amministratore->residente priority N2', fieldsOf(plan2, 'c'), { completion_mode: 'residente', priority: 'N2' })
}

// Modalità ereditata dal template: se coincide con l'arrivo la riga non si tocca
{
  const rows = [it({ id: 'a', mode: null, tplMode: 'residente' })]
  check('piano: modalità null ma ereditata uguale = nessuna scrittura', planOf(rows, { completion_mode: 'residente' }).rows, [])
  check('piano: modalità null ereditata diversa = scritta', fieldsOf(planOf(rows, { completion_mode: 'amministratore' }), 'a'),
    { completion_mode: 'amministratore', priority: 'N3' })
}

// Verso promemoria
{
  const rows = [
    it({ id: 'fut', mode: 'residente', due: FUTURE, status: 'in_attesa', freq: 6 }),
    it({ id: 'oggi', mode: 'residente', due: TODAY, status: 'in_attesa', freq: 6 }),
    it({ id: 'pas', mode: 'residente', due: PAST, status: 'scaduta', freq: 6 }),
    it({ id: 'nul', mode: 'residente', due: null, status: 'in_attesa', delivery: null, freq: 6 }),
    it({ id: 'inc', mode: 'residente', due: FUTURE, status: 'in_corso', freq: 6 }),
    it({ id: 'tpl', mode: 'residente', due: PAST, status: 'scaduta', freq: null, tplFreq: 3 }),
    it({ id: 'nof', mode: 'residente', due: PAST, status: 'scaduta', freq: null, tplFreq: null }),
  ]
  const snapshot = clone(rows)
  const plan = planOf(rows, { completion_mode: 'promemoria' })
  check('promemoria: data futura tenuta, status già in_attesa', fieldsOf(plan, 'fut'),
    { completion_mode: 'promemoria', priority: 'N1' })
  check('promemoria: data di oggi tenuta', fieldsOf(plan, 'oggi'), { completion_mode: 'promemoria', priority: 'N1' })
  check('promemoria: data passata a oggi + frequenza, status in_attesa', fieldsOf(plan, 'pas'),
    { completion_mode: 'promemoria', priority: 'N1', status: 'in_attesa', next_due_date: '2026-12-15' })
  check('promemoria: data nulla a oggi + frequenza (anche su unità non consegnata)', fieldsOf(plan, 'nul'),
    { completion_mode: 'promemoria', priority: 'N1', next_due_date: '2026-12-15' })
  check('promemoria: in_corso torna in_attesa e tiene la data futura', fieldsOf(plan, 'inc'),
    { completion_mode: 'promemoria', priority: 'N1', status: 'in_attesa' })
  check('promemoria: frequenza dal template quando la riga non ne ha', fieldsOf(plan, 'tpl')?.next_due_date, '2026-09-15')
  check('promemoria: senza frequenza la data non si inventa', fieldsOf(plan, 'nof'),
    { completion_mode: 'promemoria', priority: 'N1', status: 'in_attesa' })
  check('promemoria: conteggi', [plan.summary.toPromemoria, plan.summary.datesReset, plan.summary.modeChanged],
    [7, 3, 7])
  check('promemoria: serve la conferma', plan.summary.needsConfirm, true)
  check('promemoria: input non mutato', rows, snapshot)
  const futOnly = planOf([rows[0], rows[1]], { completion_mode: 'promemoria' })
  check('promemoria: solo date future e status a posto = nessuna conferma', futOnly.summary.needsConfirm, false)
  check('promemoria: mai next_due_date passato scritto',
    plan.rows.every(r => r.fields.next_due_date === undefined || r.fields.next_due_date === null || r.fields.next_due_date >= TODAY), true)
}

// Da promemoria: cancello di consegna
{
  const rows = [
    it({ id: 'cons', mode: 'promemoria', due: FUTURE, delivery: '2026-01-01' }),
    it({ id: 'non', mode: 'promemoria', due: FUTURE, delivery: null }),
    it({ id: 'ovr', mode: 'promemoria', due: FUTURE, delivery: null, override: '2026-09-01' }),
    it({ id: 'cmp', mode: 'promemoria', due: FUTURE, delivery: null, completions: true }),
    it({ id: 'cmn', mode: 'promemoria', due: FUTURE, unit: null }),
    it({ id: 'gia', mode: 'promemoria', due: null, delivery: null }),
    it({ id: 'pas', mode: 'promemoria', due: PAST, delivery: '2026-01-01' }),
  ]
  const plan = planOf(rows, { completion_mode: 'residente' })
  check('da promemoria: unità consegnata tiene la data', fieldsOf(plan, 'cons'), { completion_mode: 'residente', priority: 'N2' })
  check('da promemoria: unità non consegnata senza override torna senza data', fieldsOf(plan, 'non'),
    { completion_mode: 'residente', priority: 'N2', next_due_date: null })
  check('da promemoria: override di voce tiene la data', fieldsOf(plan, 'ovr'), { completion_mode: 'residente', priority: 'N2' })
  check('da promemoria: con completamenti tiene la data', fieldsOf(plan, 'cmp'), { completion_mode: 'residente', priority: 'N2' })
  check('da promemoria: parti comuni tengono la data', fieldsOf(plan, 'cmn'), { completion_mode: 'residente', priority: 'N2' })
  check('da promemoria: già senza data non si riscrive', fieldsOf(plan, 'gia'), { completion_mode: 'residente', priority: 'N2' })
  check('da promemoria: lo status non si scrive mai', plan.rows.some(r => r.fields.status !== undefined), false)
  check('da promemoria: tornano in attesa di consegna', plan.summary.backToAwaitingDelivery, 1)
  check('da promemoria: scadute subito', plan.summary.overdueNow, 1)
  check('da promemoria: serve la conferma', plan.summary.needsConfirm, true)
  const toAdmin = planOf(rows, { completion_mode: 'amministratore' })
  check('da promemoria verso amministratore: stesso cancello', fieldsOf(toAdmin, 'non'),
    { completion_mode: 'amministratore', priority: 'N3', next_due_date: null })
}

// Righe archiviate (D4)
{
  const rows = [
    it({ id: 'arc', mode: 'residente', due: PAST, status: 'scaduta', act: 'archiviata', freq: 6 }),
    it({ id: 'arp', mode: 'promemoria', due: FUTURE, delivery: null, act: 'archiviata' }),
  ]
  const plan = planOf(rows, { completion_mode: 'promemoria', supplier_id: 's1', warranty_info: 'G' })
  check('archiviata verso promemoria: solo configurazione, né data né status', fieldsOf(plan, 'arc'),
    { supplier_id: 's1', warranty_info: 'G', completion_mode: 'promemoria', priority: 'N1' })
  const plan2 = planOf(rows, { completion_mode: 'residente' })
  check('archiviata da promemoria: nessun cancello', fieldsOf(plan2, 'arp'), { completion_mode: 'residente', priority: 'N2' })
  check('archiviate: nessuna conferma', [plan.summary.needsConfirm, plan2.summary.needsConfirm], [false, false])
  check('archiviate: non contano nel conteggio del piano', [plan.summary.rows, plan.summary.modeChanged], [0, 0])
}

// Priority sempre derivata dalla modalità, mai fornita
{
  const rows = [it({ id: 'a', mode: 'residente' })]
  for (const [mode, pr] of [['promemoria', 'N1'], ['amministratore', 'N3']]) {
    check(`priority derivata: ${mode}`, fieldsOf(planOf(rows, { completion_mode: mode }), 'a').priority, pr)
  }
  check('priority non scritta senza cambio di modalità', fieldsOf(planOf(rows, { supplier_id: 's1' }), 'a'), { supplier_id: 's1' })
}

// Riepilogo
{
  const rows = [it({ mode: 'residente' }), it({ mode: 'residente' }), it({ mode: 'amministratore' })]
  const plan = planOf(rows, { completion_mode: 'amministratore' })
  check('riepilogo: righe, toccate', [plan.summary.rows, plan.summary.touched], [3, 2])
}

if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} caso/i divergente/i su ${eseguiti}`)
  process.exit(1)
}
console.log(`✓ verify:maintconfig — ${eseguiti} casi ok`)
