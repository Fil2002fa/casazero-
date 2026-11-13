// Verifica delle guide informative residenti: `node --experimental-strip-types scripts/verify-maintenance-guides.mjs`
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

register('./ts-resolve-hooks.mjs', import.meta.url)

const eligibility = await import(new URL('../src/app/(app)/manutenzioni/guide-eligibility.ts', import.meta.url).href)
const contentModule = await import(new URL('../src/app/(app)/manutenzioni/[id]/guida/guide-content.ts', import.meta.url).href)
const illustrations = await import(new URL('../src/app/(app)/manutenzioni/maintenance-illustrations.ts', import.meta.url).href)
const { COMMON_GUIDE_TEMPLATE_IDS, RESIDENT_GUIDE_TEMPLATE_IDS, isResidentGuideAvailable } = eligibility
const { getResidentGuideContent } = contentModule
const { resolveMaintenanceIllustrations } = illustrations

const base = {
  isClient: true,
  isOwnUnit: true,
  isApartmentItem: true,
  completionMode: 'residente',
  activationStatus: 'inclusa',
  templateActive: true,
}
const vmcId = RESIDENT_GUIDE_TEMPLATE_IDS.vmcFilters
const windowsId = RESIDENT_GUIDE_TEMPLATE_IDS.windows
const hoodId = RESIDENT_GUIDE_TEMPLATE_IDS.cookerHood
const climateId = RESIDENT_GUIDE_TEMPLATE_IDS.climateSystem
const airConditionerFiltersId = RESIDENT_GUIDE_TEMPLATE_IDS.airConditionerFilters
const interiorPaintingId = RESIDENT_GUIDE_TEMPLATE_IDS.interiorPainting
const differentialTestId = RESIDENT_GUIDE_TEMPLATE_IDS.differentialTest
const ductsId = '70b3f1dd-f0ad-427c-9d38-f99143900778'

assert.equal(isResidentGuideAvailable({ ...base, templateId: vmcId }), true, 'VMC filtri abilitata')
assert.equal(isResidentGuideAvailable({ ...base, templateId: windowsId }), true, 'serramenti abilitati')
assert.equal(isResidentGuideAvailable({ ...base, templateId: hoodId }), true, 'cappa cucina abilitata')
assert.equal(isResidentGuideAvailable({ ...base, templateId: climateId }), true, 'climatizzazione abilitata')
assert.equal(isResidentGuideAvailable({ ...base, templateId: airConditionerFiltersId }), true, 'filtri climatizzatore allowlisted')
assert.equal(isResidentGuideAvailable({ ...base, templateId: interiorPaintingId }), true, 'imbiancatura allowlisted')
assert.equal(isResidentGuideAvailable({ ...base, templateId: differentialTestId }), true, 'differenziale allowlisted')
assert.equal(isResidentGuideAvailable({ ...base, templateId: airConditionerFiltersId, completionMode: 'promemoria' }), true, 'promemoria filtri consultabile')
assert.equal(isResidentGuideAvailable({ ...base, templateId: interiorPaintingId, completionMode: 'promemoria' }), true, 'promemoria imbiancatura consultabile')
assert.equal(isResidentGuideAvailable({ ...base, templateId: differentialTestId, completionMode: 'promemoria' }), true, 'promemoria differenziale consultabile')
assert.equal(isResidentGuideAvailable({ ...base, templateId: vmcId, completionMode: 'promemoria' }), false, 'promemoria VMC non abilitato')
assert.equal(isResidentGuideAvailable({ ...base, templateId: windowsId, completionMode: 'promemoria' }), false, 'promemoria serramenti non abilitato')
assert.equal(isResidentGuideAvailable({ ...base, templateId: ductsId }), false, 'VMC condotti esclusa')
assert.equal(isResidentGuideAvailable({ ...base, templateId: ductsId, completionMode: 'promemoria' }), false, 'VMC condotti esclusa anche come promemoria')
assert.equal(isResidentGuideAvailable({ ...base, templateId: 'other' }), false, 'altre manutenzioni escluse')
assert.equal(isResidentGuideAvailable({ ...base, templateId: 'other', completionMode: 'promemoria' }), false, 'altri promemoria esclusi')
assert.equal(isResidentGuideAvailable({ ...base, templateId: null }), false, 'ID assente escluso')

