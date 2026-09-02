// Fonte unica per il vocabolario delle dotazioni di una residenza.
//
// Il legame col catalogo è PER VALORE: ogni `key` qui dev'essere identica a un
// maintenance_templates.condition_key, e viene scritta in
// residence_features.feature_key dalla RPC czero_create_residence_with_units
// (034_rpc_creazione_condizionale.sql:126). Nessuna FK, nessun CHECK Postgres:
// è la scelta deliberata della 030 (aggiungere una dotazione dev'essere una
// riga di catalogo e zero DDL), che però lascia il vocabolario senza guardie
// lato database. Questa costante È la guardia, e vive solo qui.
//
// PERCHÉ IMPORTA (debito dichiarato in 034:393-409): un typo in una `key` non
// produce nessun errore. La riga si scrive comunque in residence_features, non
// combacia con nessun condition_key, il template resta fuori dal piano e la
// voce semplicemente non esiste — nessuna eccezione, da nessuna parte. Il
// piano nasce incompleto in silenzio. Per questo il tipo FeatureKey è derivato
// dalla lista e non riscritto a mano: le due cose non possono divergere.
//
// 19 dotazioni per 21 template condizionati: `ascensore` e `autoclave` ne
// governano due ciascuna (verificato su DB il 2026-08-26).
//
// La coincidenza esatta fra queste chiavi e i condition_key a catalogo è
// verificata da scripts/verify-residence-features.mjs, che esce non-zero
// appena le due liste divergono in una qualsiasi delle due direzioni.
//
// ============================================================
// DEBITO APERTO — due limiti del vocabolario a CATALOGO (non di questa
// costante: le etichette qui sotto descrivono fedelmente le chiavi che
// esistono). Entrambi richiedono una migrazione su maintenance_templates,
// entrambi sono fuori scope dal ciclo wizard, entrambi da riprendere DOPO
// l'accensione delle 16 voci spente.
//
// (a) `generatore_gas` esclude i generatori a gasolio e a combustibile
//     solido, per i quali l'RCEE è comunque dovuto — con periodicità 24 mesi
//     (liquido/solido 10-100 kW) e 12 mesi (liquido/solido oltre 100 kW),
//     come elenca la description del template stesso. Conseguenza: un
//     condominio a gasolio NON riceve la voce. Non è un errore di etichetta,
//     è la chiave a essere più stretta dell'obbligo che governa. La chiusura
//     è una chiave più generale (es. `generatore_termico`) più la
//     periodicità risolta per combustibile, non un'etichetta diversa.
//
// (b) `presidi_antincendio` governa i SOLI estintori (un template, UNI
//     9994-1), mentre in italiano tecnico "presidi antincendio" indica
//     l'intero pacchetto — idranti, porte REI, illuminazione, IRAI ed EFC,
//     che qui hanno ciascuno la propria chiave. L'etichetta "Estintori"
//     corregge il tiro lato UI, ma il nome della chiave resta fuorviante per
//     chiunque legga il catalogo o scriva la pipeline AI di B5.
// ============================================================

