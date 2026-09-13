// Fonte unica per la tassonomia doc_type della classificazione AI (B3).
// documents.doc_type è TEXT libero (024_documents_ai_classification_columns.sql,
// deliberatamente non enum/CHECK): questa costante è il set di valori ammessi
// lato applicativo. Il mapping verso DocumentCategory è solo INFORMATIVO — non
// riscrive mai documents.category né il path storage, che restano congelati
// all'upload originale (legge di dominio, 024).
import type { DocumentCategory } from '@/types/database'

export type DocType =
  | 'dich_conformita_dm37'
  | 'ape'
  | 'manuale'
  | 'garanzia'
  | 'collaudo'
  | 'agibilita'
  | 'capitolato'
  | 'libretto_impianto'
  | 'as_built'
  | 'planimetria_catastale'
  | 'piano_manutenzione_opera'
  | 'cert_linee_vita'
  | 'regolamento_condominiale'
  | 'tabelle_millesimali'
  | 'polizza_decennale'
  | 'elenco_fornitori'
  | 'schede_materiali'
  | 'altro'

export const DOC_TYPES: DocType[] = [
  'dich_conformita_dm37',
  'ape',
  'manuale',
  'garanzia',
  'collaudo',
  'agibilita',
  'capitolato',
  'libretto_impianto',
  'as_built',
  'planimetria_catastale',
  'piano_manutenzione_opera',
  'cert_linee_vita',
  'regolamento_condominiale',
  'tabelle_millesimali',
  'polizza_decennale',
  'elenco_fornitori',
  'schede_materiali',
  'altro',
]

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  dich_conformita_dm37: 'Dichiarazione di conformità DM 37/08',
  ape: 'Attestato di prestazione energetica',
  manuale: 'Manuale',
  garanzia: 'Garanzia',
  collaudo: 'Collaudo',
  agibilita: 'Agibilità',
  capitolato: 'Capitolato',
  libretto_impianto: 'Libretto d’impianto',
  as_built: 'Elaborati as-built',
  planimetria_catastale: 'Planimetria catastale',
  piano_manutenzione_opera: 'Piano di manutenzione dell’opera',
  cert_linee_vita: 'Certificazione linee vita',
  regolamento_condominiale: 'Regolamento condominiale',
  tabelle_millesimali: 'Tabelle millesimali',
  polizza_decennale: 'Polizza decennale postuma',
  elenco_fornitori: 'Elenco fornitori e manutentori',
  schede_materiali: 'Schede materiali e finiture',
  altro: 'Altro',
}

// null = nessun mapping (fallback 'altro', o doc_type non riconducibile a una categoria).
export const DOC_TYPE_TO_CATEGORY: Record<DocType, DocumentCategory | null> = {
  dich_conformita_dm37: 'conformita',
  ape: 'energetici',
  manuale: 'tecnici',
  garanzia: 'tecnici',
  collaudo: 'tecnici',
  agibilita: 'amministrativi',
  capitolato: 'tecnici',
  libretto_impianto: 'tecnici',
  as_built: 'tecnici',
  planimetria_catastale: 'proprieta',
  piano_manutenzione_opera: 'tecnici',
  cert_linee_vita: 'conformita',
  regolamento_condominiale: 'amministrativi',
  tabelle_millesimali: 'amministrativi',
  polizza_decennale: 'amministrativi',
  elenco_fornitori: 'amministrativi',
  schede_materiali: 'tecnici',
  altro: null,
}

// Sotto soglia → classification_status 'da_revisionare' anche se la chiamata
// AI ha prodotto un doc_type valido (coda di revisione umana, commit 4/5).
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.8