for (const templateId of [vmcId, windowsId, hoodId, climateId, airConditionerFiltersId, interiorPaintingId, differentialTestId]) {
  for (const [field, denied] of [
    ['isClient', false],
    ['isOwnUnit', false],
    ['isApartmentItem', false],
    ['completionMode', 'amministratore'],
    ['activationStatus', 'esclusa'],
    ['activationStatus', 'archiviata'],
    ['templateActive', false],
  ]) {
    assert.equal(isResidentGuideAvailable({ ...base, templateId, [field]: denied }), false, `gate ${templateId}: ${field}=${denied}`)
  }
  assert.equal(isResidentGuideAvailable({ ...base, templateId, completionMode: 'amministratore' }), false, `nessuna guida per intervento amministratore: ${templateId}`)
}
for (const templateId of [vmcId, windowsId, hoodId, climateId]) {
  assert.equal(isResidentGuideAvailable({ ...base, templateId, completionMode: 'promemoria' }), false, `promemoria non allowlisted: ${templateId}`)
}

const commonIds = [
  'a47686ee-3f1d-4721-a3f6-6e4c282fdb0d',
  'd582bfad-41c4-4823-9a40-26e6c3acbf92',
  '7296f859-9ad6-45bb-8d1a-298f93a50146',
  'f0c52720-b654-4e9b-916f-aae267001738',
  'd9b03bd4-761e-4ffa-9739-4308736b3c8f',
  '1fd67a1e-8381-4ddc-b383-25739150dca2',
  '225cc536-e8c0-4ffc-8c77-4643c8311504',
  '7ed48ab6-d4e0-4fd9-bfdd-7777e92918b8',
  '08d73253-7cd3-42bf-9676-52267bfeeb90',
  '55ed1153-d229-4587-8959-d945a9cc344a',
  '4a74e428-62dc-436f-813f-eb58ddfa9bfe',
  'b6525a25-e227-4c81-8942-3c7bca20d82f',
  'fc20e159-4b1b-4a71-8d25-f1c70b16d9a0',
  'b25e9c86-9e90-47ee-afce-f89db3fe50c4',
  '18452296-fccb-491b-a27b-34fb0bd02214',
  '4390667e-4a6e-4d6d-8f54-f7e996b4513b',
  'dbe47b50-413c-45e8-80e2-2aa65024fef0',
  '8b0ca75c-14c4-40fa-a846-121aa5b22ad9',
]
assert.deepEqual(Object.values(COMMON_GUIDE_TEMPLATE_IDS), commonIds, 'solo i diciotto UUID approvati B1, B2, B3 e B4')
const commonBase = {
  ...base, isOwnUnit: false, isApartmentItem: false,
  isCommonItem: true, isOwnResidence: true, completionMode: 'amministratore',
}
for (const templateId of commonIds) {
  assert.equal(isResidentGuideAvailable({ ...commonBase, templateId }), true, 'guida comune consultabile')
  for (const [field, denied] of [
    ['isClient', false], ['isCommonItem', false], ['isCommonItem', undefined],
    ['isApartmentItem', true], ['isOwnResidence', false], ['isOwnResidence', undefined],
    ['completionMode', 'residente'], ['completionMode', 'promemoria'], ['completionMode', null],
    ['activationStatus', 'esclusa'], ['activationStatus', 'archiviata'], ['templateActive', false],
  ]) {
    assert.equal(isResidentGuideAvailable({ ...commonBase, templateId, [field]: denied }), false, `guida comune negata: ${field}=${denied}`)
  }
  assert.equal(isResidentGuideAvailable({ ...base, templateId }), false, 'UUID comune non abilita guida privata')
  const content = getResidentGuideContent(templateId)
  assert.ok(content)
  assert.deepEqual(content.steps.map(step => step.title), [
    'Cosa viene controllato', 'Chi interviene', 'Quali anomalie segnalare', 'Quali documenti conservare',
  ])
  assert.match(content.whoCanIntervene, /amministratore/)
  assert.match(content.closingMessage, /non registra alcun intervento/)
  assert.equal(resolveMaintenanceIllustrations(templateId), null, 'nessuna illustrazione di altro impianto')
}
assert.equal(isResidentGuideAvailable({ ...commonBase, templateId: vmcId }), false, 'guida privata non estesa alle parti comuni')
assert.equal(isResidentGuideAvailable({ ...commonBase, templateId: 'other' }), false, 'altre parti comuni escluse')