export const RESIDENCE_FEATURES = [
  // ── Ascensore ─────────────────────────────────────────────────────────
  {
    key: 'ascensore',
    label: 'Ascensore o montacarichi',
    group: 'Ascensore',
  },

  // ── Antincendio ───────────────────────────────────────────────────────
  {
    key: 'presidi_antincendio',
    label: 'Estintori',
    group: 'Antincendio',
  },
  {
    key: 'rete_idranti',
    label: 'Rete idranti o naspi',
    group: 'Antincendio',
  },
  {
    key: 'porte_rei',
    label: 'Porte tagliafuoco o maniglioni antipanico',
    group: 'Antincendio',
  },
  {
    key: 'illuminazione_emergenza',
    label: 'Illuminazione di emergenza',
    group: 'Antincendio',
  },
  {
    key: 'impianto_rivelazione_incendi',
    label: 'Impianto di rivelazione incendi',
    group: 'Antincendio',
  },
  {
    key: 'evacuatori_fumo',
    label: 'Evacuatori di fumo e calore',
    group: 'Antincendio',
  },

  // ── Idrico e sanitario ────────────────────────────────────────────────
  {
    key: 'autoclave',
    label: 'Autoclave o serbatoio acqua potabile',
    group: 'Idrico e sanitario',
  },
  {
    key: 'acs_centralizzata',
    label: 'Acqua calda sanitaria centralizzata',
    group: 'Idrico e sanitario',
  },
  {
    key: 'sollevamento_reflue',
    label: 'Impianto di sollevamento acque reflue',
    group: 'Idrico e sanitario',
  },
  {
    key: 'fossa_biologica',
    label: 'Fossa biologica o separatore grassi',
    group: 'Idrico e sanitario',
  },

  // ── Termico ───────────────────────────────────────────────────────────
  {
    key: 'centrale_termica',
    label: 'Centrale termica condominiale',
    group: 'Termico',
  },
  {
    key: 'generatore_gas',
    label: 'Il generatore è alimentato a gas',
    group: 'Termico',
    help: 'Spunta anche questa se la centrale termica o la caldaia condominiale è a gas: fa scattare il controllo di efficienza energetica (RCEE), che è un adempimento distinto dalla manutenzione',
  },
  {
    key: 'canna_fumaria_collettiva',
    label: 'Canna fumaria collettiva (legna, pellet, gasolio)',
    group: 'Termico',
  },

  // ── Accessi ed esterni ────────────────────────────────────────────────
  {
    key: 'cancello_motorizzato',
    label: 'Cancello o portone motorizzato',
    group: 'Accessi ed esterni',
  },

  // ── Altro ─────────────────────────────────────────────────────────────
  {
    key: 'lucernari',
    label: 'Lucernari o finestre da tetto',
    group: 'Altro',
  },
  {
    key: 'antenna_centralizzata',
    label: 'Antenna TV o parabola centralizzata',
    group: 'Altro',
  },
  {
    key: 'impianto_fotovoltaico',
    label: 'Impianto fotovoltaico',
    group: 'Altro',
  },
  {
    key: 'luogo_di_lavoro',
    label: 'Il condominio è luogo di lavoro',
    group: 'Altro',
    help: 'Portiere o manutentore dipendente, oppure accesso regolare di ditte terze alle parti comuni',
  },
] as const satisfies readonly {
  key: string
  label: string
  group: string
  help?: string
}[]

// Derivati dalla lista, mai riscritti a mano: è ciò che impedisce a una chiave
// di esistere nel tipo senza esistere nel catalogo, e viceversa.
export type FeatureKey = (typeof RESIDENCE_FEATURES)[number]['key']
export type FeatureGroup = (typeof RESIDENCE_FEATURES)[number]['group']

// L'ordine dei gruppi È l'ordine di prima comparsa in RESIDENCE_FEATURES:
// Set conserva l'ordine di inserimento, quindi riordinare la lista riordina
// l'interfaccia, e le sei stringhe restano scritte una volta sola. Elencarle
// di nuovo qui darebbe due fonti di verità che typecheckerebbero anche dopo
// essere divergute — un gruppo aggiunto alla lista e dimenticato qui
// sparirebbe dall'interfaccia senza errore.
export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  ...new Set(RESIDENCE_FEATURES.map(f => f.group)),
]

// Nome del campo form di una dotazione. Vive qui perché il prefisso è un
// contratto fra due superfici — il wizard che rende le checkbox e la server
// action che le rilegge — e un prefisso scritto a mano in due file può
// divergere senza che niente lo segnali: le caselle continuerebbero a
// spuntarsi e il server leggerebbe sempre e solo "no".
export function featureFieldName(key: FeatureKey): string {
  return `feature_${key}`
}
