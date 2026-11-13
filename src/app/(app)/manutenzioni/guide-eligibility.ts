import type { CompletionMode, ItemActivation } from '@/types/database'

export const RESIDENT_GUIDE_TEMPLATE_IDS = {
  vmcFilters: '010214e7-7058-4d5d-a70c-69654aa66fa0',
  windows: '132b0e68-61e1-420b-adc6-e54703f49415',
} as const

const ALLOWED_TEMPLATE_IDS: ReadonlySet<string> = new Set(Object.values(RESIDENT_GUIDE_TEMPLATE_IDS))

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
    input.completionMode === 'residente' &&
    input.activationStatus === 'inclusa' && input.templateActive,
  )
}
