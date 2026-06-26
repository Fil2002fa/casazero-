export type ScaduteRow = {
  id: string
  unit_id?: string | null
  priority: string | null
  maintenance_templates: { priority: string } | null
}

export function effPriority(i: ScaduteRow): string {
  return i.priority ?? i.maintenance_templates?.priority ?? 'N2'
}
