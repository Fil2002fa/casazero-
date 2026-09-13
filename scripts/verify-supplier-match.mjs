// ============================================================
// CasaZero — verifica del match fornitore proposto dalle dichiarazioni di
// conformità.
// Uso:  node --experimental-strip-types scripts/verify-supplier-match.mjs
//       (oppure: npm run verify:match)
// ------------------------------------------------------------
// COSA GARANTISCE: che normalizeCompanyName, buildSupplierProposal e
// supplierVatNumberToWrite
// (src/lib/document-classification.ts) diano l'esito atteso su un elenco di
// casi reali, nelle due direzioni — i casi che DEVONO combaciare e i casi che
// NON devono combaciare.
//
// PERCHE' ESISTE: buildSupplierProposal è l'unica fonte di verità di due
// superfici che non si vedono tra loro (il pannello di revisione documenti e
// la server action che riverifica l'esito prima di scrivere il collegamento).
// E' una funzione pura senza alcun punto di osservazione a runtime: un
// cambiamento nella normalizzazione del nome — una forma societaria aggiunta
// alla lista, una regola di punteggiatura ritoccata — non produce nessun
// errore, nè di compilazione nè di lint. Produce un match diverso. I due
// modi di sbagliare non sono simmetrici: un match mancato fa creare un
// fornitore duplicato (recuperabile a mano), un match di troppo propone
// all'umano il fornitore SBAGLIATO e, se confermato, scrive la partita IVA
// del documento sull'anagrafica di un'altra impresa. Per questo i casi
// negativi contano quanto i positivi.
//
// PERCHE' NON E' UN TEST UNITARIO: questo repo non ha un test runner
// (verificato: nessun vitest/jest in package.json, nessuno script `test`).
// Introdurne uno è una decisione di progetto fuori dallo scope di questo
// commit; lo script segue invece il pattern già in uso per le verifiche
// eseguibili (scripts/verify-sistemi.mjs, scripts/verify-residence-features.mjs).
//
// PERCHE' ESCE NON-ZERO: exit 0 = tutti i casi danno l'esito atteso; exit 1 =
// almeno un caso divergente, elencato con atteso vs ottenuto; exit 2 = la
// verifica non ha potuto girare (import fallito) — mai confuso con un esito
// positivo.
//
// LE FUNZIONI SI LEGGONO DAL MODULO REALE, importandolo: mai una copia
// incollata qui dentro. L'import ha bisogno del type stripping di Node
// (>= 22.6 col flag, >= 23.6 di default) perché il sorgente è TypeScript.
// ============================================================

const SOURCE = new URL('../src/lib/document-classification.ts', import.meta.url)

let normalizeCompanyName, normalizeVatNumber, buildSupplierProposal, supplierVatNumberToWrite
try {
  ;({ normalizeCompanyName, normalizeVatNumber, buildSupplierProposal, supplierVatNumberToWrite } = await import(SOURCE.href))
} catch (err) {
  console.error(
    `\n✗ Impossibile importare ${SOURCE.pathname}: ${err.message}\n` +
    '  Rilancia con:  node --experimental-strip-types scripts/verify-supplier-match.mjs\n' +
    '  (serve Node >= 22.6; da Node 23.6 il flag non è più necessario)'
  )
  process.exit(2)
}

let fallimenti = 0
let eseguiti = 0

function check(label, ottenuto, atteso) {
  eseguiti++
  const a = JSON.stringify(atteso)
  const o = JSON.stringify(ottenuto)
  if (a === o) {
    console.log(`  ok   ${label}`)
  } else {
    fallimenti++
    console.error(`  FAIL ${label}\n       atteso  : ${a}\n       ottenuto: ${o}`)
  }
}

