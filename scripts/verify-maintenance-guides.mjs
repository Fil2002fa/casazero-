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
const ductsId = '70b3f1dd-f0ad-427c-9d38-f99143900778'

assert.equal(isResidentGuideAvailable({ ...base, templateId: vmcId }), true, 'VMC filtri abilitata')
assert.equal(isResidentGuideAvailable({ ...base, templateId: windowsId }), true, 'serramenti abilitati')
assert.equal(isResidentGuideAvailable({ ...base, templateId: ductsId }), false, 'VMC condotti esclusa')
assert.equal(isResidentGuideAvailable({ ...base, templateId: 'other' }), false, 'altre manutenzioni escluse')
assert.equal(isResidentGuideAvailable({ ...base, templateId: null }), false, 'ID assente escluso')

for (const [field, denied] of [
  ['isClient', false],
  ['isOwnUnit', false],
  ['isApartmentItem', false],
  ['completionMode', 'amministratore'],
  ['activationStatus', 'archiviata'],
  ['templateActive', false],
]) {
  assert.equal(isResidentGuideAvailable({ ...base, templateId: vmcId, [field]: denied }), false, `gate ${field}`)
}

const vmc = getResidentGuideContent(vmcId)
const windows = getResidentGuideContent(windowsId)
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
assert.equal(getResidentGuideContent(ductsId), null, 'nessun contenuto per VMC condotti')

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
const editorialText = `${JSON.stringify(vmc)} ${JSON.stringify(windows)} ${experience}`.toLocaleLowerCase('it-IT')
for (const obsolete of [
  'segui il manuale del produttore',
  'come indicato nel manuale',
  'documentazione specifica del prodotto',
  'lubrificante indicato dal produttore',
]) assert.equal(editorialText.includes(obsolete), false, `testo superato rimosso: ${obsolete}`)
assert.match(experience, /Argomento \$\{stepIndex \+ 1\} di \$\{steps\.length\}/)
assert.match(experience, /Termina la lettura/)
assert.match(experience, /non registra alcun intervento/)
assert.doesNotMatch(experience, /completion|completeMaintenance|submit/i)

console.log('PASS: guide residenti (allowlist, autorizzazioni, contenuti, fotografie e sola lettura).')
