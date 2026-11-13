export type MaintenanceIllustrationAsset = {
  src: `/manutenzioni/${string}`
  alt: string
  width: number
  height: number
}

type IllustrationSet = {
  key: 'vmc-filtri' | 'serramenti'
  version: 2
  overview?: MaintenanceIllustrationAsset
  steps: readonly (MaintenanceIllustrationAsset | undefined)[]
}

// UUID confermati dall'utente su Supabase il 12/11/2026, non garantiti
// negli altri ambienti. Le immagini illustrano solo il contesto, mai procedure.
const ASSETS = {
  vmcOverview: { src: '/manutenzioni/vmc-vano-filtri.jpg', alt: 'Esempio illustrativo di filtri VMC; non rappresenta il modello installato e non mostra una procedura.', width: 320, height: 252 },
  windowDetail: { src: '/manutenzioni/serramento-maniglia-dettaglio.jpg', alt: 'Esempio illustrativo di maniglia; forma e meccanismo possono differire dal serramento installato.', width: 214, height: 307 },
} as const satisfies Record<string, MaintenanceIllustrationAsset>

const REGISTRY: Readonly<Record<string, IllustrationSet>> = {
  '010214e7-7058-4d5d-a70c-69654aa66fa0': {
    key: 'vmc-filtri',
    version: 2,
    overview: ASSETS.vmcOverview,
    // Le foto di estrazione e sostituzione suggerirebbero passaggi esclusi dalla guida.
    steps: [undefined, undefined, undefined],
  },
  '132b0e68-61e1-420b-adc6-e54703f49415': {
    key: 'serramenti',
    version: 2,
    overview: ASSETS.windowDetail,
    // Il dettaglio della maniglia accompagna la sola osservazione del movimento.
    steps: [ASSETS.windowDetail, undefined, undefined],
  },
}

// Questo resolver associa soltanto immagini alle due voci già autorizzate.
export function resolveMaintenanceIllustrations(
  templateId: string | null | undefined,
): IllustrationSet | null {
  if (!templateId || !Object.hasOwn(REGISTRY, templateId)) return null
  return REGISTRY[templateId]
}