// ------------------------------------------------------------
// 1. normalizeCompanyName — chiave di confronto del nome
// ------------------------------------------------------------
console.log('\nnormalizeCompanyName — forme che devono collassare sulla stessa chiave')
check('S.r.l. puntato',        normalizeCompanyName('Rossi Impianti S.r.l.'),   'rossi impianti')
check('srl piano + maiuscole', normalizeCompanyName('ROSSI  IMPIANTI SRL'),     'rossi impianti')
check('iniziali spaziate',     normalizeCompanyName('Rossi Impianti S. R. L.'), 'rossi impianti')
check('S.p.A.',                normalizeCompanyName('Bortoluzzi Impianti Elettrici S.p.A.'), 'bortoluzzi impianti elettrici')
check('spa piano',             normalizeCompanyName('bortoluzzi impianti elettrici spa'),    'bortoluzzi impianti elettrici')
check('accento ridotto',       normalizeCompanyName('Società Cooperativa Edile'), 'edile')
check('snc + e commerciale',   normalizeCompanyName('Elettro F.lli Zanon & C. snc'), 'elettro flli zanon c')

console.log('\nnormalizeCompanyName — casi che NON devono produrre una chiave')
check('solo forma societaria', normalizeCompanyName('S.r.l.'), null)
check('null passa null',       normalizeCompanyName(null),     null)
check('stringa vuota',         normalizeCompanyName(''),       null)

console.log('\nnormalizeCompanyName — nomi diversi che NON devono combaciare')
const diversi = [
  ['Rossi Impianti',        'Rossi Impianto'],
  ['Verdi Termoidraulica',  'Verdi Termotecnica'],
  ['Zanon Elettro',         'Zanon Elettra'],
]
for (const [x, y] of diversi) {
  eseguiti++
  const kx = normalizeCompanyName(x)
  const ky = normalizeCompanyName(y)
  if (kx !== null && kx === ky) {
    fallimenti++
    console.error(`  FAIL "${x}" e "${y}" collassano sulla stessa chiave "${kx}"`)
  } else {
    console.log(`  ok   "${x}" ≠ "${y}"`)
  }
}

// ------------------------------------------------------------
// 2. normalizeVatNumber — presupposto del match per P.IVA
// ------------------------------------------------------------
console.log('\nnormalizeVatNumber — il presupposto del ramo per P.IVA')
check('prefisso IT e spazi',   normalizeVatNumber('IT 01234567891'), '01234567891')
check('punti e trattini',      normalizeVatNumber('01.234.567-891'), '01234567891')
check('testo senza cifre',     normalizeVatNumber('non indicata'),   null)

// ------------------------------------------------------------
// 3. buildSupplierProposal — esito della proposta
// ------------------------------------------------------------
// Proiezione: i soli campi che discriminano un esito da un altro. Confrontare
// l'oggetto intero legherebbe lo script alla forma esatta del payload, che
// può crescere senza che il comportamento cambi.
function proj(p) {
  return {
    kind: p.kind,
    id: p.supplier?.id ?? null,
    omonimi: p.altriOmonimi ?? null,
    piva: p.partitaIva ?? null,
  }
}

const A = { id: 'a', name: 'Bortoluzzi Impianti Elettrici S.r.l.', vat_number: 'IT 01234567891' }
const B = { id: 'b', name: 'Rossi Impianti',      vat_number: null }
const C = { id: 'c', name: 'ROSSI IMPIANTI SRL',  vat_number: null }

const base = {
  docType: 'dich_conformita_dm37',
  sistema: 'elettrico',
  ragioneSociale: 'Bortoluzzi Impianti Elettrici srl',
  partitaIva: '01234567891',
  fornitori: [A, B],
  installazioni: [],
}
const caso = over => buildSupplierProposal({ ...base, ...over })

