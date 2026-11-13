import type { CompletionMode, ItemActivation } from '@/types/database'

export const RESIDENT_GUIDE_TEMPLATE_IDS = {
  vmcFilters: '010214e7-7058-4d5d-a70c-69654aa66fa0',
  windows: '132b0e68-61e1-420b-adc6-e54703f49415',
  cookerHood: '1059026c-e1d2-4dc0-8154-9c2f1dba75ee',
  climateSystem: 'fc529672-3045-4799-8a10-01614a2a1dc3',
  airConditionerFilters: '13a27be8-4964-494c-9cf3-99df52154079',
  interiorPainting: '26be7f69-8042-48bb-9fd5-549c7ec93cc3',
  differentialTest: 'd6e71a15-6d8c-4c5c-88ed-f9f4c105f321',
} as const

export const COMMON_GUIDE_TEMPLATE_IDS = {
  liftMaintenance: 'a47686ee-3f1d-4721-a3f6-6e4c282fdb0d',
  liftInspection: 'd582bfad-41c4-4823-9a40-26e6c3acbf92',
  photovoltaic: '7296f859-9ad6-45bb-8d1a-298f93a50146',
  roof: 'f0c52720-b654-4e9b-916f-aae267001738',
  gutters: 'd9b03bd4-761e-4ffa-9739-4308736b3c8f',
  lifelines: '1fd67a1e-8381-4ddc-b383-25739150dca2',
  inspectionChambers: '225cc536-e8c0-4ffc-8c77-4643c8311504',
  poweredGates: '7ed48ab6-d4e0-4fd9-bfdd-7777e92918b8',
  commonHeating: '08d73253-7cd3-42bf-9676-52267bfeeb90',
  energyEfficiency: '55ed1153-d229-4587-8959-d945a9cc344a',
  earthing: '4a74e428-62dc-436f-813f-eb58ddfa9bfe',
  pressureBooster: 'b6525a25-e227-4c81-8942-3c7bca20d82f',
  extinguishers: 'fc20e159-4b1b-4a71-8d25-f1c70b16d9a0',
  hydrants: 'b25e9c86-9e90-47ee-afce-f89db3fe50c4',
  fireDoors: '18452296-fccb-491b-a27b-34fb0bd02214',
  emergencyLighting: '4390667e-4a6e-4d6d-8f54-f7e996b4513b',
  fireDetection: 'dbe47b50-413c-45e8-80e2-2aa65024fef0',
  smokeExhaust: '8b0ca75c-14c4-40fa-a846-121aa5b22ad9',
} as const

const COMMON_TEMPLATE_IDS: ReadonlySet<string> = new Set(Object.values(COMMON_GUIDE_TEMPLATE_IDS))
const ALLOWED_TEMPLATE_IDS: ReadonlySet<string> = new Set(Object.values(RESIDENT_GUIDE_TEMPLATE_IDS))
const READ_ONLY_REMINDER_GUIDE_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  RESIDENT_GUIDE_TEMPLATE_IDS.airConditionerFilters,
  RESIDENT_GUIDE_TEMPLATE_IDS.interiorPainting,
  RESIDENT_GUIDE_TEMPLATE_IDS.differentialTest,
])

export function isResidentGuideAvailable(input: {
  templateId: string | null
  isClient: boolean
  isOwnUnit: boolean
  isApartmentItem: boolean
  isCommonItem?: boolean
  isOwnResidence?: boolean
  completionMode: CompletionMode | null
  activationStatus: ItemActivation
  templateActive: boolean
}): boolean {
  if (!input.templateId || !input.isClient || input.activationStatus !== 'inclusa' || !input.templateActive) return false
  if (COMMON_TEMPLATE_IDS.has(input.templateId)) {
    return input.isCommonItem === true && !input.isApartmentItem &&
      input.isOwnResidence === true && input.completionMode === 'amministratore'
  }
  return Boolean(
    input.templateId && ALLOWED_TEMPLATE_IDS.has(input.templateId) &&
    input.isClient && input.isOwnUnit && input.isApartmentItem &&
    (input.completionMode === 'residente' ||
      (input.completionMode === 'promemoria' && READ_ONLY_REMINDER_GUIDE_TEMPLATE_IDS.has(input.templateId))) &&
    input.activationStatus === 'inclusa' && input.templateActive,
  )
}
