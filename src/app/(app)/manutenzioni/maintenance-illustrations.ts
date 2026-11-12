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
  }[]
}

// UUID confermati dall'utente su Supabase il 12/11/2026, non garantiti
// negli altri ambienti. Nessun riconoscimento per titolo in assenza dell'UUID.
// I testi sono firme di revisione, mai una fonte di istruzioni per la UI.
// Aggiungere solo asset revisionati; cambiare versione quando cambia la procedura.
const REGISTRY: Readonly<Record<string, IllustrationSet>> = {
  '010214e7-7058-4d5d-a70c-69654aa66fa0': {
    key: 'vmc-filtri',
    version: 1,
    titles: ['Sostituzione filtri VMC', 'VMC: sostituzione filtri'],
    steps: [
      { key: 'spegnimento', expectedText: 'Spegni l’unità come indicato nel manuale.' },
      { key: 'sostituzione', expectedText: 'Estrai i filtri e inserisci quelli compatibili.' },
      { key: 'chiusura', expectedText: 'Richiudi lo sportello e annota la data.' },
    ],
  },
  '132b0e68-61e1-420b-adc6-e54703f49415': {
    key: 'serramenti',
    version: 1,
    titles: ['Controllo e lubrificazione serramenti'],
    steps: [
      { key: 'pulizia', expectedText: 'Pulisci cerniere e guide accessibili.' },
      { key: 'lubrificazione', expectedText: 'Usa solo il lubrificante indicato dal produttore.' },
      { key: 'verifica-movimento', expectedText: 'Apri e chiudi il serramento per verificarne il movimento.' },
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
