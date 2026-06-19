export type UserRole = 'client' | 'admin' | 'super_admin'
export type MaintenancePriority = 'N1' | 'N2' | 'N3'
export type MaintenanceScope = 'unit' | 'condominium'
export type MaintenanceStatus = 'in_attesa' | 'scaduta' | 'in_corso' | 'completata'
export type DocumentCategory =
  | 'proprieta'
  | 'tecnici'
  | 'energetici'
  | 'conformita'
  | 'amministrativi'
export type NotificationChannel = 'push' | 'email'
export type NotificationStatus = 'pending' | 'sent' | 'failed'

export interface Builder {
  id: string
  name: string
  logo_url: string | null
  primary_color: string
  created_at: string
}

export interface Residence {
  id: string
  builder_id: string
  name: string
  address: string | null
  energy_class: string | null
  photo_url: string | null
  delivery_date: string | null
  created_at: string
}

export interface Unit {
  id: string
  residence_id: string
  label: string
  floor: number | null
  created_at: string
}

export interface Profile {
  id: string
  builder_id: string | null
  role: UserRole
  full_name: string | null
  phone: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface MaintenanceTemplate {
  id: string
  title: string
  category: string
  description: string | null
  frequency_months: number
  priority: MaintenancePriority
  scope: MaintenanceScope
  sort_order: number | null
  created_at: string
}

export interface MaintenanceItem {
  id: string
  template_id: string
  residence_id: string
  unit_id: string | null
  frequency_months: number | null
  priority: MaintenancePriority | null
  warranty_info: string | null
  supplier_id: string | null
  next_due_date: string | null
  status: MaintenanceStatus
  created_at: string
  updated_at: string
}

// Preferenze di notifica memorizzate in profiles.notification_prefs (JSONB).
// email_maintenance_due non è incluso: è sempre true (invariante di business).
export interface NotificationPrefs {
  push_maintenance_due: boolean
  push_reminders:       boolean
  email_reminders:      boolean
  push_n3_status:       boolean
  email_n3_status:      boolean
  push_new_document:    boolean
  push_new_comment:     boolean
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push_maintenance_due: true,
  push_reminders:       true,
  email_reminders:      true,
  push_n3_status:       true,
  email_n3_status:      true,
  push_new_document:    true,
  push_new_comment:     true,
}

export interface Completion {
  id: string
  item_id: string
  unit_id: string | null
  residence_id: string
  completed_at: string
  performed_by_profile_id: string | null
  performed_by_name: string | null
  notes: string | null
  created_at: string
}
