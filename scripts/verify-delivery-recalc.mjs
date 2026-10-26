// ============================================================
// CasaZero — verifica del piano di ricalcolo su cambio data di consegna.
// Uso:  node --experimental-strip-types scripts/verify-delivery-recalc.mjs
//       (oppure: npm run verify:consegna)
// ------------------------------------------------------------
// COSA GARANTISCE: che planDeliveryRecalc (src/lib/delivery-recalc.ts) tocchi
// solo le voci giuste. Le tre regole che non devono mai cedere:
//   - una voce con completamenti NON si ricalcola (il fascicolo vince);
//   - una promemoria NON si ricalcola (e non ha mai una scadenza da mostrare);
//   - senza data di consegna il piano dell'unita NON parte, nemmeno con una
//     data di categoria (il cancello di resolveDueBasis); solo l'override di
//     voce lo apre.
//
// PERCHE' NON E' UN TEST UNITARIO: il repo non ha un test runner; lo script
// segue il pattern di scripts/verify-maintenance-basis.mjs.
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi ok; exit 1 = almeno un caso
// divergente (atteso vs ottenuto); exit 2 = import fallito — mai confuso con
// un esito positivo. Ogni chiamata e protetta: un'eccezione dove non era
// attesa conta come caso divergente, non interrompe lo script.
//
// MUTATION TEST del 26/10 (sorgente mutato a mano, script rilanciato,
// sorgente ripristinato): vedi gli esiti nel footer in fondo al file.
// ============================================================

import { register } from 'node:module'
// Import relativi senza estensione nei moduli di lib: vedi
// scripts/ts-resolve-hooks.mjs.
register('./ts-resolve-hooks.mjs', import.meta.url)

const MOD = new URL('../src/lib/delivery-recalc.ts', import.meta.url)

