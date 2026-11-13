export type UserRole = 'client' | 'admin' | 'super_admin'
export type MaintenancePriority = 'N1' | 'N2' | 'N3'
export type MaintenanceScope = 'unit' | 'condominium'
export type MaintenanceStatus = 'in_attesa' | 'scaduta' | 'in_corso' | 'completata'
export type CompletionMode = 'residente' | 'amministratore' | 'promemoria'
export type ObligationType = 'A' | 'B' | 'C'
export type ItemActivation = 'inclusa' | 'esclusa' | 'archiviata'
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
  delivery_date: string | null
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
  /** Testi per il residente (migrazione 055). `description` è ora il testo divulgativo. */
  why_it_matters: string | null
  who_does_it: string | null
  what_to_keep: string | null
  /** Array di passi (stringhe) o null. */
  how_to: string[] | null
  /** Vecchio testo tecnico di `description`, conservato dalla 056. */
  technical_notes: string | null
}

/**
 * Istanza di manutenzione per residenza/unità. `unit_id` NULL = parti comuni.
 *
 * I due assi del modello v2 (`completion_mode` = chi completa,
 * `obligation_type` = vincolo) sono nullable sull'item: il valore effettivo si
 * risolve item ?? template, via resolveCompletionMode / resolveObligationType
 * in src/lib/maintenance-status.ts, mai leggendo la colonna da sola.
 * `priority` è la colonna legacy tenuta in vita dal dual-write (CLAUDE.md).
 *
 * Le tre colonne della 011_catalogo_v2_columns.sql erano assenti da questa
 * interfaccia: nessun chiamante la usa (il client Supabase non porta i generics
 * del Database), quindi la desincronizzazione non dava errore di compilazione.
 */
export interface MaintenanceItem {
  id: string
  template_id: string
  residence_id: string
  unit_id: string | null
  frequency_months: number | null
  priority: MaintenancePriority | null
  completion_mode: CompletionMode | null
  obligation_type: ObligationType | null
  activation_status: ItemActivation
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

// Preferenze di notifica del super_admin (costruttore), memorizzate nella stessa
// colonna profiles.notification_prefs (JSONB). Le chiavi sono distinte da quelle
// del residente: il super_admin ha un profilo separato, quindi nessun conflitto.
// Solo canale email: la dashboard super_admin è uno strumento desktop, senza PWA
// né service worker, quindi le notifiche push non hanno un canale reale.
export interface AdminNotificationPrefs {
  email_n3_completed:     boolean
  email_new_resident:     boolean
  email_n2_overdue_30:    boolean
  email_report_generated: boolean
}

export const DEFAULT_ADMIN_NOTIFICATION_PREFS: AdminNotificationPrefs = {
  email_n3_completed:     true,
  email_new_resident:     true,
  email_n2_overdue_30:    true,
  email_report_generated: false, // report annuale generato: disattivo di default
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

/**
 * I 13 tipi di evento del registro attività. Allineato uno a uno al CHECK su
 * `event_type`, la cui definizione viva è in
 * 053_activity_event_documento_eliminato.sql: aggiungere un valore qui senza
 * una migrazione che allarghi il CHECK produce un errore a runtime, non a
 * compilazione.
 * `src/lib/activity-log.ts` lo ri-esporta per i chiamanti di scrittura, ma la
 * fonte di verità è questa, accanto agli altri union del DB.
 *
 * `data_consegna_modificata` lo scrive SOLO la RPC czero_register_delivery
 * (045), mai logActivityEvent: l'evento deve stare nella stessa transazione
 * delle date che racconta.
 */
export type ActivityEventType =
  | 'sollecito_inviato'
  | 'invito_inviato'
  | 'invito_accettato'
  | 'admin_assegnato'
  | 'admin_rimosso'
  | 'documento_caricato'
  | 'documento_classificato'
  | 'voce_archiviata'
  | 'data_consegna_modificata'
  | 'documento_corretto'
  | 'documento_unita_cambiata'
  | 'documento_eliminato'
  | 'documento_file_non_rimosso'

/**
 * Riga del registro attività. Append-only: la 037 non ha policy UPDATE né
 * DELETE per nessun ruolo.
 *
 * `payload` è JSONB e resta `unknown` per chiave: la sua forma varia per
 * `event_type` e non è vincolata dal DB, quindi va letta in modo difensivo
 * dalla superficie che la rende. `unit_id` NULL significa evento condominiale.
 *
 * Il client Supabase non porta i generics del Database, quindi questa
 * interfaccia non è imposta dal compilatore sulla select: va applicata a mano
 * al risultato.
 */
export interface ActivityEvent {
  id: string
  residence_id: string
  unit_id: string | null
  event_type: ActivityEventType
  actor_id: string | null
  actor_role: UserRole | null
  actor_name: string | null
  payload: Record<string, unknown>
  created_at: string
}

/**
 * Tipo di un documento del residente: allineato uno a uno al CHECK su
 * `resident_documents.doc_kind` (059_resident_documents.sql). Etichette e
 * ordine vivono in src/lib/resident-document-upload.ts.
 */
export type ResidentDocKind =
  | 'ricevuta'
  | 'rapporto_tecnico'
  | 'garanzia'
  | 'manuale'
  | 'foto'
  | 'altro'

/** MIME ammessi, allineati al CHECK su `mime_type` e al bucket `resident-documents`. */
export type ResidentDocMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'

/**
 * Documento caricato dal residente (059_resident_documents.sql). Visibile solo
 * se chi guarda E chi ha caricato sono membri attivi della stessa unità; solo
 * ruolo client. Nessun UPDATE: si elimina e si ricarica.
 *
 * `storage_path` = `{unit_id}/{uuid}.{ext}` nel bucket privato
 * `resident-documents`: il nome file dell'utente non entra mai né nel path né
 * nella tabella. `uploaded_by` ha default auth.uid().
 */
export interface ResidentDocument {
  id: string
  unit_id: string
  uploaded_by: string
  doc_kind: ResidentDocKind
  title: string
  storage_path: string
  mime_type: ResidentDocMime
  size_bytes: number
  created_at: string
}

/**
 * Correzione manuale di un campo estratto (048_document_field_overrides.sql).
 * Stato corrente, non storico: una riga = la correzione in vigore per quel
 * campo; "Ripristina valore AI" è una DELETE.
 *
 * Vale solo se `for_doc_type` coincide con il doc_type attuale del documento
 * (stessa regola di attualità di document_extractions). `field_key` non ha
 * CHECK nel DB: le chiavi ammesse per tipo vivono in src/lib/document-overrides.ts.
 * `value` NULL = l'utente dichiara che il documento non riporta il campo.
 *
 * Scrive solo il service role dalla server action: authenticated ha solo SELECT.
 */
export interface DocumentFieldOverride {
  document_id: string
  for_doc_type: string
  field_key: string
  value: string | null
  set_by: string
  set_at: string
}
