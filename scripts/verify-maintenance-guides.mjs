// Verifica delle guide informative residenti: `node --experimental-strip-types scripts/verify-maintenance-guides.mjs`
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

register('./ts-resolve-hooks.mjs', import.meta.url)

const eligibility = await import(new URL('../src/app/(app)/manutenzioni/guide-eligibility.ts', import.meta.url).href)
const contentModule = await import(new URL('../src/app/(app)/manutenzioni/[id]/guida/guide-content.ts', import.meta.url).href)
const illustrations = await import(new URL('../src/app/(app)/manutenzioni/maintenance-illustrations.ts', import.meta.url).href)
const { RESIDENT_GUIDE_TEMPLATE_IDS, isResidentGuideAvailable } = eligibility
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
assert.match(guidePage, /if \(profile\.role !== 'client'\) notFound\(\)/, 'pagina guida riservata al residente')
assert.match(guidePage, /isOwnUnit: Boolean\(item\.unit_id && membership\?\.unit_id === item\.unit_id\)/, 'pagina guida verifica unità associata')
assert.match(guidePage, /completionMode: resolveCompletionMode\(liveItem\)/, 'eligibility usa la modalità effettiva item/template')
assert.match(guidePage, /activationStatus: item\.activation_status/, 'pagina guida verifica inclusione item')
assert.doesNotMatch(guidePage, /\.insert\(|\.update\(|\.delete\(|CompletionAction|completeN2/, 'consultazione guida senza scritture o completamento')
assert.match(detailPage, /const canCompleteResident\s*=\s*mode === 'residente'/, 'completamento residente resta limitato alla modalità residente')
assert.match(detailPage, /canCompleteResident && !isCommon && \(\s*<CompletionAction\b/, 'pulsante completamento resta sotto il gate esistente')
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
