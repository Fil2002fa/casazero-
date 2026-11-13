import { COMMON_GUIDE_TEMPLATE_IDS, RESIDENT_GUIDE_TEMPLATE_IDS } from '../../guide-eligibility'

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
  // Fonti: DPR 162/1999, artt. 15 (manutenzione) e 16 (libretto).
  // https://www.comune.roma.it/web-resources/cms/documents/barriere_dpr_162_1999.pdf
  [COMMON_GUIDE_TEMPLATE_IDS.liftMaintenance]: {
    title: 'Conoscere la manutenzione ordinaria dell’ascensore',
    description: 'Informazioni sui controlli dell’ascensore comune e sul ruolo del residente.',
    beforeStart: 'La manutenzione ordinaria e la verifica periodica biennale sono attività distinte. Questa guida non descrive operazioni da eseguire sull’impianto.',
    whoCanIntervene: 'Interviene il manutentore ascensorista abilitato incaricato dall’amministratore. Non accedere al vano o ai locali tecnici e non intervenire sui meccanismi.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della manutenzione.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il manutentore controlla il funzionamento dei dispositivi meccanici, idraulici ed elettrici, comprese porte e serrature. Verifica anche gli elementi di sospensione e i dispositivi di sicurezza. I controlli seguono le esigenze dell’impianto e gli obblighi applicabili.' },
      { title: 'Chi interviene', body: 'L’amministratore incarica personale abilitato alla manutenzione degli ascensori. La visita del manutentore non sostituisce la verifica periodica biennale effettuata dal soggetto competente.' },
      { title: 'Quali anomalie segnalare', body: 'Segnala all’amministratore e al manutentore rumori insoliti, blocchi o difficoltà di apertura e chiusura delle porte. Descrivi ciò che hai osservato senza tentare riparazioni o manovre di sblocco.' },
      { title: 'Quali documenti conservare', body: 'L’amministratore conserva il libretto dell’ascensore con gli esiti delle visite e le annotazioni dei controlli, insieme ai rapporti del manutentore. Se ricevi documenti dell’intervento, conservali e chiedi all’amministratore chiarimenti su eventuali anomalie riportate.' },
    ],
  },
  // Fonte: DPR 162/1999, artt. 13 (verifiche periodiche) e 16 (libretto).
  // https://www.arpamolise.it/Comunicazione/faq/ascensori/faq_ascensori.php
  [COMMON_GUIDE_TEMPLATE_IDS.liftInspection]: {
    title: 'Conoscere la verifica biennale dell’ascensore',
    description: 'Informazioni sul controllo periodico di sicurezza dell’ascensore comune, distinto dalla manutenzione ordinaria.',
    beforeStart: 'La verifica biennale è un controllo periodico distinto dalle visite di manutenzione. Il residente non deve effettuare prove sull’ascensore.',
    whoCanIntervene: 'L’amministratore incarica un organismo abilitato o l’ente competente. Il manutentore assiste alla verifica; il residente non interviene sull’impianto.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della verifica.',
    steps: [
      { title: 'Cosa viene controllato', body: 'La verifica accerta le condizioni delle parti da cui dipende la sicurezza, il funzionamento dei dispositivi di sicurezza e il rispetto delle prescrizioni delle verifiche precedenti. È distinta dalla manutenzione ordinaria.' },
      { title: 'Chi interviene', body: 'La verifica è affidata dall’amministratore al soggetto competente previsto dal DPR 162/1999, art. 13. Il manutentore fornisce l’assistenza necessaria durante il controllo.' },
      { title: 'Quali anomalie segnalare', body: 'Se osservi blocchi, rumori insoliti o problemi alle porte, informa l’amministratore e il manutentore senza aspettare la verifica biennale. Non effettuare prove o tentativi di sblocco.' },
      { title: 'Quali documenti conservare', body: 'L’amministratore conserva il verbale della verifica periodica, annotato o allegato al libretto dell’ascensore. Il verbale riporta l’esito del controllo e le eventuali prescrizioni: chiedi all’amministratore chiarimenti sulle indicazioni che riguardano l’uso dell’impianto.' },
    ],
  },
  // Fonti: ABB, Quaderno tecnico fotovoltaico, pp. 163-164 (manutenzione);
  // https://cataloghi.it.abb.com/view/734148453/163/
  // Avvisi inverter: manuale ABB PVI-6.0/8.0/10.0/12.5-TL-OUTD, cap. 8.
  // DM 37/2008, artt. 1 e 3 (imprese abilitate agli impianti elettrici).
  [COMMON_GUIDE_TEMPLATE_IDS.photovoltaic]: {
    title: 'Conoscere la manutenzione del fotovoltaico comune',
    description: 'Informazioni sui controlli dell’impianto fotovoltaico delle parti comuni e sulle segnalazioni utili all’amministratore.',
    beforeStart: 'Questa guida riguarda l’impianto comune. La periodicità e i controlli dipendono dalle caratteristiche dell’impianto e dalle indicazioni applicabili: la frequenza del piano non è una regola universale.',
    whoCanIntervene: 'L’amministratore incarica personale qualificato; gli interventi elettrici spettano a imprese abilitate. Non salire sul tetto, aprire quadri o inverter, toccare cavi o pulire i moduli.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della manutenzione del fotovoltaico comune.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il personale qualificato valuta lo stato dei moduli, dei supporti, dei collegamenti elettrici e dell’inverter, che converte l’energia prodotta dai pannelli. I controlli sono definiti per l’impianto installato e possono comprendere il monitoraggio del funzionamento.' },
      { title: 'Chi interviene', body: 'L’amministratore organizza la manutenzione con personale qualificato per l’impianto e per gli eventuali lavori in quota. Il residente può chiedere informazioni e comunicare anomalie, senza eseguire controlli tecnici o riparazioni.' },
      { title: 'Quali anomalie segnalare', body: 'Se hai accesso alle informazioni dell’impianto, segnala all’amministratore avvisi di guasto o interruzioni della produzione indicate dal monitoraggio. Comunica anche danni visibili da luoghi normalmente accessibili, senza avvicinarti ai componenti o accedere al tetto. La causa va valutata dal tecnico.' },
      { title: 'Quali documenti conservare', body: 'Chiedi all’amministratore di conservare i rapporti degli interventi con data, controlli eseguiti ed eventuali componenti sostituiti, insieme alla documentazione e alle istruzioni dell’impianto. Se ricevi copie dei rapporti, conservale come riferimento per successive segnalazioni.' },
    ],
  },
  // Fonte: BMI, cause delle infiltrazioni e componenti della copertura.
  // https://www.bmigroup.com/it/intervenire-sul-tetto/guida-tetto/comprendi-il-problema/infiltrazioni-tetto/
  [COMMON_GUIDE_TEMPLATE_IDS.roof]: {
    title: 'Conoscere il controllo del manto di copertura',
    description: 'Informazioni sul controllo del tetto comune e sui segnali che puoi comunicare all’amministratore.',
    beforeStart: 'Materiali e verifiche dipendono dalla copertura installata. Questa guida non descrive accessi al tetto o lavori in quota.',
    whoCanIntervene: 'L’amministratore incarica un coperturista o un’impresa specializzata, attrezzata per lavorare in quota. Non salire sul tetto e non spostare elementi della copertura.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione del controllo della copertura.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il tecnico valuta lo stato del manto, cercando elementi danneggiati o spostati e possibili punti di infiltrazione. Esamina i raccordi e le parti pertinenti al tipo di copertura, senza limitare la valutazione alla sola macchia visibile all’interno.' },
      { title: 'Chi interviene', body: 'Il controllo e gli eventuali interventi spettano a un’impresa specializzata incaricata dall’amministratore. Il tecnico stabilisce quali verifiche servono in base ai materiali, allo stato del tetto e alla documentazione disponibile.' },
      { title: 'Quali anomalie segnalare', body: 'Comunica all’amministratore infiltrazioni, gocciolamenti o aloni di umidità, indicando dove e quando compaiono. Segnala elementi che appaiono danneggiati solo se già visibili da luoghi normalmente accessibili, senza salire sul tetto o usare scale per controllarli.' },
      { title: 'Quali documenti conservare', body: 'Chiedi all’amministratore di conservare il rapporto di ispezione con data, zone controllate, anomalie e interventi suggeriti, insieme alle eventuali fotografie del tecnico e alla documentazione della copertura.' },
    ],
  },
  // Fonte: BMI EverGuard, lista indicativa dei controlli in copertura (drenaggi).
  // Anche: BMI, infiltrazioni e sistemi di raccolta/smaltimento dell’acqua.
  // https://www.bmigroup.com/it/intervenire-sul-tetto/guida-tetto/comprendi-il-problema/infiltrazioni-tetto/infiltrazioni-acqua-piovana-dal-tetto/
  [COMMON_GUIDE_TEMPLATE_IDS.gutters]: {
    title: 'Conoscere la pulizia delle grondaie',
    description: 'Informazioni sulla raccolta dell’acqua piovana e sul controllo delle grondaie comuni.',
    beforeStart: 'La necessità di pulizia dipende anche da foglie e detriti presenti. La frequenza del piano non descrive ogni situazione e non autorizza interventi del residente.',
    whoCanIntervene: 'L’amministratore incarica un’impresa specializzata in coperture o lattoneria, attrezzata per lavorare in quota. Non raggiungere le grondaie con scale, non sporgerti e non tentare di liberarle.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della pulizia delle grondaie.',
    steps: [
      { title: 'Cosa viene controllato', body: 'L’impresa verifica la presenza di foglie, detriti e ostruzioni nelle zone di raccolta e scarico dell’acqua della copertura. Valuta le condizioni delle grondaie e dei collegamenti ai pluviali, individuando le parti che richiedono pulizia o approfondimenti.' },
      { title: 'Chi interviene', body: 'L’impresa incaricata dall’amministratore organizza l’ispezione e la pulizia con mezzi adatti all’edificio. Il residente comunica ciò che osserva senza accedere alla copertura o ai punti di raccolta in quota.' },
      { title: 'Quali anomalie segnalare', body: 'Segnala traboccamenti durante la pioggia, perdite dai raccordi o acqua che scorre sulla facciata in modo insolito. Indica il punto e le circostanze osservate da un luogo normalmente accessibile, senza avvicinarti alle grondaie per cercare la causa.' },
      { title: 'Quali documenti conservare', body: 'Chiedi all’amministratore di conservare il rapporto di pulizia con data, tratti interessati ed eventuali difetti rilevati. Le fotografie e le indicazioni dell’impresa, se disponibili, aiutano a confrontare le condizioni nelle visite successive.' },
    ],
  },
  // Fonte: INAIL/ISPESL, Sistemi di arresto caduta, sezioni 10.5 e 10.6.
  // https://www.inail.it/content/dam/ricerca-e-tecnologia/documenti/doc-buone-pratiche/cantieristica/linee%20anticaduta.pdf
  [COMMON_GUIDE_TEMPLATE_IDS.lifelines]: {
    title: 'Conoscere la verifica delle linee vita',
    description: 'Informazioni sui sistemi di ancoraggio utilizzati dai professionisti che lavorano sulla copertura.',
    beforeStart: 'Le linee vita fanno parte dei sistemi di protezione contro le cadute. Frequenza e modalità di verifica vanno confermate per il sistema installato: i 12 mesi del piano non sono una regola universale.',
    whoCanIntervene: 'L’amministratore incarica personale competente nei sistemi anticaduta. Non accedere al tetto, non agganciarti alla linea vita e non effettuare prove o regolazioni.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della verifica delle linee vita.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il tecnico verifica lo stato dei punti di ancoraggio, delle linee e degli elementi terminali pertinenti al sistema. Cerca danni, deformazioni o corrosione e valuta i componenti secondo le indicazioni del fabbricante e la documentazione del sistema installato.' },
      { title: 'Chi interviene', body: 'L’ispezione spetta a personale competente incaricato dall’amministratore. Il tecnico valuta anche la necessità di controlli dopo un evento dannoso; il residente non deve verificare da solo se il sistema sia utilizzabile.' },
      { title: 'Quali anomalie segnalare', body: 'Comunica all’amministratore eventuali danni già visibili da luoghi normalmente accessibili o eventi dannosi di cui sei a conoscenza. Non salire sulla copertura per cercare difetti, non toccare i componenti e non utilizzare il sistema per una prova.' },
      { title: 'Quali documenti conservare', body: 'Chiedi all’amministratore di conservare il rapporto di ispezione con esito, anomalie ed eventuali prescrizioni, insieme al manuale, alla documentazione del sistema e ai rapporti precedenti. La sola lettura della guida non attesta l’idoneità della linea vita.' },
    ],
  },
  // Fonte: ACO, verifiche e rimozione dei sedimenti tramite pozzetti d’ispezione.
  // https://www.aco.it/prodotti/canali-di-drenaggio-per-esterno/aco-monoblock-rd/faq-aco-monoblock-rd
  [COMMON_GUIDE_TEMPLATE_IDS.inspectionChambers]: {
    title: 'Conoscere la pulizia dei pozzetti comuni',
    description: 'Informazioni sul controllo dei pozzetti e delle condotte della rete di scarico comune.',
    beforeStart: 'La rete va identificata dalla documentazione dell’edificio. Questa guida non descrive l’apertura dei chiusini, l’accesso ai pozzetti o operazioni di spurgo.',
    whoCanIntervene: 'L’amministratore incarica una ditta specializzata nella manutenzione degli scarichi e negli spurghi. Non aprire chiusini, non entrare nei pozzetti e non introdurre attrezzi o prodotti nelle condotte.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della pulizia dei pozzetti comuni.',
    steps: [
      { title: 'Cosa viene controllato', body: 'La ditta verifica la presenza di sedimenti e ostruzioni e valuta il deflusso nella rete interessata. In base alle condizioni riscontrate stabilisce gli interventi di pulizia e gli eventuali approfondimenti necessari.' },
      { title: 'Chi interviene', body: 'La ditta specializzata organizza il lavoro con l’amministratore, dopo aver identificato la rete e i punti interessati. L’ispezione e la pulizia restano attività degli addetti, senza accesso del residente ai pozzetti.' },
      { title: 'Quali anomalie segnalare', body: 'Comunica ristagni, rigurgiti, odori persistenti o scarichi insolitamente lenti, indicando posizione e momento in cui si manifestano. Segnala anche chiusini visibilmente danneggiati o fuori posto, senza aprirli o avvicinarti a un’apertura.' },
      { title: 'Quali documenti conservare', body: 'Chiedi all’amministratore di conservare il rapporto della ditta con data, punti della rete trattati, anomalie e attività eseguite. Conservare gli eventuali rilievi e le indicazioni per successivi controlli aiuta a ricostruire i problemi ricorrenti.' },
    ],
  },
  // Fonti: Nice, manuali dell’automazione e registro di manutenzione.
  // https://www.niceforyou.com/sites/default/files/upload/manuals/IDV0726A01IT.pdf
  // https://www.niceforyou.com/sites/default/files/upload/manuals/ISTGDX01.4865.pdf
  [COMMON_GUIDE_TEMPLATE_IDS.poweredGates]: {
    title: 'Conoscere la manutenzione di cancelli e portoni motorizzati',
    description: 'Informazioni sul controllo degli accessi automatici comuni e sulle anomalie da segnalare.',
    beforeStart: 'Controlli e periodicità dipendono dall’automazione installata e dal suo utilizzo. Questa guida non descrive prove, regolazioni o sblocchi del cancello o del portone.',
    whoCanIntervene: 'L’amministratore incarica un tecnico qualificato nelle automazioni. Non intervenire su motore, centralina o meccanismi e non tentare di sbloccare o forzare il movimento.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della manutenzione degli accessi automatici.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il tecnico verifica le condizioni dell’automazione, il movimento e i dispositivi di sicurezza presenti, come le fotocellule. Le verifiche pertinenti sono stabilite per il modello installato e per la configurazione dell’accesso.' },
      { title: 'Chi interviene', body: 'Controlli, manutenzione e riparazioni spettano a personale qualificato incaricato dall’amministratore. Il residente segnala le anomalie e non esegue prove dei dispositivi di sicurezza o regolazioni dei meccanismi.' },
      { title: 'Quali anomalie segnalare', body: 'Avvisa l’amministratore se noti blocchi, movimenti inattesi, rumori insoliti o danni visibili. Resta fuori dall’area di movimento e non tentare manovre ripetute, prove con ostacoli o riparazioni per individuare il guasto.' },
      { title: 'Quali documenti conservare', body: 'L’amministratore conserva il registro di manutenzione con gli interventi eseguiti, i rapporti del tecnico e le istruzioni dell’automazione. Chiedi che siano annotate le anomalie riscontrate e le eventuali parti sostituite, per i controlli successivi.' },
    ],
  },
  // Fonte: DPR 74/2013, art. 7, istruzioni e periodicità della manutenzione.
  // https://www.normattiva.it/atto/caricaDettaglioAtto?atto.articolo.numero=7&atto.codiceRedazionale=13G00114&atto.dataPubblicazioneGazzetta=2013-06-27&tabID=0
  [COMMON_GUIDE_TEMPLATE_IDS.commonHeating]: {
    title: 'Conoscere la manutenzione dell’impianto termico comune',
    description: 'Informazioni sul controllo dell’impianto di riscaldamento comune e sulle segnalazioni utili al suo responsabile.',
    beforeStart: 'La manutenzione segue le istruzioni tecniche applicabili all’impianto. I 12 mesi del piano non sono un obbligo universale. Il controllo di efficienza energetica RCEE è un’attività distinta.',
    whoCanIntervene: 'L’amministratore coordina l’intervento con il responsabile dell’impianto e un’impresa abilitata agli impianti termici. Non accedere ai locali tecnici e non aprire apparecchi o modificare regolazioni dell’impianto comune.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della manutenzione dell’impianto termico comune.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il manutentore controlla il generatore e le parti dell’impianto indicate nelle istruzioni tecniche applicabili. Valuta le condizioni di funzionamento e gli eventuali interventi necessari in base al modello e alla configurazione installati.' },
      { title: 'Chi interviene', body: 'Le operazioni di controllo e manutenzione spettano a un’impresa abilitata. L’amministratore e il responsabile dell’impianto organizzano l’intervento e mettono a disposizione la documentazione; il residente non effettua prove o riparazioni.' },
      { title: 'Quali anomalie segnalare', body: 'Segnala all’amministratore mancanza o irregolarità del riscaldamento, rumori insoliti e perdite già visibili da luoghi normalmente accessibili. Indica quando si presenta il problema e quali ambienti interessa, senza entrare nella centrale termica o tentare riavvii.' },
      { title: 'Quali documenti conservare', body: 'Il responsabile dell’impianto conserva il libretto aggiornato e la documentazione rilasciata dal manutentore. Chiedi all’amministratore che siano conservati i rapporti degli interventi con data, anomalie ed eventuali prescrizioni, insieme alle istruzioni tecniche disponibili.' },
    ],
  },
  // Fonte: DPR 74/2013, art. 8 e allegato A; regole regionali da verificare.
  // https://www.arpa.veneto.it/temi-ambientali/altri-temi/energia/file-e-allegati/normativa/dpr_74_2013.pdf/@@download/file
  [COMMON_GUIDE_TEMPLATE_IDS.energyEfficiency]: {
    title: 'Conoscere il controllo di efficienza energetica RCEE',
    description: 'Informazioni sul controllo delle prestazioni energetiche dell’impianto termico comune e sul rapporto che ne documenta l’esito.',
    beforeStart: 'Applicabilità e periodicità dipendono dal tipo di impianto, dalla potenza, dal combustibile e dalle regole regionali. I 48 mesi del piano non sono una regola universale e non definiscono da soli i termini di trasmissione del rapporto.',
    whoCanIntervene: 'Interviene un’impresa abilitata agli impianti termici, coordinata dall’amministratore con il responsabile dell’impianto. Non effettuare misure, aprire il generatore o modificare i parametri di funzionamento.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione del controllo di efficienza energetica.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Nei casi previsti, il tecnico controlla il sistema di generazione, la regolazione della temperatura e i sistemi di trattamento dell’acqua dove presenti e previsti. Per i generatori a combustione le verifiche comprendono i parametri pertinenti alla combustione. L’esito viene riportato nel RCEE.' },
      { title: 'Chi interviene', body: 'L’operatore abilitato esegue i controlli applicabili al generatore e compila il Rapporto di controllo di efficienza energetica. Il responsabile dell’impianto e l’amministratore verificano gli adempimenti regionali pertinenti, compresa l’eventuale trasmissione del rapporto.' },
      { title: 'Quali anomalie segnalare', body: 'Comunica all’amministratore prestazioni insolite del riscaldamento o variazioni dei consumi che hai rilevato, indicando il periodo e le condizioni osservate. Questi segnali richiedono una valutazione del tecnico e non permettono al residente di stabilire il rendimento dell’impianto.' },
      { title: 'Quali documenti conservare', body: 'Il responsabile conserva una copia del RCEE allegata al libretto di impianto. Chiedi all’amministratore che restino disponibili eventuali prescrizioni e, quando prevista, la ricevuta di trasmissione al catasto o all’ente competente, secondo le regole regionali applicabili.' },
    ],
  },
  // Fonti: AUSL Modena (verifica periodica e documenti); INAIL (prove tecniche).
  // Ambito DPR 462/2001: indicazioni operative AUSL Emilia-Romagna, 2018.
  // https://www.ausl.mo.it/servizi-e-prestazioni/vigilanza/verifica-degli-impianti-di-messa-a-terra
  // https://www.inail.it/content/dam/inail-hub-site/documenti/2016/02/ucm_084757.pdf
  [COMMON_GUIDE_TEMPLATE_IDS.earthing]: {
    title: 'Conoscere la verifica dell’impianto di terra comune',
    description: 'Informazioni sulla verifica delle protezioni elettriche delle parti comuni e sui documenti che ne riportano l’esito.',
    beforeStart: 'L’applicabilità del DPR 462/2001 va verificata per il condominio, in relazione alla disciplina dei luoghi di lavoro. I 60 mesi del piano non sono una regola universale: il soggetto competente conferma l’intervallo applicabile.',
    whoCanIntervene: 'Nei casi soggetti al DPR 462/2001 la verifica periodica spetta all’ente competente o a un organismo abilitato. L’amministratore organizza l’incarico. Non aprire quadri, toccare cavi o effettuare prove sulle protezioni.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della verifica dell’impianto di terra comune.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il verificatore esamina la documentazione e svolge le prove pertinenti all’impianto di terra e alle protezioni contro i contatti indiretti. Le verifiche possono comprendere la continuità dei collegamenti di protezione e le misure previste per il sistema installato.' },
      { title: 'Chi interviene', body: 'Per la verifica periodica prevista dal DPR 462/2001 interviene un ente competente o un organismo abilitato. La manutenzione dell’elettricista e la verifica periodica sono attività distinte; l’amministratore concorda l’assistenza tecnica eventualmente necessaria.' },
      { title: 'Quali anomalie segnalare', body: 'Avvisa l’amministratore se noti componenti elettrici comuni danneggiati, cavi visibilmente deteriorati o interruzioni ricorrenti. Non avvicinarti alle parti danneggiate e non eseguire prove per cercare una dispersione. Il residente non può valutare l’efficienza della terra dal solo aspetto dell’impianto.' },
      { title: 'Quali documenti conservare', body: 'L’amministratore conserva il verbale della verifica con esito ed eventuali prescrizioni. Restano disponibili la documentazione dell’impianto, la dichiarazione di conformità o rispondenza con gli allegati pertinenti, i verbali precedenti e i documenti di manutenzione, quando previsti.' },
    ],
  },
  // Fonti: DAB Pumps, gruppi di pressurizzazione e assistenza del fabbricante.
  // https://www.dabpumps.com/it_it/prodotti/catalogo/kvc/3-kvc
  // https://dabpumps.com/it_it/assistenza/supporto-post-vendita/faq-post-vendita/tutti-i-prodotti
  [COMMON_GUIDE_TEMPLATE_IDS.pressureBooster]: {
    title: 'Conoscere la manutenzione dell’autoclave comune',
    description: 'Informazioni sul gruppo che mantiene la pressione dell’acqua nell’impianto comune e sui segnali da comunicare all’amministratore.',
    beforeStart: 'Questa guida riguarda il funzionamento del gruppo di pressurizzazione. Componenti, controlli e frequenza dipendono dalla configurazione installata e dalle istruzioni del fabbricante; i 12 mesi del piano non sono una regola universale.',
    whoCanIntervene: 'L’amministratore incarica un idraulico o un tecnico qualificato nei gruppi di pressurizzazione, con assistenza elettrica abilitata quando necessaria. Non entrare nei locali tecnici, non aprire quadri e non modificare pressostati o regolazioni.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della manutenzione dell’autoclave comune.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il tecnico valuta il funzionamento delle pompe, dei dispositivi di comando e della regolazione della pressione presenti nel gruppo. Controlli ed eventuali interventi seguono le istruzioni del modello installato e le anomalie riscontrate.' },
      { title: 'Chi interviene', body: 'Il tecnico incaricato dall’amministratore identifica il gruppo e la sua configurazione prima di stabilire i controlli necessari. Gli interventi sui componenti idraulici ed elettrici restano riservati al personale qualificato per le rispettive attività.' },
      { title: 'Quali anomalie segnalare', body: 'Comunica all’amministratore cali o variazioni insolite della pressione ai rubinetti, interruzioni dell’acqua, rumori diversi dal solito o perdite già visibili da luoghi accessibili. Indica quando accade e quali utenze interessa, senza raggiungere le pompe o tentare regolazioni.' },
      { title: 'Quali documenti conservare', body: 'Chiedi all’amministratore di conservare i rapporti del tecnico con data, anomalie e interventi eseguiti, insieme alle istruzioni del gruppo e ai riferimenti dei componenti installati. Questi documenti aiutano il manutentore a ricostruire eventuali problemi ricorrenti.' },
    ],
  },
  // Fonti B4: DPR 151/2011, art. 6, nei casi applicabili; DM 1/9/2021,
  // allegati I e II (controlli, documentazione e competenze per ciascun presidio).
  // https://www.gazzettaufficiale.it/eli/id/2011/09/22/011G0193/sg
  // https://www.vigilfuoco.it/sites/default/files/2023-09/DecretoMinisteriale02092021_agg09-2022.pdf
  // Qualificazione: considerato anche l’art. 6-bis introdotto dal DM 22/9/2026.
  // https://www.gazzettaufficiale.it/eli/id/2026/09/24/26A05078/sg
  // Estintori: riferimento tecnico UNI 9994-1, senza dedurre frequenze universali.
  [COMMON_GUIDE_TEMPLATE_IDS.extinguishers]: {
    title: 'Conoscere il controllo degli estintori comuni',
    description: 'Informazioni sui controlli degli estintori presenti nelle parti comuni e sulle anomalie da comunicare.',
    beforeStart: 'Controlli e periodicità vanno verificati per i dispositivi installati, secondo le istruzioni e le norme tecniche applicabili. Questa guida non insegna a usare o provare un estintore.',
    whoCanIntervene: 'L’amministratore incarica un manutentore antincendio con i requisiti previsti per gli estintori dalla disciplina applicabile. Non rimuovere sigilli, smontare componenti o scaricare l’estintore per prova.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione del controllo degli estintori comuni.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il tecnico valuta lo stato dell’estintore e degli accessori, l’identificazione e le condizioni previste dalle istruzioni del dispositivo. Stabilisce le attività pertinenti al tipo di estintore e documenta il controllo.' },
      { title: 'Chi interviene', body: 'Il manutentore incaricato dall’amministratore verifica i presidi secondo la disciplina applicabile e le indicazioni tecniche pertinenti. Il residente può segnalare ciò che osserva senza manipolare gli estintori.' },
      { title: 'Quali anomalie segnalare', body: 'Avvisa l’amministratore se un estintore manca, presenta danni visibili o ha l’accesso ostruito. Segnala cartellini illeggibili o sigilli apparentemente danneggiati senza toccarli o tentare verifiche del funzionamento.' },
      { title: 'Quali documenti conservare', body: 'L’amministratore conserva il rapporto del manutentore con identificazione dei presidi, data, esito ed eventuali interventi richiesti. Restano disponibili i cartellini e le annotazioni nel registro dei controlli antincendio, ove previsto.' },
    ],
  },
  // Reti idranti: DM 1/9/2021, allegato II, prospetto 3.2;
  // riferimenti tecnici UNI 10779 e UNI EN 671-3, secondo l’impianto.
  [COMMON_GUIDE_TEMPLATE_IDS.hydrants]: {
    title: 'Conoscere il controllo di idranti e naspi comuni',
    description: 'Informazioni sul controllo della rete idrica antincendio delle parti comuni.',
    beforeStart: 'Le verifiche dipendono dalla rete installata, dal progetto e dalle norme tecniche applicabili. Il residente non deve aprire valvole o effettuare prove di erogazione.',
    whoCanIntervene: 'L’amministratore incarica un manutentore antincendio con i requisiti previsti per le reti idranti dalla disciplina applicabile. Non aprire cassette per ispezionarle, srotolare tubazioni o azionare rubinetti e valvole.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione del controllo della rete idranti comune.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il tecnico esamina i componenti della rete, comprese tubazioni flessibili, raccordi e valvole pertinenti all’impianto. Esegue le verifiche funzionali previste e valuta le condizioni dell’alimentazione idrica antincendio.' },
      { title: 'Chi interviene', body: 'Il manutentore competente per la rete incaricato dall’amministratore organizza i controlli sulla base della documentazione disponibile. Le prove sull’impianto e gli eventuali ripristini spettano al personale incaricato.' },
      { title: 'Quali anomalie segnalare', body: 'Comunica all’amministratore perdite visibili, cassette danneggiate, attrezzature apparentemente mancanti o accessi ostruiti. Indica il punto interessato senza aprire i contenitori, toccare i componenti o cercare la causa della perdita.' },
      { title: 'Quali documenti conservare', body: 'L’amministratore conserva i rapporti di controllo con i punti verificati, gli esiti delle prove e le eventuali prescrizioni, insieme alla documentazione della rete. Le attività vengono annotate nel registro antincendio, ove previsto.' },
    ],
  },
  // Porte tagliafuoco: DM 1/9/2021, allegato II, prospetto 3.3; UNI 11473.
  [COMMON_GUIDE_TEMPLATE_IDS.fireDoors]: {
    title: 'Conoscere il controllo delle porte tagliafuoco comuni',
    description: 'Informazioni sulla manutenzione delle chiusure resistenti al fuoco delle parti comuni.',
    beforeStart: 'I controlli dipendono dalla porta, dai dispositivi installati e dalle indicazioni tecniche applicabili. Questa guida non descrive prove dei chiudiporta o regolazioni dei meccanismi.',
    whoCanIntervene: 'L’amministratore incarica un manutentore con i requisiti previsti per le porte resistenti al fuoco dalla disciplina applicabile. Non regolare cerniere o chiudiporta, modificare guarnizioni o bloccare le porte con oggetti.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione del controllo delle porte tagliafuoco comuni.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il tecnico valuta l’integrità della porta e dei suoi componenti e il funzionamento dei dispositivi di chiusura presenti. Le verifiche tengono conto della configurazione prevista e delle indicazioni del fabbricante.' },
      { title: 'Chi interviene', body: 'Il manutentore competente per queste chiusure, incaricato dall’amministratore, esegue i controlli e gli eventuali interventi. Le regolazioni e la sostituzione dei componenti non spettano al residente.' },
      { title: 'Quali anomalie segnalare', body: 'Segnala all’amministratore danni visibili, parti allentate, porte trattenute da oggetti o chiusure incomplete osservate durante il normale utilizzo. Non effettuare prove, forzare la porta o tentare di correggere il difetto.' },
      { title: 'Quali documenti conservare', body: 'L’amministratore conserva i rapporti di manutenzione con identificazione della porta, difetti riscontrati e parti sostituite, insieme alle istruzioni e alla documentazione della chiusura. Le attività restano nel registro antincendio, ove previsto.' },
    ],
  },
  // Illuminazione: verifiche funzionali, autonomia e registro secondo le
  // indicazioni del fabbricante, senza applicare le cadenze di un singolo modello.
  // https://www.beghelli.it/it/servizi/servizi/servizi-post-vendita
  [COMMON_GUIDE_TEMPLATE_IDS.emergencyLighting]: {
    title: 'Conoscere il controllo dell’illuminazione di emergenza',
    description: 'Informazioni sui controlli degli apparecchi che illuminano le parti comuni in caso di mancanza dell’alimentazione ordinaria.',
    beforeStart: 'Funzionamento, autonomia richiesta e verifiche dipendono dall’impianto e dalle indicazioni tecniche applicabili. La frequenza del piano va confermata per il sistema installato.',
    whoCanIntervene: 'L’amministratore incarica un tecnico qualificato per gli impianti di illuminazione di sicurezza, con i requisiti applicabili alle attività svolte. Non togliere corrente per prova, aprire gli apparecchi o sostituire batterie.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione del controllo dell’illuminazione di emergenza.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il tecnico verifica le condizioni degli apparecchi, il funzionamento in emergenza e l’autonomia secondo le caratteristiche del sistema. Valuta le eventuali segnalazioni diagnostiche e gli interventi necessari.' },
      { title: 'Chi interviene', body: 'Il personale qualificato incaricato dall’amministratore organizza le verifiche secondo la documentazione dell’impianto. Le prove e gli interventi sui componenti elettrici restano riservati agli addetti.' },
      { title: 'Quali anomalie segnalare', body: 'Comunica all’amministratore apparecchi danneggiati, segnalazioni di guasto visibili o zone rimaste buie durante un’interruzione della corrente già avvenuta. Non simulare un’interruzione e non dedurre un guasto dal solo fatto che una lampada sia spenta in condizioni ordinarie.' },
      { title: 'Quali documenti conservare', body: 'L’amministratore conserva i rapporti delle verifiche funzionali e di autonomia, le anomalie e gli interventi eseguiti, insieme alle istruzioni degli apparecchi. I risultati restano disponibili nel registro dei controlli pertinente all’impianto, ove previsto.' },
    ],
  },
  // IRAI: DM 1/9/2021, allegato II, prospetto 3.5; UNI 11224.
  [COMMON_GUIDE_TEMPLATE_IDS.fireDetection]: {
    title: 'Conoscere la manutenzione dell’impianto IRAI',
    description: 'Informazioni sul sistema comune di rivelazione e allarme incendio e sui controlli del manutentore.',
    beforeStart: 'L’IRAI comprende dispositivi di rivelazione e segnalazione configurati per l’edificio. Questa guida riguarda la manutenzione: in caso di allarme incendio segui le indicazioni di emergenza dell’edificio, senza trattarlo come un semplice guasto.',
    whoCanIntervene: 'L’amministratore incarica un manutentore con i requisiti previsti per gli impianti di rivelazione e allarme incendio dalla disciplina applicabile. Non coprire sensori, premere pulsanti per prova, tacitare o ripristinare la centrale.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della manutenzione dell’impianto IRAI comune.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il tecnico verifica i componenti di rivelazione, la centrale, le segnalazioni e i collegamenti pertinenti alla configurazione. Le prove funzionali seguono la documentazione dell’impianto e riguardano anche le funzioni associate dove previste.' },
      { title: 'Chi interviene', body: 'Il manutentore competente per l’IRAI coordina con l’amministratore le verifiche e gli eventuali interventi. Il residente non deve generare allarmi di prova o intervenire sulle segnalazioni della centrale.' },
      { title: 'Quali anomalie segnalare', body: 'Segnala all’amministratore avvisi di guasto visibili, dispositivi danneggiati o sensori coperti da oggetti. Comunica posizione e indicazione osservata senza aprire dispositivi, modificare impostazioni o interrompere un allarme.' },
      { title: 'Quali documenti conservare', body: 'L’amministratore conserva i rapporti di manutenzione con dispositivi verificati, esito delle prove, guasti e ripristini, insieme alla documentazione dell’impianto. Le attività sono annotate nel registro antincendio, ove previsto.' },
    ],
  },
  // EFC: DM 1/9/2021, allegato II, prospetti 3.8.1 e 3.8.2; UNI 9494-3.
  [COMMON_GUIDE_TEMPLATE_IDS.smokeExhaust]: {
    title: 'Conoscere la manutenzione dei sistemi EFC',
    description: 'Informazioni sui sistemi comuni di evacuazione di fumo e calore e sui controlli del personale incaricato.',
    beforeStart: 'Il sistema può prevedere evacuazione naturale o forzata. Componenti e controlli dipendono dal progetto, dal sistema installato e dalle indicazioni tecniche applicabili; questa guida non descrive prove di attivazione.',
    whoCanIntervene: 'L’amministratore incarica un manutentore con i requisiti previsti per il tipo di sistema di evacuazione fumo e calore dalla disciplina applicabile. Non azionare comandi per prova, raggiungere aperture in quota o intervenire sugli attuatori.',
    closingMessage: 'La consultazione non registra alcun intervento. L’amministratore si occupa della registrazione della manutenzione dei sistemi EFC comuni.',
    steps: [
      { title: 'Cosa viene controllato', body: 'Il tecnico esamina i componenti di apertura o ventilazione, i comandi e le interconnessioni previsti dal sistema. Verifica il funzionamento delle parti pertinenti all’impianto e delle eventuali funzioni associate.' },
      { title: 'Chi interviene', body: 'Il manutentore competente per il sistema installato organizza i controlli con l’amministratore. Le verifiche sulle aperture, sugli attuatori e sugli eventuali ventilatori spettano al personale incaricato.' },
      { title: 'Quali anomalie segnalare', body: 'Avvisa l’amministratore se noti aperture o componenti danneggiati, ostruzioni visibili o segnalazioni di guasto, solo da luoghi normalmente accessibili. Non salire sul tetto o su scale per controllare e non tentare di aprire, chiudere o sbloccare i dispositivi.' },
      { title: 'Quali documenti conservare', body: 'L’amministratore conserva i rapporti delle verifiche con esiti, anomalie, ripristini ed eventuali prescrizioni, insieme al progetto e alle istruzioni del sistema. Le attività restano nel registro antincendio, ove previsto.' },
    ],
  },
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