// Asse `sistema` — a QUALE impianto si riferisce un documento (prerequisito B4:
// "manca la conformità dell'impianto termico"). Ortogonale a doc_type: un
// edificio ha più impianti, ciascuno con le proprie dich. conformità/collaudi/
// manuali/garanzie. Vive in extracted_metadata (jsonb), NON è una colonna né
// tocca doc_type/category/path (nessuna migrazione). null quando il documento
// non riguarda un impianto specifico o in caso di dubbio: mai indovinare, un
// valore inventato genererebbe falsi "mancanti" in B4.
//
// Fonte unica anche per supplier_installations.sistema (039, blocco fornitori
// v2): i 5 valori coperture/spurghi/finiture/sicurezza/accessi sono stati
// aggiunti per quel blocco, non per la classificazione documenti — coprono
// categorie reali di maintenance_templates.category e di suppliers.categories
// che altrimenti cadrebbero tutte in 'altro' nel backfill dei fornitori.
// Estendere questa costante estende automaticamente anche l'enum accettato
// dal classificatore AI (route.ts:61 lo interpola in prompt), perché è la
// stessa identica lista: un impianto è un impianto in entrambi i contesti.
// Ogni modifica va rispecchiata nel CHECK di supplier_installations.sistema
// (039_suppliers_anagrafica_costruttore.sql) — verificato da
// scripts/verify-sistemi.mjs (npm run verify:sistemi).
export type Sistema =
  | 'elettrico'
  | 'termico'
  | 'gas'
  | 'idrico_sanitario'
  | 'antincendio'
  | 'ascensore'
  | 'fotovoltaico'
  | 'vmc'
  | 'coperture'
  | 'spurghi'
  | 'finiture'
  | 'sicurezza'
  | 'accessi'
  | 'altro'

export const SISTEMI: Sistema[] = [
  'elettrico',
  'termico',
  'gas',
  'idrico_sanitario',
  'antincendio',
  'ascensore',
  'fotovoltaico',
  'vmc',
  'coperture',
  'spurghi',
  'finiture',
  'sicurezza',
  'accessi',
  'altro',
]

export const SISTEMA_LABELS: Record<Sistema, string> = {
  elettrico:        'Impianto elettrico',
  termico:          'Impianto termico',
  gas:              'Impianto gas',
  idrico_sanitario: 'Impianto idrico-sanitario',
  antincendio:      'Impianto antincendio',
  ascensore:        'Ascensore',
  fotovoltaico:     'Impianto fotovoltaico',
  vmc:              'VMC (ventilazione meccanica)',
  coperture:        'Coperture e tetto',
  spurghi:          'Scarichi e spurghi',
  finiture:         'Finiture e serramenti',
  sicurezza:        'Sicurezza in copertura',
  accessi:          'Accessi ed esterni',
  altro:            'Altro impianto',
}

// Stati della pipeline di classificazione (025_documents_classification_status_review.sql,
// CHECK su documents.classification_status). Fonte unica del tipo lato TS.
export type ClassificationStatus =
  | 'non_classificato'
  | 'in_corso'
  | 'completata'
  | 'da_revisionare'
  | 'fallita'

