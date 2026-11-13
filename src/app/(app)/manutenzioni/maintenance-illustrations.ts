export type MaintenanceIllustrationAsset = {
  src: `/manutenzioni/${string}`
  alt: string
  width: number
  height: number
}

type IllustrationSet = {
  key: 'vmc-filtri' | 'serramenti'
  version: 1
  titles: readonly string[]
  overview?: MaintenanceIllustrationAsset
  steps: readonly {
    key: string
    expectedText: string
    illustration?: MaintenanceIllustrationAsset
    additionalIllustrations?: readonly MaintenanceIllustrationAsset[]
  }[]
}

// UUID confermati dall'utente su Supabase il 12/11/2026, non garantiti
// negli altri ambienti. Nessun riconoscimento per titolo in assenza dell'UUID.
// I testi sono firme di revisione, mai una fonte di istruzioni per la UI.
// Aggiungere solo asset revisionati; cambiare versione quando cambia la procedura.
const ASSETS = {
  vmcOverview: { src: '/manutenzioni/vmc-vano-filtri.jpg', alt: 'Esempio illustrativo di vano filtri VMC, non riferito al modello installato.', width: 320, height: 252 },
  vmcRemove: { src: '/manutenzioni/vmc-estrazione-filtro.jpg', alt: 'Esempio illustrativo di estrazione di un filtro dal vano VMC.', width: 349, height: 364 },
  vmcReplace: { src: '/manutenzioni/vmc-sostituzione-filtro.jpg', alt: 'Illustrazione di un filtro VMC e del vano di accesso; orientamento da verificare nel manuale.', width: 305, height: 292 },
  windowOverview: { src: '/manutenzioni/serramento-panoramica.jpg', alt: 'Serramento con panno e flacone illustrativi; utilizzare solo prodotti indicati dal produttore.', width: 296, height: 188 },
  windowDetail: { src: '/manutenzioni/serramento-maniglia-dettaglio.jpg', alt: 'Dettaglio illustrativo della maniglia e del bordo di un serramento.', width: 214, height: 307 },
} as const satisfies Record<string, MaintenanceIllustrationAsset>

const REGISTRY: Readonly<Record<string, IllustrationSet>> = {
  '010214e7-7058-4d5d-a70c-69654aa66fa0': {
    key: 'vmc-filtri',
    version: 1,
    titles: ['Sostituzione filtri VMC', 'VMC: sostituzione filtri'],
    overview: ASSETS.vmcOverview,
    steps: [
      { key: 'spegnimento', expectedText: 'Spegni l’unità come indicato nel manuale.' },
      { key: 'sostituzione', expectedText: 'Estrai i filtri e inserisci quelli compatibili.', illustration: ASSETS.vmcRemove, additionalIllustrations: [ASSETS.vmcReplace] },
      { key: 'chiusura', expectedText: 'Richiudi lo sportello e annota la data.' },
    ],
  },
  '132b0e68-61e1-420b-adc6-e54703f49415': {
    key: 'serramenti',
    version: 1,
    titles: ['Controllo e lubrificazione serramenti'],
    overview: ASSETS.windowOverview,
    steps: [
      { key: 'pulizia', expectedText: 'Pulisci cerniere e guide accessibili.' },
      { key: 'lubrificazione', expectedText: 'Usa solo il lubrificante indicato dal produttore.', illustration: ASSETS.windowOverview },
      { key: 'verifica-movimento', expectedText: 'Apri e chiudi il serramento per verificarne il movimento.', illustration: ASSETS.windowDetail },
    ],
  },
}

// Questo resolver associa soltanto immagini: non abilita mai una guida.
export function resolveMaintenanceIllustrations(
  templateId: string | null | undefined,
  title: string | null | undefined,
  steps: readonly string[] | null | undefined,
): IllustrationSet | null {
  if (!templateId || !Object.hasOwn(REGISTRY, templateId)) return null
  const entry = REGISTRY[templateId]
  if (!title || !entry.titles.includes(title) || !steps ||
      steps.length !== entry.steps.length ||
      entry.steps.some((step, index) => step.expectedText !== steps[index])) return null
  return entry
}