let mod
try {
  mod = await import(MOD.href)
} catch (err) {
  console.error(
    `\n✗ Impossibile importare il modulo: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-delivery-recalc.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

const { planDeliveryRecalc } = mod

let fallimenti = 0
let eseguiti = 0

function check(label, fn, atteso) {
  eseguiti++
  let ottenuto
  try {
    ottenuto = fn()
  } catch (err) {
    fallimenti++
    console.error(`✗ ${label}\n    atteso:   ${JSON.stringify(atteso)}\n    eccezione: ${err.message}`)
    return
  }
  const a = JSON.stringify(ottenuto)
  const b = JSON.stringify(atteso)
  if (a === b) return
  fallimenti++
  console.error(`✗ ${label}\n    atteso:   ${b}\n    ottenuto: ${a}`)
}

function checkThrows(label, fn) {
  eseguiti++
  try {
    const ottenuto = fn()
    fallimenti++
    console.error(`✗ ${label}\n    atteso:   un errore\n    ottenuto: ${JSON.stringify(ottenuto)}`)
  } catch {
    /* atteso */
  }
}

// --- fixture ---------------------------------------------------------------
// Date distinte per livello: un livello letto al posto di un altro non puo
// passare per caso.
const OGGI       = '2026-10-26'
const D_UNITA    = '2026-03-30'
const D_CAT      = '2026-02-20'
const D_VOCE     = '2026-01-10'

const voce = (over = {}) => ({
  id: 'v1',
  frequencyMonths: 12,
  completionMode: 'residente',
  activationStatus: 'inclusa',
  dueBasisOverride: null,
  category: 'Finiture',
  hasCompletions: false,
  ...over,
})

const piano = (over = {}) => planDeliveryRecalc({
  unitDeliveryDate: D_UNITA, items: [voce()], categoryDates: [], today: OGGI, ...over,
})
const riga = (over) => piano(over).voci[0]

const R = (item_id, nuova_data, livello_base) =>
  ({ item_id, esito: 'ricalcola', nuova_data, livello_base, motivo: null })
const S = (item_id, motivo) =>
  ({ item_id, esito: 'salta', nuova_data: null, livello_base: null, motivo })

// --- ricalcolo: base risolta + frequenza ----------------------------------
check('unita consegnata: base unita + 12 mesi',
  () => riga({}), R('v1', '2027-03-30', 'unita'))
check('data di categoria della stessa categoria: vince sulla data unita',
  () => riga({ categoryDates: [{ category: 'Finiture', deliveryDate: D_CAT }] }),
  R('v1', '2027-02-20', 'categoria'))
check('data di categoria di un altra categoria: ignorata',
  () => riga({ categoryDates: [{ category: 'Termico', deliveryDate: D_CAT }] }),
  R('v1', '2027-03-30', 'unita'))
check('override di voce: vince su categoria e unita',
  () => riga({ items: [voce({ dueBasisOverride: D_VOCE })],
               categoryDates: [{ category: 'Finiture', deliveryDate: D_CAT }] }),
  R('v1', '2027-01-10', 'voce'))
check('clamp di fine mese: 31 gen + 1 mese = 28 feb',
  () => riga({ unitDeliveryDate: '2026-01-31', items: [voce({ frequencyMonths: 1 })] }),
  R('v1', '2026-02-28', 'unita'))
check('voce consigliata dall amministratore: si ricalcola come le altre',
  () => riga({ items: [voce({ completionMode: 'amministratore' })] }),
  R('v1', '2027-03-30', 'unita'))
check('completion_mode null: non e promemoria, si ricalcola',
  () => riga({ items: [voce({ completionMode: null })] }),
  R('v1', '2027-03-30', 'unita'))

// --- IL CANCELLO: consegna rimossa --------------------------------------
check('data unita null: la voce ricalcolabile torna a null',
  () => riga({ unitDeliveryDate: null }), R('v1', null, null))
check('data unita null + data di categoria: resta null (cancello)',
  () => riga({ unitDeliveryDate: null,
               categoryDates: [{ category: 'Finiture', deliveryDate: D_CAT }] }),
  R('v1', null, null))
check('data unita null + override di voce: l override apre il cancello',
  () => riga({ unitDeliveryDate: null, items: [voce({ dueBasisOverride: D_VOCE })] }),
  R('v1', '2027-01-10', 'voce'))
check('data unita null: frequenza null non viene nemmeno letta',
  () => riga({ unitDeliveryDate: null, items: [voce({ frequencyMonths: null })] }),
  R('v1', null, null))

// --- SALTI ------------------------------------------------------------------
check('voce con completamenti: salta, nel fascicolo',
  () => riga({ items: [voce({ hasCompletions: true })] }), S('v1', 'nel_fascicolo'))
check('voce con completamenti e consegna rimossa: salta, non torna a null',
  () => riga({ unitDeliveryDate: null, items: [voce({ hasCompletions: true })] }),
  S('v1', 'nel_fascicolo'))
check('voce con completamenti e override: salta comunque',
  () => riga({ items: [voce({ hasCompletions: true, dueBasisOverride: D_VOCE })] }),
  S('v1', 'nel_fascicolo'))
check('promemoria: salta',
  () => riga({ items: [voce({ completionMode: 'promemoria' })] }), S('v1', 'promemoria'))
check('promemoria con override: salta comunque',
  () => riga({ items: [voce({ completionMode: 'promemoria', dueBasisOverride: D_VOCE })] }),
  S('v1', 'promemoria'))
check('voce esclusa: salta, fuori piano',
  () => riga({ items: [voce({ activationStatus: 'esclusa' })] }), S('v1', 'fuori_piano'))
check('voce archiviata: salta, fuori piano',
  () => riga({ items: [voce({ activationStatus: 'archiviata' })] }), S('v1', 'fuori_piano'))

// --- precedenza dei motivi: fuori_piano > promemoria > nel_fascicolo ------
check('archiviata + promemoria + completamenti: fuori piano',
  () => riga({ items: [voce({ activationStatus: 'archiviata', completionMode: 'promemoria', hasCompletions: true })] }),
  S('v1', 'fuori_piano'))
check('promemoria + completamenti: promemoria',
  () => riga({ items: [voce({ completionMode: 'promemoria', hasCompletions: true })] }),
  S('v1', 'promemoria'))

// --- riepilogo ----------------------------------------------------------
// Sei voci: due ricalcolate (una gia scaduta, una no), una per motivo di
// salto, piu una seconda nel fascicolo per contare oltre 1.
const sei = [
  voce({ id: 'a', frequencyMonths: 6 }),                        // 2026-09-30 < oggi: gia scaduta
  voce({ id: 'b', frequencyMonths: 12 }),                       // 2027-03-30: futura
  voce({ id: 'c', hasCompletions: true }),
  voce({ id: 'd', hasCompletions: true }),
  voce({ id: 'e', completionMode: 'promemoria' }),
  voce({ id: 'f', activationStatus: 'esclusa' }),
]
check('riepilogo: conteggi per esito e per motivo',
  () => piano({ items: sei }).riepilogo,
  { ricalcolate: 2, saltate: { nel_fascicolo: 2, promemoria: 1, fuori_piano: 1 }, gia_scadute: 1 })
check('una riga per voce, nello stesso ordine dell input',
  () => piano({ items: sei }).voci.map(v => `${v.item_id}:${v.esito}`),
  ['a:ricalcola', 'b:ricalcola', 'c:salta', 'd:salta', 'e:salta', 'f:salta'])
check('gia scadute: una scadenza uguale a oggi NON e gia scaduta',
  () => piano({ unitDeliveryDate: '2025-10-26', items: [voce()] }).riepilogo.gia_scadute, 0)
check('gia scadute: il giorno prima di oggi si',
  () => piano({ unitDeliveryDate: '2025-10-25', items: [voce()] }).riepilogo.gia_scadute, 1)
check('gia scadute: una voce tornata a null non conta',
  () => piano({ unitDeliveryDate: null, items: [voce()] }).riepilogo,
  { ricalcolate: 1, saltate: { nel_fascicolo: 0, promemoria: 0, fuori_piano: 0 }, gia_scadute: 0 })
check('gia scadute: today con orario viene ridotto al giorno',
  () => piano({ unitDeliveryDate: '2025-10-26', items: [voce()], today: '2026-10-26T23:59:00Z' }).riepilogo.gia_scadute, 0)
check('nessuna voce: riepilogo a zero',
  () => piano({ items: [] }),
  { voci: [], riepilogo: { ricalcolate: 0, saltate: { nel_fascicolo: 0, promemoria: 0, fuori_piano: 0 }, gia_scadute: 0 } })

// --- input corrotti: lanciano, non producono un piano ---------------------
checkThrows('today malformato',        () => piano({ today: '26/10/2026' }))
checkThrows('data unita inesistente',  () => piano({ unitDeliveryDate: '2026-02-30' }))
checkThrows('frequenza null con base', () => piano({ items: [voce({ frequencyMonths: null })] }))
checkThrows('categoria con due date',  () => piano({ categoryDates: [
  { category: 'Finiture', deliveryDate: D_CAT }, { category: 'Finiture', deliveryDate: D_UNITA }] }))
eseguiti++
try {
  piano({ items: [voce({ id: 'voce-rotta', frequencyMonths: null })] })
  fallimenti++
  console.error('✗ errore di frequenza: atteso un errore')
} catch (err) {
  if (!err.message.includes('voce-rotta')) {
    fallimenti++
    console.error(`✗ errore di frequenza: il messaggio non nomina la voce\n    ottenuto: ${err.message}`)
  }
}

// --- esito ------------------------------------------------------------------
if (fallimenti > 0) {
  console.error(`\n✗ ${fallimenti} casi divergenti su ${eseguiti}`)
  process.exit(1)
}
console.log(`✓ ${eseguiti} casi, tutti con l'atteso`)

// ============================================================
// MUTATION TEST — 26/10. Ogni mutazione applicata con sed su una copia di
// lavoro, script rilanciato, sorgente ripristinato da backup e confermato
// identico con sha256sum -c. Senza mutazioni: 32 casi, exit 0.
// ------------------------------------------------------------
// M1. Tolto il salto fascicolo
//     (delivery-recalc.ts: if (item.hasCompletions) return 'nel_fascicolo')
//     ESITO: exit 1, 5 casi divergenti su 32. Le voci con completamenti
//     risultano 'ricalcola' (2027-03-30, override 2027-01-10, e null con la
//     consegna rimossa: il fascicolo verrebbe sovrascritto), riepilogo 4
//     ricalcolate invece di 2.
//
// M2. Tolta l'esclusione promemoria
//     (delivery-recalc.ts: if (item.completionMode === 'promemoria') ...)
//     ESITO: exit 1, 5 casi divergenti su 32. La promemoria risulta
//     'ricalcola' con una data, la promemoria con completamenti cade su
//     'nel_fascicolo', riepilogo promemoria 0 invece di 1.
//
// M3. Tolto il cancello dell'unita
//     (maintenance-due.ts: if (input.unitDate === null) return { date: null, ... })
//     ESITO: exit 1, 4 casi divergenti su 32. Con la consegna rimossa e una
//     data di categoria la voce riparte da 2027-02-20 (il difetto di
//     partenza); senza categoria resolveDueBasis lancia su
//     units.delivery_date null — contato come divergenza, non come crash.
// ============================================================