// Normalizza una partita IVA estratta da una dichiarazione di conformità a
// soli caratteri numerici: nessuno spazio, punto, trattino o prefisso "IT".
// Fonte unica per due usi che devono vedere lo stesso valore per lo stesso
// numero — la classificazione (route.ts, questo commit) e il match verso
// suppliers.vat_number (commit "proposta fornitore"): "IT 01234567891" e
// "01234567891" sono la stessa partita IVA solo se qualcosa li normalizza
// allo stesso modo prima del confronto. Presuppone partita IVA italiana
// (solo cifre): il dominio è documenti DM 37/08 italiani, mai P.IVA estere
// alfanumeriche.
// null → null. Stringa che dopo la normalizzazione non contiene cifre
// (es. l'AI ha scritto "non indicata") → null, non stringa vuota: uno "" in
// vat_number violerebbe suppliers_vat_number_non_vuota (039) se mai scritto lì.
export function normalizeVatNumber(raw: string | null): string | null {
  if (raw === null) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

// Forme societarie scartate dal nome normalizzato: sono rumore legale, non
// identità dell'impresa — "Rossi Impianti S.r.l." e "Rossi Impianti srl" sono
// la stessa ditta e devono produrre la stessa chiave. Lista deliberatamente
// conservativa: token di una o due lettere come `sc`/`ss` sono esclusi perché
// troppo corti per distinguere una forma societaria da un pezzo di nome
// proprio, e scartarli per errore accorperebbe sotto la stessa chiave due
// ditte diverse — un falso positivo qui propone all'umano il fornitore
// sbagliato, che è peggio di non proporne nessuno.
const FORME_SOCIETARIE = new Set([
  'srl', 'srls', 'sas', 'snc', 'spa', 'sapa', 'scarl', 'scrl',
  'soc', 'societa', 'cooperativa',
])

// Normalizza una ragione sociale a chiave di confronto: minuscole, accenti
// ridotti alla lettera base, punteggiatura via, spazi compattati, forme
// societarie scartate.
//
// PERCHE' ESISTE: il match del fornitore proposto da una dichiarazione di
// conformità passa per il nome quando la partita IVA del documento non è in
// anagrafica. `suppliers.name` è testo libero digitato a mano, la ragione
// sociale del documento è testo estratto dall'AI: la stessa impresa arriva
// dalle due parti con punteggiatura e forma societaria diverse. Nessun indice
// del DB può fare questo confronto (nessuna migrazione in questo blocco), e
// comunque il confronto va fatto sui DUE lati normalizzati allo stesso modo —
// per questo la funzione è l'unica fonte di verità, usata sia dal pannello di
// revisione sia dalla server action che riverifica il match prima di scrivere.
//
// Il risultato NON è un'identità: due imprese omonime collassano sulla stessa
// chiave. E' per questo che un match per nome resta un suggerimento da
// confermare a mano, mai un collegamento automatico.
//
// null → null. Nome composto di sole forme societarie (es. "S.r.l.") → null,
// non stringa vuota: una chiave vuota matcherebbe qualunque altra chiave vuota.
export function normalizeCompanyName(raw: string | null): string | null {
  if (raw === null) return null

  const tokens = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(t => t.length > 0)

  // Sequenze di iniziali puntate arrivano qui già spezzate in token di una
  // lettera ("S. R. L." → s, r, l): riunirle è ciò che rende "S. R. L."
  // equivalente a "srl" e quindi scartabile come forma societaria.
  const compattati: string[] = []
  let inSequenzaIniziali = false
  for (const t of tokens) {
    if (t.length === 1) {
      if (inSequenzaIniziali) compattati[compattati.length - 1] += t
      else { compattati.push(t); inSequenzaIniziali = true }
    } else {
      compattati.push(t)
      inSequenzaIniziali = false
    }
  }

  const significativi = compattati.filter(t => !FORME_SOCIETARIE.has(t))
  const chiave = significativi.join(' ')
  return chiave.length > 0 ? chiave : null
}

export type SupplierProposalCandidate = {
  id: string
  name: string
  vat_number: string | null
}

// Stato corrente dei collegamenti "ha realizzato" già presenti sulla
// residenza: serve solo a riconoscere un collegamento già esistente prima di
// proporlo di nuovo. Il vincolo UNIQUE (supplier_id, residence_id, sistema)
// della 039 resta l'autorità: questo è UX, non integrità.
export type SupplierInstallationRef = {
  supplier_id: string
  sistema: string
}

export type SupplierProposal =
  | { kind: 'non_applicabile' }
  | { kind: 'sistema_mancante'; ragioneSociale: string }
  | { kind: 'gia_collegato'; sistema: Sistema; supplier: SupplierProposalCandidate }
  | { kind: 'per_piva'; sistema: Sistema; supplier: SupplierProposalCandidate; partitaIva: string }
  | {
      kind: 'simile_per_nome'
      sistema: Sistema
      supplier: SupplierProposalCandidate
      ragioneSociale: string
      partitaIva: string | null
      altriOmonimi: number
    }
  | { kind: 'nessun_match'; sistema: Sistema; ragioneSociale: string; partitaIva: string | null }

// Decide l'esito della proposta di fornitore per un documento. Funzione pura:
// nessuna query, nessuna scrittura.
//
// FONTE UNICA DI DUE SUPERFICI: il pannello di revisione la chiama per
// decidere cosa mostrare, e la server action la richiama server-side per
// riverificare l'esito prima di scrivere, ignorando qualunque cosa dica il
// client. Se le due superfici calcolassero l'esito ognuna a modo suo, un
// client manipolato potrebbe far collegare un fornitore che nessuna proposta
// aveva mai suggerito.
//
// ORDINE DEI RAMI (non riordinare): la partita IVA vince sempre sul nome. E'
// l'unica chiave che identifica un'impresa; il nome è un suggerimento. Se il
// documento porta una P.IVA presente in anagrafica, quel fornitore è il
// fornitore, anche se un altro ha un nome più simile.
export function buildSupplierProposal(input: {
  docType: DocType | null
  sistema: Sistema | null
  ragioneSociale: string | null
  partitaIva: string | null
  fornitori: SupplierProposalCandidate[]
  installazioni: SupplierInstallationRef[]
}): SupplierProposal {
  const { docType, sistema, fornitori, installazioni } = input

  // Solo le dichiarazioni di conformità dichiarano un'impresa installatrice
  // (route.ts azzera i due campi per ogni altro doc_type): su tutto il resto
  // la sezione non esiste.
  if (docType !== 'dich_conformita_dm37') return { kind: 'non_applicabile' }

  // La ragione sociale è obbligatoria perché è l'unica cosa che rende la
  // proposta leggibile ("collega X come esecutore di Y") e perché
  // suppliers.name è NOT NULL: senza nome non si può né mostrare né creare.
  // L'AI può restituire stringa vuota (route.ts:121 accetta ''), non solo null.
  const ragioneSociale = input.ragioneSociale?.trim() ?? ''
  if (ragioneSociale.length === 0) return { kind: 'non_applicabile' }

  // documents.sistema è la sola fonte del sistema del collegamento, e
  // supplier_installations.sistema è NOT NULL: senza classificazione
  // dell'impianto non c'è nulla da proporre, va corretta prima.
  if (sistema === null) return { kind: 'sistema_mancante', ragioneSociale }

  const partitaIva = normalizeVatNumber(input.partitaIva)

  const esito = (supplier: SupplierProposalCandidate): SupplierProposal | null =>
    installazioni.some(i => i.supplier_id === supplier.id && i.sistema === sistema)
      ? { kind: 'gia_collegato', sistema, supplier }
      : null

  if (partitaIva !== null) {
    // Entrambi i lati normalizzati: suppliers.vat_number è salvato grezzo
    // (solo trim), quindi "IT 01234567891" in anagrafica e "01234567891" nel
    // documento sono la stessa P.IVA solo dopo questa normalizzazione.
    const perPiva = fornitori.find(f => normalizeVatNumber(f.vat_number) === partitaIva)
    if (perPiva) {
      return esito(perPiva) ?? { kind: 'per_piva', sistema, supplier: perPiva, partitaIva }
    }
  }

  const chiaveNome = normalizeCompanyName(ragioneSociale)
  if (chiaveNome !== null) {
    const omonimi = fornitori
      .filter(f => normalizeCompanyName(f.name) === chiaveNome)
      .sort((a, b) => a.id.localeCompare(b.id))
    if (omonimi.length > 0) {
      const [proposto] = omonimi
      return esito(proposto) ?? {
        kind: 'simile_per_nome',
        sistema,
        supplier: proposto,
        ragioneSociale,
        partitaIva,
        // Due fornitori del costruttore possono avere lo stesso nome
        // normalizzato (l'indice unico della 039 copre la P.IVA, non il nome):
        // l'omonimia va dichiarata all'umano, non risolta al posto suo.
        altriOmonimi: omonimi.length - 1,
      }
    }
  }

  return { kind: 'nessun_match', sistema, ragioneSociale, partitaIva }
}

// Partita IVA che la conferma della proposta scrive sull'anagrafica, o null se
// non ne scrive nessuna. Funzione pura, fonte unica di due superfici: il
// pannello la dichiara nella frase, la server action la scrive e la confronta
// con quanto il client ha letto.
//
//   • per_piva: mai — il fornitore è stato trovato proprio per quella P.IVA.
//   • simile_per_nome: solo se il documento ne porta una E il fornitore non ne
//     ha già una. Mai sovrascrivere: una vat_number esistente, per forza
//     diversa da quella del documento (se coincidesse l'esito sarebbe
//     per_piva), è un indizio che il match per nome è sbagliato, non un dato
//     da correggere.
//   • nessun_match: quella del documento, se presente — il fornitore nasce
//     con essa.
//   • ogni altro esito non scrive nulla.
export function supplierVatNumberToWrite(proposal: SupplierProposal): string | null {
  switch (proposal.kind) {
    case 'simile_per_nome':
      return proposal.partitaIva !== null && proposal.supplier.vat_number === null
        ? proposal.partitaIva
        : null
    case 'nessun_match':
      return proposal.partitaIva
    default:
      return null
  }
}
