// ============================================================
// CasaZero — riempimento una tantum delle proposte di unità (E1b, dopo la 052).
// Uso:  node --env-file=.env.local --experimental-strip-types --no-warnings scripts/backfill-unit-proposals.mjs
//         [--apply] [--residence "Residenza Prova"] [--residence "Residenza Cavaccio"]
// ------------------------------------------------------------
// COSA FA: per i documenti già caricati calcola la proposta di unità dal testo
// letto (document-unit-proposal.ts) e la scrive in documents.proposed_unit_id.
// NON assegna mai un'unità: unit_id resta com'è.
//
// SICUREZZA: senza --apply è una prova a secco, non scrive niente. Con --apply
// tocca SOLO righe con unit_id IS NULL AND proposed_unit_id IS NULL AND
// unit_proposal_dismissed_at IS NULL (le stesse condizioni sono nel WHERE
// dell'update, quindi un documento assegnato o ignorato nel frattempo non
// viene toccato). Idempotente: una seconda esecuzione trova le stesse
// proposte già scritte e aggiorna 0 righe.
//
// Usa il service role (legge .env.local): è uno strumento da operatore, non
// una route. Nessuna scrittura al caricamento delle pagine.
//
// Exit: 0 = ok; 1 = almeno un guasto tecnico (lettura o scrittura); 2 = import o ambiente.
// ============================================================
import { register } from 'node:module'
import { createClient } from '@supabase/supabase-js'

register('./ts-resolve-hooks.mjs', import.meta.url)

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const onlyNames = args.flatMap((a, i) => (a === '--residence' && args[i + 1] ? [args[i + 1]] : []))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('✗ Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY: lancia con --env-file=.env.local')
  process.exit(2)
}

let loader, proposal
try {
  loader = await import(new URL('../src/lib/document-rows.server.ts', import.meta.url).href)
  proposal = await import(new URL('../src/lib/document-unit-proposal.ts', import.meta.url).href)
} catch (err) {
  console.error(`✗ Impossibile importare i moduli: ${err.message}`)
  process.exit(2)
}

const svc = createClient(url, key, { auth: { persistSession: false } })

let query = svc.from('residences').select('id, name').order('name')
if (onlyNames.length > 0) query = query.in('name', onlyNames)
const { data: residences, error: residencesError } = await query
if (residencesError) {
  console.error('✗ Lettura residenze fallita:', residencesError.message)
  process.exit(1)
}
if (onlyNames.length > 0) {
  const trovate = new Set(residences.map(r => r.name))
  for (const n of onlyNames) if (!trovate.has(n)) console.error(`! Residenza non trovata: ${n}`)
}

console.log(apply ? 'MODO: --apply (scrive)' : 'MODO: prova a secco (non scrive; aggiungi --apply)')
let guasti = 0
let totaleAggiornate = 0
for (const residence of residences) {
  const { docs, units, error } = await loader.loadResidenceDocumentRows(svc, residence.id)
  if (error) {
    guasti++
    console.error(`✗ ${residence.name}: lettura fallita (${error})`)
    continue
  }
  const idonei = docs.filter(d => d.unit_id === null && d.proposed_unit_id === null && d.unit_proposal_dismissed_at === null)
  const conProposta = []
  for (const d of idonei) {
    const p = proposal.unitProposalFor(d, units)
    if (p) conProposta.push({ d, p })
  }
  let aggiornate = 0
  for (const { d, p } of conProposta) {
    const label = units.find(u => u.id === p.unitId)?.label ?? p.unitId
    console.log(`  ${residence.name} | ${d.file_name} | "${proposal.proposalSourceText(d)}" -> ${label} (${p.confidence})`)
    if (!apply) continue
    const { data, error: updateError } = await svc
      .from('documents')
      .update({ proposed_unit_id: p.unitId, unit_proposal_confidence: p.confidence })
      .eq('id', d.id)
      .is('unit_id', null)
      .is('proposed_unit_id', null)
      .is('unit_proposal_dismissed_at', null)
      .select('id')
    if (updateError) {
      guasti++
      console.error(`✗ ${residence.name} | ${d.file_name}: scrittura fallita (${updateError.message})`)
      continue
    }
    aggiornate += data?.length ?? 0
  }
  totaleAggiornate += aggiornate
  if (idonei.length > 0 || onlyNames.length > 0) {
    console.log(`${residence.name}: ${docs.length} documenti, ${idonei.length} idonei, ${conProposta.length} con proposta, ${aggiornate} aggiornati`)
  }
}
console.log(`TOTALE aggiornati: ${totaleAggiornate}${apply ? '' : ' (prova a secco: 0 scritti)'}`)
process.exit(guasti > 0 ? 1 : 0)
