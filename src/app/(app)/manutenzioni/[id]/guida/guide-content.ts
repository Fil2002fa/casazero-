import { RESIDENT_GUIDE_TEMPLATE_IDS } from '../../guide-eligibility'

export type ResidentGuideStep = {
  title: string
  body: string
}

export type ResidentGuideContent = {
  title: string
  description: string
  beforeStart: string
  whoCanIntervene: string
  steps: readonly ResidentGuideStep[]
}

const GUIDE_CONTENT: Readonly<Record<string, ResidentGuideContent>> = {
  [RESIDENT_GUIDE_TEMPLATE_IDS.vmcFilters]: {
    title: 'Conoscere i filtri della VMC',
    description: 'Informazioni generali per conoscere la funzione dei filtri e capire quando chiedere assistenza. Le immagini, se presenti, sono illustrative e non identificano l’impianto installato.',
    beforeStart: 'Questa guida offre informazioni generali e non descrive la sostituzione dei filtri.',
    whoCanIntervene: 'Puoi osservare eventuali avvisi o anomalie dall’esterno dell’unità. Non aprire l’apparecchio o sostituire i filtri per tentativi. Se non conosci la procedura prevista per il tuo impianto, rivolgiti a un tecnico della ventilazione.',
    steps: [
      {
        title: 'A cosa servono i filtri',
        body: 'I filtri trattengono polvere e particelle presenti nell’aria. Con il tempo possono accumulare sporco e ridurre l’efficienza del sistema.',
      },
      {
        title: 'Cosa puoi osservare',
        body: 'Eventuali avvisi dell’apparecchio, rumori insoliti o cambiamenti nella ventilazione sono segnali da approfondire. Non aprire o smontare l’unità per effettuare controlli non previsti.',
      },
      {
        title: 'Quando chiedere assistenza',
        body: 'La procedura di sostituzione dipende dall’impianto installato. Se non sai come intervenire, rivolgiti a un tecnico. Conserva la data e gli eventuali documenti dell’intervento.',
      },
    ],
  },
  [RESIDENT_GUIDE_TEMPLATE_IDS.windows]: {
    title: 'Prendersi cura dei serramenti',
    description: 'Indicazioni informative per osservare lo stato dei serramenti e riconoscere quando è opportuno chiedere assistenza.',
    beforeStart: 'Questa guida riguarda il movimento e la cura leggera delle sole parti accessibili.',
    whoCanIntervene: 'Puoi controllare il movimento dei serramenti e pulire delicatamente le superfici accessibili. Per la lubrificazione, le regolazioni o lo smontaggio dei componenti, rivolgiti a un serramentista qualificato.',
    steps: [
      {
        title: 'Controlla il movimento',
        body: 'Osserva se porte e finestre si aprono e si chiudono normalmente, senza forzarle.',
      },
      {
        title: 'Cura le parti accessibili',
        body: 'Rimuovi delicatamente polvere e sporco dalle superfici e dalle guide visibili, senza smontare componenti o intervenire sui meccanismi.',
      },
      {
        title: 'Riconosci quando serve assistenza',
        body: 'Se noti resistenza, rumori insoliti o difficoltà di chiusura, rivolgiti a un serramentista. Non effettuare regolazioni o applicare lubrificanti non verificati per quel serramento.',
      },
    ],
  },
}

export function getResidentGuideContent(templateId: string | null | undefined): ResidentGuideContent | null {
  return templateId ? GUIDE_CONTENT[templateId] ?? null : null
}