const b2Guides = [
  ['f0c52720-b654-4e9b-916f-aae267001738', 'Conoscere il controllo del manto di copertura', /Non salire sul tetto/, /elementi danneggiati o spostati/],
  ['d9b03bd4-761e-4ffa-9739-4308736b3c8f', 'Conoscere la pulizia delle grondaie', /non sporgerti/, /foglie, detriti e ostruzioni/],
  ['1fd67a1e-8381-4ddc-b383-25739150dca2', 'Conoscere la verifica delle linee vita', /non agganciarti alla linea vita/, /danni, deformazioni o corrosione/],
  ['225cc536-e8c0-4ffc-8c77-4643c8311504', 'Conoscere la pulizia dei pozzetti comuni', /Non aprire chiusini, non entrare nei pozzetti/, /sedimenti e ostruzioni/],
  ['7ed48ab6-d4e0-4fd9-bfdd-7777e92918b8', 'Conoscere la manutenzione di cancelli e portoni motorizzati', /Non intervenire su motore, centralina o meccanismi/, /fotocellule/],
]
for (const [templateId, title, safety, technicalScope] of b2Guides) {
  const guide = getResidentGuideContent(templateId)
  assert.equal(guide.title, title)
  assert.match(guide.whoCanIntervene, safety, 'limite di sicurezza specifico della guida')
  assert.match(guide.steps[0].body, technicalScope, 'controlli descritti come attività del tecnico')
  assert.match(guide.steps[2].body, /amministratore|Comunica|Segnala/, 'anomalie da segnalare')
  assert.match(guide.steps[3].body, /amministratore/, 'documentazione conservata dall’amministratore')
  const text = JSON.stringify(guide).toLocaleLowerCase('it-IT')
  for (const procedure of [
    /\b(?:svita|avvita|lubrifica|scavalca|solleva il chiusino|inserisci la sonda)\b/,
    /\b(?:premi|aziona)\b.*\b(?:sblocco|fotocellula|motore)\b/,
    /\b(?:tendi il cavo|regola la forza|regola il finecorsa|versa.*disgorgante)\b/,
  ]) assert.doesNotMatch(text, procedure, 'nessuna procedura operativa per il residente')
}
assert.match(getResidentGuideContent('1fd67a1e-8381-4ddc-b383-25739150dca2').beforeStart, /12 mesi del piano non sono una regola universale/)

const b3Guides = [
  ['08d73253-7cd3-42bf-9676-52267bfeeb90', 'Conoscere la manutenzione dell’impianto termico comune', /non aprire apparecchi/, /istruzioni tecniche/, /libretto/],
  ['55ed1153-d229-4587-8959-d945a9cc344a', 'Conoscere il controllo di efficienza energetica RCEE', /Non effettuare misure/, /RCEE/, /copia del RCEE allegata al libretto/],
  ['4a74e428-62dc-436f-813f-eb58ddfa9bfe', 'Conoscere la verifica dell’impianto di terra comune', /Non aprire quadri, toccare cavi/, /continuità dei collegamenti di protezione/, /verbale della verifica/],
  ['b6525a25-e227-4c81-8942-3c7bca20d82f', 'Conoscere la manutenzione dell’autoclave comune', /non modificare pressostati o regolazioni/, /regolazione della pressione/, /rapporti del tecnico/],
]
for (const [templateId, title, safety, technicalScope, documents] of b3Guides) {
  const guide = getResidentGuideContent(templateId)
  assert.equal(guide.title, title)
  assert.match(guide.whoCanIntervene, safety)
  assert.match(guide.steps[0].body, technicalScope)
  assert.match(guide.steps[2].body, /amministratore/, 'segnalazioni dirette all’amministratore')
  assert.match(guide.steps[3].body, documents, 'documenti pertinenti alla singola attività')
  const text = JSON.stringify(guide).toLocaleLowerCase('it-IT')
  assert.doesNotMatch(text, /\b(?:svita|avvita|smonta|riavvia|riarma|premi|aziona|misura la resistenza|regola il pressostato|gonfia il vaso)\b/, 'nessuna procedura tecnica affidata al residente')
}
const heatingGuide = getResidentGuideContent('08d73253-7cd3-42bf-9676-52267bfeeb90')
const efficiencyGuide = getResidentGuideContent('55ed1153-d229-4587-8959-d945a9cc344a')
const earthingGuide = getResidentGuideContent('4a74e428-62dc-436f-813f-eb58ddfa9bfe')
const boosterGuide = getResidentGuideContent('b6525a25-e227-4c81-8942-3c7bca20d82f')
assert.match(heatingGuide.beforeStart, /12 mesi del piano non sono un obbligo universale/)
assert.match(heatingGuide.beforeStart, /RCEE è un’attività distinta/)
assert.match(efficiencyGuide.beforeStart, /48 mesi del piano non sono una regola universale/)
assert.match(efficiencyGuide.beforeStart, /potenza, dal combustibile e dalle regole regionali/)
assert.match(efficiencyGuide.beforeStart, /termini di trasmissione del rapporto/)
assert.match(earthingGuide.beforeStart, /applicabilità del DPR 462\/2001 va verificata/)
assert.match(earthingGuide.beforeStart, /luoghi di lavoro/)
assert.match(earthingGuide.beforeStart, /60 mesi del piano non sono una regola universale/)
assert.match(earthingGuide.whoCanIntervene, /ente competente o a un organismo abilitato/)
assert.match(boosterGuide.beforeStart, /configurazione installata e dalle istruzioni del fabbricante/)
assert.match(boosterGuide.beforeStart, /12 mesi del piano non sono una regola universale/)

