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
  noticeTitle?: string
  closingMessage?: string
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
  [RESIDENT_GUIDE_TEMPLATE_IDS.cookerHood]: {
    title: 'Conoscere la cappa e i suoi filtri',
    description: 'Informazioni per capire le diverse parti della cappa, individuare le indicazioni adatte al modello installato e riconoscere quando chiedere assistenza.',
    beforeStart: 'Le cappe possono avere configurazioni e filtri diversi. Questa guida non descrive operazioni di smontaggio o pulizia.',
    whoCanIntervene: 'La cura delle parti accessibili dipende dal modello. Gli interventi sui condotti e sui componenti interni vanno affidati a personale qualificato.',
    steps: [
      {
        title: 'Filtri e condotti hanno funzioni diverse',
        body: 'I filtri antigrasso trattengono parte dei grassi prodotti durante la cottura. In alcune cappe a ricircolo può essere presente anche un filtro a carbone, che contribuisce a ridurre gli odori. I condotti convogliano l’aria verso l’esterno quando previsti dalla configurazione.',
      },
      {
        title: 'Individua le indicazioni per il tuo modello',
        body: 'Tipo di filtro, ricambio e modalità di cura cambiano tra i modelli: non tutti i filtri sono lavabili. Se marca e modello non sono noti, chiedi al venditore, all’installatore o al referente della casa di aiutarti a identificarli prima di scegliere come intervenire.',
      },
      {
        title: 'Riconosci quando chiedere assistenza',
        body: 'Aspirazione ridotta, rumori insoliti o odori persistenti possono richiedere un controllo. Per i condotti, i componenti interni o un’anomalia che non si risolve con le indicazioni applicabili al modello, rivolgiti a personale qualificato e conserva il rapporto dell’intervento.',
      },
    ],
  },
  [RESIDENT_GUIDE_TEMPLATE_IDS.climateSystem]: {
    title: 'Conoscere la manutenzione della climatizzazione',
    description: 'Informazioni per distinguere la cura ordinaria dell’apparecchio dagli interventi tecnici e preparare la richiesta di assistenza.',
    beforeStart: 'Il piano può riportare una frequenza configurata. I 12 mesi del catalogo non sono automaticamente un obbligo valido per ogni impianto: il tecnico verifica la periodicità del fabbricante e gli eventuali obblighi applicabili.',
    whoCanIntervene: 'La manutenzione tecnica va affidata a personale qualificato. La cura ordinaria consentita all’utente dipende dall’apparecchio e dalle relative indicazioni; non intervenire sui circuiti frigoriferi o sui componenti elettrici.',
    steps: [
      {
        title: 'Cura ordinaria e manutenzione tecnica',
        body: 'Le attività ordinarie accessibili all’utente non coincidono con il controllo tecnico dell’impianto. La configurazione e le verifiche necessarie cambiano in base all’apparecchio: chiedi al referente o al tecnico quali indicazioni si applicano al modello installato.',
      },
      {
        title: 'Prepara le informazioni per la prenotazione',
        body: 'Quando richiedi un intervento, comunica marca e modello se disponibili, il tipo di apparecchio, eventuali anomalie osservate e gli interventi precedenti. Se non conosci il modello, chiedi al referente della casa o all’installatore come identificarlo.',
      },
      {
        title: 'Controlli e documenti dell’intervento',
        body: 'Il personale qualificato stabilisce le verifiche pertinenti alle caratteristiche dell’impianto e agli obblighi eventualmente applicabili. Chiedi e conserva il rapporto dell’intervento e gli aggiornamenti della documentazione dell’impianto, quando previsti.',
      },
    ],
  },
  [RESIDENT_GUIDE_TEMPLATE_IDS.airConditionerFilters]: {
    title: 'Conoscere i filtri del climatizzatore',
    description: 'Informazioni generali sulla funzione dei filtri, sulle differenze tra apparecchi e su quando chiedere assistenza.',
    beforeStart: 'Il promemoria del catalogo riporta una frequenza di 6 mesi. È un riferimento configurato, non una regola valida per ogni apparecchio: verifica le indicazioni del fabbricante per il modello installato.',
    whoCanIntervene: 'Tipologia, pulizia e sostituzione dei filtri dipendono dall’apparecchio. Se le indicazioni applicabili non sono chiare o l’intervento richiede di aprire l’unità, rivolgiti a un tecnico.',
    steps: [
      {
        title: 'A cosa servono i filtri',
        body: 'I filtri trattengono particelle presenti nell’aria e contribuiscono al corretto funzionamento dell’apparecchio. Stato e manutenzione possono influire sul flusso d’aria e sulle prestazioni.',
      },
      {
        title: 'Filtri diversi richiedono indicazioni diverse',
        body: 'Alcuni filtri sono lavabili, altri devono essere sostituiti e possono esistere tipologie con esigenze differenti. Non dedurre il trattamento dal solo aspetto: individua marca e modello dalla documentazione disponibile o dalla targhetta accessibile senza aprire l’unità, poi consulta le indicazioni del fabbricante.',
      },
      {
        title: 'Quando chiedere assistenza',
        body: 'Se il filtro è danneggiato, non riesci a identificarne il tipo, noti prestazioni insolite o le indicazioni non sono chiare, chiedi supporto al referente dell’impianto o a un tecnico. Non smontare l’apparecchio né provare modalità di pulizia non previste per quel modello.',
      },
    ],
  },
  [RESIDENT_GUIDE_TEMPLATE_IDS.interiorPainting]: {
    title: 'Osservare e rinnovare la pittura interna',
    description: 'Informazioni per valutare lo stato delle superfici e capire quando è opportuno chiedere un parere prima di imbiancare.',
    beforeStart: 'Il promemoria del catalogo riporta una frequenza di 36 mesi. È un riferimento configurato, non un obbligo né la durata effettiva di ogni pittura: valuta lo stato delle superfici e le caratteristiche dell’ambiente.',
    whoCanIntervene: 'La scelta e l’applicazione della pittura dipendono dal supporto e dalle condizioni della superficie. In presenza di umidità, macchie ricorrenti, muffa o possibili infiltrazioni, chiedi una valutazione tecnica prima di tinteggiare.',
    steps: [
      {
        title: 'Quando può essere utile rinnovare',
        body: 'La pittura può deteriorarsi o perdere uniformità con l’uso e il passare del tempo. Valuta il rinnovo in base alle condizioni osservate, senza considerare la frequenza del promemoria come una scadenza obbligatoria.',
      },
      {
        title: 'Osserva le superfici e il supporto',
        body: 'Nota distacchi, crepe, macchie o differenze di colore e considera il tipo e lo stato del supporto. La pittura va scelta secondo le caratteristiche della superficie e le indicazioni del relativo produttore; se hai dubbi, chiedi un parere qualificato.',
      },
      {
        title: 'Prima di coprire macchie o muffa',
        body: 'Umidità persistente, aloni che ricompaiono, muffa o segni compatibili con un’infiltrazione possono avere cause da accertare. Non coprirli con una semplice tinteggiatura: chiedi una valutazione tecnica per individuare l’origine e gli interventi necessari.',
      },
    ],
  },
  [RESIDENT_GUIDE_TEMPLATE_IDS.differentialTest]: {
    title: 'Capire la prova del differenziale',
    description: 'Informazioni per comprendere la funzione del tasto T, considerare l’interruzione dell’alimentazione e riconoscere quando chiedere assistenza.',
    beforeStart: 'Questa guida spiega la funzione e i limiti del test, ma non sostituisce le istruzioni del dispositivo installato. Una risposta positiva del tasto non certifica la sicurezza dell’intero impianto.',
    whoCanIntervene: 'La prova può interrompere l’alimentazione dei circuiti protetti. Se non hai identificato quali circuiti dipendono dal dispositivo o l’interruzione può creare un rischio, non procedere. Non rimuovere coperture né accedere ai componenti interni; in caso di dubbio o anomalia, contatta un elettricista qualificato.',
    noticeTitle: 'Avviso di sicurezza',
    closingMessage: 'Per sapere se e quando effettuare il test, consulta le istruzioni del dispositivo installato. Se non sono disponibili o hai dubbi sulla sicurezza, chiedi a un elettricista qualificato. La lettura non conferma né registra l’esecuzione di una manutenzione.',
    steps: [
      {
        title: 'A cosa serve il tasto T',
        body: 'Il differenziale rileva alcune dispersioni di corrente e interrompe l’alimentazione dei circuiti protetti. Il tasto T attiva il circuito interno di prova, che simula una dispersione e dovrebbe far intervenire il dispositivo. Il test riguarda la risposta del differenziale e non verifica da solo l’intero impianto.',
      },
      {
        title: 'Considera l’interruzione dell’alimentazione',
        body: 'Quando il dispositivo interviene, può interrompere l’alimentazione dei circuiti che protegge, comprese luci e apparecchi collegati. Prima di seguire le indicazioni specifiche del dispositivo, considera quali servizi dipendono da quei circuiti. Se non puoi valutare l’effetto dell’interruzione, chiedi supporto a un elettricista qualificato.',
      },
      {
        title: 'Segui le indicazioni del modello e chiedi assistenza',
        body: 'Il piano riporta una frequenza di 6 mesi come promemoria del catalogo, non come regola universale. Frequenza e risposta attesa dipendono dal dispositivo e dalle relative istruzioni. Se il tasto non produce la risposta prevista, il dispositivo scatta in modo inatteso o non riesci a identificare il modello, non intervenire: contatta un elettricista qualificato.',
      },
    ],
  },
}

export function getResidentGuideContent(templateId: string | null | undefined): ResidentGuideContent | null {
  return templateId ? GUIDE_CONTENT[templateId] ?? null : null
}