console.log('\nbuildSupplierProposal — la sezione non deve comparire')
check('doc_type diverso',   proj(caso({ docType: 'ape' })),            { kind: 'non_applicabile', id: null, omonimi: null, piva: null })
check('doc_type null',      proj(caso({ docType: null })),             { kind: 'non_applicabile', id: null, omonimi: null, piva: null })
check('ragione sociale ""', proj(caso({ ragioneSociale: '' })),        { kind: 'non_applicabile', id: null, omonimi: null, piva: null })
check('ragione sociale spazi', proj(caso({ ragioneSociale: '   ' })),  { kind: 'non_applicabile', id: null, omonimi: null, piva: null })
check('ragione sociale null',  proj(caso({ ragioneSociale: null })),   { kind: 'non_applicabile', id: null, omonimi: null, piva: null })

console.log('\nbuildSupplierProposal — sistema non classificato')
check('sistema null', proj(caso({ sistema: null })), { kind: 'sistema_mancante', id: null, omonimi: null, piva: null })

console.log('\nbuildSupplierProposal — esito (1): match per P.IVA')
check('formati P.IVA diversi', proj(caso({})), { kind: 'per_piva', id: 'a', omonimi: null, piva: '01234567891' })
check('P.IVA vince sul nome',
  proj(caso({ ragioneSociale: 'Rossi Impianti' })),
  { kind: 'per_piva', id: 'a', omonimi: null, piva: '01234567891' })

console.log('\nbuildSupplierProposal — esito (2): suggerimento per nome')
check('P.IVA del doc non in anagrafica',
  proj(caso({ partitaIva: '99999999999', ragioneSociale: 'Rossi Impianti S.r.l.' })),
  { kind: 'simile_per_nome', id: 'b', omonimi: 0, piva: '99999999999' })
check('P.IVA illeggibile → solo nome',
  proj(caso({ partitaIva: 'non indicata', ragioneSociale: 'Rossi Impianti' })),
  { kind: 'simile_per_nome', id: 'b', omonimi: 0, piva: null })
check('omonimia dichiarata, non risolta',
  proj(caso({ partitaIva: null, ragioneSociale: 'Rossi Impianti srl', fornitori: [C, B] })),
  { kind: 'simile_per_nome', id: 'b', omonimi: 1, piva: null })

console.log('\nbuildSupplierProposal — esito (3): nessun match')
check('nome e P.IVA sconosciuti',
  proj(caso({ partitaIva: null, ragioneSociale: 'Verdi Termoidraulica' })),
  { kind: 'nessun_match', id: null, omonimi: null, piva: null })

console.log('\nbuildSupplierProposal — collegamento già presente')
check('stesso fornitore, stesso sistema',
  proj(caso({ installazioni: [{ supplier_id: 'a', sistema: 'elettrico' }] })),
  { kind: 'gia_collegato', id: 'a', omonimi: null, piva: null })
check('stesso fornitore, sistema diverso → si propone',
  proj(caso({ installazioni: [{ supplier_id: 'a', sistema: 'termico' }] })),
  { kind: 'per_piva', id: 'a', omonimi: null, piva: '01234567891' })
check('già collegato trovato per nome',
  proj(caso({
    partitaIva: null,
    ragioneSociale: 'Rossi Impianti srl',
    installazioni: [{ supplier_id: 'b', sistema: 'elettrico' }],
  })),
  { kind: 'gia_collegato', id: 'b', omonimi: null, piva: null })

// ------------------------------------------------------------
// 4. supplierVatNumberToWrite — cosa la conferma scrive in anagrafica
// ------------------------------------------------------------
// Il caso da non sbagliare è il quarto: una P.IVA esistente sul fornitore non
// si sovrascrive mai. Il controllo del kind accanto impedisce che quel null
// passi per il motivo sbagliato (un esito diverso da simile_per_nome).
console.log('\nsupplierVatNumberToWrite — cosa la conferma scrive in anagrafica')
const Bconpiva = { ...B, vat_number: '11111111111' }
check('per P.IVA → niente (ce l\'ha già)',
  supplierVatNumberToWrite(caso({})), null)