const b4Guides = [
  ['fc20e159-4b1b-4a71-8d25-f1c70b16d9a0', 'Conoscere il controllo degli estintori comuni', /Non rimuovere sigilli/, /stato dell’estintore e degli accessori/, /cartellini/],
  ['b25e9c86-9e90-47ee-afce-f89db3fe50c4', 'Conoscere il controllo di idranti e naspi comuni', /azionare rubinetti e valvole/, /alimentazione idrica antincendio/, /esiti delle prove/],
  ['18452296-fccb-491b-a27b-34fb0bd02214', 'Conoscere il controllo delle porte tagliafuoco comuni', /Non regolare cerniere o chiudiporta/, /dispositivi di chiusura/, /identificazione della porta/],
  ['4390667e-4a6e-4d6d-8f54-f7e996b4513b', 'Conoscere il controllo dell’illuminazione di emergenza', /Non togliere corrente per prova/, /funzionamento in emergenza e l’autonomia/, /verifiche funzionali e di autonomia/],
  ['dbe47b50-413c-45e8-80e2-2aa65024fef0', 'Conoscere la manutenzione dell’impianto IRAI', /tacitare o ripristinare la centrale/, /componenti di rivelazione, la centrale/, /esito delle prove, guasti e ripristini/],
  ['8b0ca75c-14c4-40fa-a846-121aa5b22ad9', 'Conoscere la manutenzione dei sistemi EFC', /Non azionare comandi per prova/, /componenti di apertura o ventilazione/, /progetto e alle istruzioni del sistema/],
]
for (const [templateId, title, safety, technicalScope, documents] of b4Guides) {
  const guide = getResidentGuideContent(templateId)
  assert.equal(guide.title, title)
  assert.match(guide.whoCanIntervene, safety, 'limiti specifici del presidio antincendio')
  assert.match(guide.whoCanIntervene, /requisiti.*applicabil/, 'requisiti del personale senza regole universali sulla qualifica')
  assert.match(guide.steps[0].body, technicalScope, 'controlli pertinenti al singolo sistema')
  assert.match(guide.steps[2].body, /amministratore/, 'residente indirizzato alla segnalazione')
  assert.match(guide.steps[3].body, documents, 'documenti pertinenti al presidio')
  assert.match(guide.steps[3].body, /ove previsto/, 'registro senza obbligo generalizzato al condominio')
  assert.match(guide.closingMessage, /amministratore/, 'nessuna registrazione attribuita al residente')
  const text = JSON.stringify(guide).toLocaleLowerCase('it-IT')
  assert.doesNotMatch(text, /\b(?:premi|apri|aziona|tacita|ripristina|smonta|svita|srotola|sostituisci|spruzza|ricarica|scarica|regola)\b/, 'nessuna procedura operativa per il residente')
  assert.doesNotMatch(text, /(?:obbligatori[oa]|per legge) ogni (?:6|12) mesi/, 'nessuna frequenza legale universale inventata')
}
const fireDetectionGuide = getResidentGuideContent('dbe47b50-413c-45e8-80e2-2aa65024fef0')
assert.match(fireDetectionGuide.beforeStart, /in caso di allarme incendio segui le indicazioni di emergenza dell’edificio/)
assert.match(fireDetectionGuide.beforeStart, /senza trattarlo come un semplice guasto/)
assert.match(getResidentGuideContent('4390667e-4a6e-4d6d-8f54-f7e996b4513b').steps[2].body, /non dedurre un guasto.*spenta in condizioni ordinarie/)
assert.match(getResidentGuideContent('8b0ca75c-14c4-40fa-a846-121aa5b22ad9').beforeStart, /evacuazione naturale o forzata/)

