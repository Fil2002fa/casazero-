export type ScaduteRow = {
  id: string
  priority: string | null
  maintenance_templates: { priority: string } | null
}

export function effPriority(i: ScaduteRow): string {
  return i.priority ?? i.maintenance_templates?.priority ?? 'N2'
}
