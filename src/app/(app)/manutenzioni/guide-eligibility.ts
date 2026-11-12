import type { CompletionMode, ItemActivation } from '@/types/database'

type GuideProcedure = {
  titles: string[]
  steps: string[]
  whoDoesIt: string
}

// Allowlist chiusa: un contenuto cambiato o non riconosciuto resta fuori dalla guida.
// Le procedure sono confrontate con il catalogo (migrazione 056), non copiate nella UI.
const REVIEWED_PROCEDURES: GuideProcedure[] = [
  {
    titles: ['Sostituzione filtri VMC', 'VMC: sostituzione filtri'],
    steps: [
      'Spegni l’unità come indicato nel manuale.',
      'Estrai i filtri e inserisci quelli compatibili.',
      'Richiudi lo sportello e annota la data.',
    ],
    whoDoesIt: 'Tu puoi sostituire i filtri accessibili se il manuale lo permette. Altrimenti chiama un tecnico della ventilazione.',
  },
  {
    titles: ['Controllo e lubrificazione serramenti'],
    steps: [
      'Pulisci cerniere e guide accessibili.',
      'Usa solo il lubrificante indicato dal produttore.',
      'Apri e chiudi il serramento per verificarne il movimento.',
    ],
    whoDoesIt: 'Tu puoi pulire le parti accessibili e lubrificare solo dove lo indica il manuale. Per le regolazioni chiama un serramentista.',
  },
]

export function isResidentGuideAvailable(input: {
  isClient: boolean
  isOwnUnit: boolean
  isApartmentItem: boolean
  completionMode: CompletionMode | null
  activationStatus: ItemActivation
  templateActive: boolean
  title: string | null
  whoDoesIt: string | null
  howTo: string[] | null
}): boolean {
  if (
    !input.isClient ||
    !input.isOwnUnit ||
    !input.isApartmentItem ||
    input.completionMode !== 'residente' ||
    input.activationStatus !== 'inclusa' ||
    !input.templateActive ||
    !input.title ||
    !input.whoDoesIt?.trim() ||
    !Array.isArray(input.howTo) ||
    input.howTo.length === 0 ||
    input.howTo.some(step => typeof step !== 'string' || !step.trim())
  ) return false

  return REVIEWED_PROCEDURES.some(procedure =>
    procedure.titles.includes(input.title!) &&
    input.whoDoesIt === procedure.whoDoesIt &&
    input.howTo!.length === procedure.steps.length &&
    procedure.steps.every((step, index) => input.howTo![index] === step),
  )
}