const vmc = getResidentGuideContent(vmcId)
const windows = getResidentGuideContent(windowsId)
const hood = getResidentGuideContent(hoodId)
const climate = getResidentGuideContent(climateId)
const airConditionerFilters = getResidentGuideContent(airConditionerFiltersId)
const interiorPainting = getResidentGuideContent(interiorPaintingId)
const differentialTest = getResidentGuideContent(differentialTestId)
assert.equal(vmc?.title, 'Conoscere i filtri della VMC')
assert.equal(vmc?.whoCanIntervene, 'Puoi osservare eventuali avvisi o anomalie dall’esterno dell’unità. Non aprire l’apparecchio o sostituire i filtri per tentativi. Se non conosci la procedura prevista per il tuo impianto, rivolgiti a un tecnico della ventilazione.')
assert.deepEqual(vmc?.steps, [
  { title: 'A cosa servono i filtri', body: 'I filtri trattengono polvere e particelle presenti nell’aria. Con il tempo possono accumulare sporco e ridurre l’efficienza del sistema.' },
  { title: 'Cosa puoi osservare', body: 'Eventuali avvisi dell’apparecchio, rumori insoliti o cambiamenti nella ventilazione sono segnali da approfondire. Non aprire o smontare l’unità per effettuare controlli non previsti.' },
  { title: 'Quando chiedere assistenza', body: 'La procedura di sostituzione dipende dall’impianto installato. Se non sai come intervenire, rivolgiti a un tecnico. Conserva la data e gli eventuali documenti dell’intervento.' },
])
assert.equal(windows?.title, 'Prendersi cura dei serramenti')
assert.equal(windows?.whoCanIntervene, 'Puoi controllare il movimento dei serramenti e pulire delicatamente le superfici accessibili. Per la lubrificazione, le regolazioni o lo smontaggio dei componenti, rivolgiti a un serramentista qualificato.')
assert.deepEqual(windows?.steps, [
  { title: 'Controlla il movimento', body: 'Osserva se porte e finestre si aprono e si chiudono normalmente, senza forzarle.' },
  { title: 'Cura le parti accessibili', body: 'Rimuovi delicatamente polvere e sporco dalle superfici e dalle guide visibili, senza smontare componenti o intervenire sui meccanismi.' },
  { title: 'Riconosci quando serve assistenza', body: 'Se noti resistenza, rumori insoliti o difficoltà di chiusura, rivolgiti a un serramentista. Non effettuare regolazioni o applicare lubrificanti non verificati per quel serramento.' },
])
assert.equal(hood?.title, 'Conoscere la cappa e i suoi filtri')
assert.deepEqual(hood?.steps, [
  { title: 'Filtri e condotti hanno funzioni diverse', body: 'I filtri antigrasso trattengono parte dei grassi prodotti durante la cottura. In alcune cappe a ricircolo può essere presente anche un filtro a carbone, che contribuisce a ridurre gli odori. I condotti convogliano l’aria verso l’esterno quando previsti dalla configurazione.' },
  { title: 'Individua le indicazioni per il tuo modello', body: 'Tipo di filtro, ricambio e modalità di cura cambiano tra i modelli: non tutti i filtri sono lavabili. Se marca e modello non sono noti, chiedi al venditore, all’installatore o al referente della casa di aiutarti a identificarli prima di scegliere come intervenire.' },
  { title: 'Riconosci quando chiedere assistenza', body: 'Aspirazione ridotta, rumori insoliti o odori persistenti possono richiedere un controllo. Per i condotti, i componenti interni o un’anomalia che non si risolve con le indicazioni applicabili al modello, rivolgiti a personale qualificato e conserva il rapporto dell’intervento.' },
])
assert.equal(hood?.whoCanIntervene, 'La cura delle parti accessibili dipende dal modello. Gli interventi sui condotti e sui componenti interni vanno affidati a personale qualificato.')
assert.equal(climate?.title, 'Conoscere la manutenzione della climatizzazione')
assert.match(climate?.beforeStart ?? '', /12 mesi del catalogo non sono automaticamente un obbligo/)
assert.deepEqual(climate?.steps, [
  { title: 'Cura ordinaria e manutenzione tecnica', body: 'Le attività ordinarie accessibili all’utente non coincidono con il controllo tecnico dell’impianto. La configurazione e le verifiche necessarie cambiano in base all’apparecchio: chiedi al referente o al tecnico quali indicazioni si applicano al modello installato.' },
  { title: 'Prepara le informazioni per la prenotazione', body: 'Quando richiedi un intervento, comunica marca e modello se disponibili, il tipo di apparecchio, eventuali anomalie osservate e gli interventi precedenti. Se non conosci il modello, chiedi al referente della casa o all’installatore come identificarlo.' },
  { title: 'Controlli e documenti dell’intervento', body: 'Il personale qualificato stabilisce le verifiche pertinenti alle caratteristiche dell’impianto e agli obblighi eventualmente applicabili. Chiedi e conserva il rapporto dell’intervento e gli aggiornamenti della documentazione dell’impianto, quando previsti.' },
])
assert.equal(climate?.whoCanIntervene, 'La manutenzione tecnica va affidata a personale qualificato. La cura ordinaria consentita all’utente dipende dall’apparecchio e dalle relative indicazioni; non intervenire sui circuiti frigoriferi o sui componenti elettrici.')
assert.equal(airConditionerFilters?.title, 'Conoscere i filtri del climatizzatore')
assert.match(airConditionerFilters?.beforeStart ?? '', /frequenza di 6 mesi.*non una regola valida per ogni apparecchio/)
assert.deepEqual(airConditionerFilters?.steps.map(({ title }) => title), [
  'A cosa servono i filtri',
  'Filtri diversi richiedono indicazioni diverse',
  'Quando chiedere assistenza',
])
assert.match(JSON.stringify(airConditionerFilters), /Non dedurre il trattamento dal solo aspetto/)
assert.match(JSON.stringify(airConditionerFilters), /senza aprire l’unità/)
assert.equal(interiorPainting?.title, 'Osservare e rinnovare la pittura interna')
assert.match(interiorPainting?.beforeStart ?? '', /frequenza di 36 mesi.*non un obbligo né la durata effettiva/)
assert.deepEqual(interiorPainting?.steps.map(({ title }) => title), [
  'Quando può essere utile rinnovare',
  'Osserva le superfici e il supporto',
  'Prima di coprire macchie o muffa',
])
assert.match(JSON.stringify(interiorPainting), /Non coprirli con una semplice tinteggiatura/)
assert.equal(differentialTest?.title, 'Capire la prova del differenziale')
assert.equal(differentialTest?.noticeTitle, 'Avviso di sicurezza')
assert.match(differentialTest?.whoCanIntervene ?? '', /Non rimuovere coperture né accedere ai componenti interni/)
assert.match(differentialTest?.whoCanIntervene ?? '', /non procedere/)
assert.match(differentialTest?.whoCanIntervene ?? '', /elettricista qualificato/)
assert.equal(differentialTest?.steps.length, 3, 'tre argomenti informativi')
assert.match(differentialTest?.steps[0]?.body ?? '', /simula una dispersione/)
assert.match(differentialTest?.steps[1]?.body ?? '', /può interrompere l’alimentazione/)
assert.match(differentialTest?.steps[2]?.body ?? '', /6 mesi come promemoria del catalogo, non come regola universale/)
assert.match(differentialTest?.steps[2]?.body ?? '', /elettricista qualificato/)
assert.match(differentialTest?.closingMessage ?? '', /non conferma né registra l’esecuzione di una manutenzione/)
assert.equal(getResidentGuideContent(ductsId), null, 'nessun contenuto per VMC condotti')
assert.equal(resolveMaintenanceIllustrations(hoodId), null, 'nessuna foto di altri impianti nella guida cappa')
assert.equal(resolveMaintenanceIllustrations(climateId), null, 'nessuna foto di altri impianti nella guida climatizzazione')
assert.equal(resolveMaintenanceIllustrations(airConditionerFiltersId), null, 'nessuna foto generica per filtri climatizzatore')
assert.equal(resolveMaintenanceIllustrations(interiorPaintingId), null, 'nessuna foto generica per imbiancatura')
assert.equal(resolveMaintenanceIllustrations(differentialTestId), null, 'nessuna immagine elettrica generica')

