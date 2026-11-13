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
  completionMode: CompletionMode | null
  activationStatus: ItemActivation
  templateActive: boolean
}): boolean {
  return Boolean(
    input.templateId && ALLOWED_TEMPLATE_IDS.has(input.templateId) &&
    input.isClient && input.isOwnUnit && input.isApartmentItem &&
    (input.completionMode === 'residente' ||
      (input.completionMode === 'promemoria' && READ_ONLY_REMINDER_GUIDE_TEMPLATE_IDS.has(input.templateId))) &&
    input.activationStatus === 'inclusa' && input.templateActive,
  )
}