check('simile per nome, fornitore senza P.IVA → quella del documento',
  supplierVatNumberToWrite(caso({ partitaIva: '99999999999', ragioneSociale: 'Rossi Impianti S.r.l.' })), '99999999999')
check('simile per nome, documento senza P.IVA → niente',
  supplierVatNumberToWrite(caso({ partitaIva: null, ragioneSociale: 'Rossi Impianti' })), null)
check('simile per nome, fornitore con altra P.IVA: è davvero simile_per_nome',
  caso({ partitaIva: '99999999999', ragioneSociale: 'Rossi Impianti', fornitori: [A, Bconpiva] }).kind, 'simile_per_nome')
check('simile per nome, fornitore con altra P.IVA → mai sovrascrivere',
  supplierVatNumberToWrite(caso({ partitaIva: '99999999999', ragioneSociale: 'Rossi Impianti', fornitori: [A, Bconpiva] })), null)
check('nessun match con P.IVA → il fornitore nasce con quella del documento',
  supplierVatNumberToWrite(caso({ partitaIva: '99999999999', ragioneSociale: 'Verdi Termoidraulica' })), '99999999999')
check('nessun match senza P.IVA → niente',
  supplierVatNumberToWrite(caso({ partitaIva: null, ragioneSociale: 'Verdi Termoidraulica' })), null)
check('già collegato → niente',
  supplierVatNumberToWrite(caso({ installazioni: [{ supplier_id: 'a', sistema: 'elettrico' }] })), null)

// ------------------------------------------------------------
// 5. Recupero dopo un fallimento a metà (fornitore creato, collegamento no)
// ------------------------------------------------------------
// confirmSupplierProposal non è transazionale. Questi casi fissano cosa vede
// la proposta ricaricata subito dopo quel fallimento. Gli ultimi due sono
// LIMITI DICHIARATI, non comportamenti desiderati: se un cambiamento li
// risolve, il caso va aggiornato insieme al commento dell'action e all'handoff.
console.log('\nRecupero dopo fallimento parziale — con P.IVA garantito, senza P.IVA no')
check('con P.IVA: il fornitore creato si ritrova per P.IVA, nessun doppione',
  proj(caso({
    partitaIva: '99999999999',
    ragioneSociale: 'Verdi Termoidraulica',
    fornitori: [A, B, { id: 'n', name: 'Verdi Termoidraulica', vat_number: '99999999999' }],
  })),
  { kind: 'per_piva', id: 'n', omonimi: null, piva: '99999999999' })
check('LIMITE — senza P.IVA, con omonimi preesistenti: si propone il primo per id, non quello creato',
  proj(caso({
    partitaIva: null,
    ragioneSociale: 'Rossi Impianti',
    fornitori: [A, B, { id: 'z', name: 'Rossi Impianti', vat_number: null }],
  })),
  { kind: 'simile_per_nome', id: 'b', omonimi: 1, piva: null })
check('LIMITE — senza P.IVA, nome di sole forme societarie: resta nessun match, ritentare duplica',
  proj(caso({
    partitaIva: null,
    ragioneSociale: 'S.r.l.',
    fornitori: [A, B, { id: 'n', name: 'S.r.l.', vat_number: null }],
  })),
  { kind: 'nessun_match', id: null, omonimi: null, piva: null })

// ------------------------------------------------------------
console.log(`\ncasi eseguiti: ${eseguiti} · falliti: ${fallimenti}`)
if (fallimenti > 0) {
  console.error(
    '\n✗ DIVERGENZA fra il comportamento atteso e quello della funzione.\n' +
    '  Se il cambiamento è voluto, aggiornare il caso qui sopra NELLO STESSO\n' +
    '  commit che cambia la funzione, con la ragione nel messaggio di commit.'
  )
  process.exit(1)
}

console.log('\n✓ Tutti i casi danno l\'esito atteso, nelle due direzioni.')
process.exit(0)