const vmcIllustrations = resolveMaintenanceIllustrations(vmcId)
const windowIllustrations = resolveMaintenanceIllustrations(windowsId)
assert.ok(vmcIllustrations?.overview, 'immagine di contesto VMC per la card')
assert.deepEqual(vmcIllustrations?.steps, [undefined, undefined, undefined], 'nessuna foto VMC suggerisce smontaggio o sostituzione')
assert.deepEqual(windowIllustrations?.steps.slice(1), [undefined, undefined], 'nessuna foto suggerisce pulizia o lubrificazione')
assert.equal(resolveMaintenanceIllustrations(ductsId), null, 'nessuna immagine assegnata ai condotti')

const allAssets = [vmcIllustrations?.overview, windowIllustrations?.overview, ...(vmcIllustrations?.steps ?? []), ...(windowIllustrations?.steps ?? [])]
for (const asset of allAssets.filter(Boolean)) {
  assert.ok(existsSync(resolve(fileURLToPath(new URL('../public', import.meta.url)), `.${asset.src}`)), `asset esistente: ${asset.src}`)
}

const experience = readFileSync(new URL('../src/app/(app)/manutenzioni/[id]/guida/GuideExperience.tsx', import.meta.url), 'utf8')
const detailPage = readFileSync(new URL('../src/app/(app)/manutenzioni/[id]/page.tsx', import.meta.url), 'utf8')
const guidePage = readFileSync(new URL('../src/app/(app)/manutenzioni/[id]/guida/page.tsx', import.meta.url), 'utf8')
// Esegue la vera pagina server con letture simulate, senza Next o database.
// Verifica anche la query della membership, non solo il predicato puro.
const compiledGuidePage = ts.transpileModule(guidePage, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const { resolveCompletionMode } = await import(new URL('../src/lib/maintenance-status.ts', import.meta.url).href)
async function runCommonGuideCase(templateId, overrides = {}) {
  const item = {
    id: 'item', template_id: templateId, unit_id: null, residence_id: 'residence-a',
    completion_mode: null, activation_status: 'inclusa',
    maintenance_templates: { completion_mode: 'amministratore', is_active: true, scope: 'condominium' },
    ...overrides.item,
  }
  const membership = Object.hasOwn(overrides, 'membership') ? overrides.membership
    : { unit_id: 'unit-a', units: { residence_id: 'residence-a' } }
  const reads = []
  const client = {
    from(table) {
      assert.ok(['maintenance_items', 'unit_members'].includes(table), 'sole letture previste')
      const read = { table, filters: [], fields: '' }
      reads.push(read)
      const query = {
        select(fields) { read.fields = fields; return query },
        eq(field, value) { read.filters.push(['eq', field, value]); return query },
        is(field, value) { read.filters.push(['is', field, value]); return query },
        async maybeSingle() {
          return table === 'maintenance_items'
            ? { data: overrides.missingItem ? null : item, error: overrides.itemError ?? null }
            : { data: membership, error: overrides.membershipError ?? null }
        },
      }
      return query
    },
  }
  const jsx = (type, props) => ({ type, props })
  const mocks = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { notFound() { throw new Error('NOT_FOUND') } },
    'next/link': { default: 'Link' },
    'lucide-react': { ChevronLeft: 'ChevronLeft' },
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/auth': { requireProfile: async () => ({ id: 'resident', role: overrides.role ?? 'client' }) },
    '@/lib/maintenance-status': { resolveCompletionMode },
    '../../guide-eligibility': eligibility,
    './GuideExperience': { GuideExperience: 'GuideExperience' },
    '../../maintenance-illustrations': illustrations,
    './guide-content': contentModule,
  }
  const module = { exports: {} }
  runInNewContext(compiledGuidePage, {
    exports: module.exports, module,
    require(name) { assert.ok(Object.hasOwn(mocks, name), `import previsto: ${name}`); return mocks[name] },
    console: { error() {} },
  })
  let outcome
  try {
    const result = await module.exports.default({ params: Promise.resolve({ id: 'item' }) })
    outcome = result.type === 'GuideExperience' ? 'allowed' : 'error'
    if (outcome === 'allowed') {
      assert.equal(result.props.content, getResidentGuideContent(templateId), 'contenuto del template richiesto')
      assert.equal(result.props.detailHref, '/manutenzioni/item', 'ritorno al dettaglio della stessa voce')
    }
  } catch (error) {
    if (error.message !== 'NOT_FOUND') throw error
    outcome = 'denied'
  }
  const itemRead = reads.find(read => read.table === 'maintenance_items')
  if (itemRead) assert.deepEqual(itemRead.filters, [['eq', 'id', 'item']], 'lettura limitata alla voce richiesta')
  const membershipRead = reads.find(read => read.table === 'unit_members')
  if (membershipRead) {
    assert.ok(membershipRead.fields.includes('units(residence_id)'), 'legame unità-residenza letto dal server')
    assert.deepEqual(membershipRead.filters, [['eq', 'profile_id', 'resident'], ['is', 'ended_at', null]])
  }
  return outcome
}
for (const templateId of commonIds) {
  assert.equal(await runCommonGuideCase(templateId), 'allowed', 'pagina: modalità ereditata dal template')
  assert.equal(await runCommonGuideCase(templateId, { item: {
    completion_mode: 'amministratore',
    maintenance_templates: { completion_mode: 'residente', is_active: true, scope: 'condominium' },
  } }), 'allowed', 'pagina: prevale la modalità effettiva dell’item')
  for (const overrides of [
    { role: 'admin' }, { role: 'super_admin' }, { missingItem: true },
    { membership: null }, { membership: { unit_id: 'unit-b', units: { residence_id: 'residence-b' } } },
    { membership: { unit_id: 'unit-a', units: null } },
    { membership: { unit_id: null, units: { residence_id: 'residence-a' } } },
    { item: { unit_id: 'unit-a' } }, { item: { activation_status: 'esclusa' } },
    { item: { activation_status: 'archiviata' } }, { item: { completion_mode: 'residente' } },
    { item: { completion_mode: 'promemoria' } },
    { item: { maintenance_templates: { completion_mode: 'amministratore', is_active: false, scope: 'condominium' } } },
    { item: { maintenance_templates: { completion_mode: 'amministratore', is_active: true, scope: 'unit' } } },
    { item: { maintenance_templates: null } },
  ]) assert.equal(await runCommonGuideCase(templateId, overrides), 'denied', `pagina: accesso negato ${JSON.stringify(overrides)}`)
  assert.equal(await runCommonGuideCase(templateId, { membershipError: { message: 'lettura fallita' } }), 'error')
  assert.equal(await runCommonGuideCase(templateId, { itemError: { message: 'lettura fallita' } }), 'error')
}
assert.equal(await runCommonGuideCase('other'), 'denied', 'pagina: template comune non approvato escluso')
assert.equal(await runCommonGuideCase(vmcId, { item: { unit_id: 'unit-a', completion_mode: 'residente' } }), 'allowed', 'pagina: guida privata esistente conservata')
// Le cinque guide della Fase A attraversano la stessa pagina delle guide comuni.
for (const templateId of [hoodId, climateId, airConditionerFiltersId, interiorPaintingId, differentialTestId]) {
  const privateItem = {
    unit_id: 'unit-a', completion_mode: null,
    maintenance_templates: { completion_mode: 'residente', is_active: true, scope: 'unit' },
  }
  assert.equal(await runCommonGuideCase(templateId, { item: privateItem }), 'allowed', 'Fase A: modalità ereditata e unità associata')
  for (const overrides of [
    { role: 'admin' }, { role: 'super_admin' }, { membership: null },
    { membership: { unit_id: 'unit-b', units: { residence_id: 'residence-a' } } },
    { item: { activation_status: 'esclusa' } }, { item: { activation_status: 'archiviata' } },
    { item: { completion_mode: 'amministratore' } },
    { item: { maintenance_templates: { ...privateItem.maintenance_templates, is_active: false } } },
  ]) {
    assert.equal(await runCommonGuideCase(templateId, {
      ...overrides, item: { ...privateItem, ...overrides.item },
    }), 'denied', `Fase A: accesso negato ${JSON.stringify(overrides)}`)
  }
  assert.equal(await runCommonGuideCase(templateId, { item: { ...privateItem, completion_mode: 'promemoria' } }),
    [airConditionerFiltersId, interiorPaintingId, differentialTestId].includes(templateId) ? 'allowed' : 'denied',
    'Fase A: promemoria consultabile solo per i template approvati')
}
assert.match(guidePage, /if \(profile\.role !== 'client'\) notFound\(\)/, 'pagina guida riservata al residente')
assert.match(guidePage, /isOwnUnit: Boolean\(item\.unit_id && membership\?\.unit_id === item\.unit_id\)/, 'pagina guida verifica unità associata')
assert.match(guidePage, /completionMode: resolveCompletionMode\(liveItem\)/, 'eligibility usa la modalità effettiva item/template')
assert.match(guidePage, /activationStatus: item\.activation_status/, 'pagina guida verifica inclusione item')
assert.doesNotMatch(guidePage, /\.insert\(|\.update\(|\.delete\(|CompletionAction|completeN2/, 'consultazione guida senza scritture o completamento')
assert.match(detailPage, /const canCompleteResident\s*=\s*mode === 'residente'/, 'completamento residente resta limitato alla modalità residente')
assert.match(detailPage, /canCompleteResident && !isCommon && \(\s*<CompletionAction\b/, 'pulsante completamento resta sotto il gate esistente')
assert.match(detailPage, /isCommonItem: isCommon && tpl\?\.scope === 'condominium'/, 'card verifica ambito comune')
assert.match(detailPage, /isOwnResidence: Boolean\(!membershipError && membership\?\.unit_id && membershipUnit\?\.residence_id === item\.residence_id\)/, 'card verifica membership della residenza senza errori')
assert.doesNotMatch(detailPage, /completionMode === 'promemoria'[^]*<CompletionAction/, 'nessun pulsante di completamento introdotto per promemoria')
const editorialText = `${JSON.stringify(vmc)} ${JSON.stringify(windows)} ${experience}`.toLocaleLowerCase('it-IT')
for (const obsolete of [
  'segui il manuale del produttore',
  'come indicato nel manuale',
  'documentazione specifica del prodotto',
  'lubrificante indicato dal produttore',
]) assert.equal(editorialText.includes(obsolete), false, `testo superato rimosso: ${obsolete}`)
const newGuideText = `${JSON.stringify(hood)} ${JSON.stringify(climate)} ${JSON.stringify(airConditionerFilters)} ${JSON.stringify(interiorPainting)} ${JSON.stringify(differentialTest)}`.toLocaleLowerCase('it-IT')
for (const unsafeInstruction of ['rimuovi i filtri', 'lava i filtri', 'smonta i condotti', 'apri il circuito', 'carica il refrigerante', 'intervieni sui componenti elettrici', 'copri la muffa', 'copri l’infiltrazione', 'apri il quadro', 'tocca i cablaggi', 'ripara il differenziale']) {
  assert.equal(newGuideText.includes(unsafeInstruction), false, `nessuna procedura tecnica non approvata: ${unsafeInstruction}`)
}
assert.match(experience, /Argomento \$\{stepIndex \+ 1\} di \$\{steps\.length\}/)
assert.match(experience, /Termina la lettura/)
assert.match(experience, /non registra alcun intervento/)
assert.match(experience, /content\.noticeTitle \?\?/)
assert.match(experience, /content\.closingMessage \?\?/)
assert.doesNotMatch(experience, /completion|completeMaintenance|submit/i)

console.log('PASS: guide residenti (allowlist, autorizzazioni, contenuti, fotografie e sola lettura).')
