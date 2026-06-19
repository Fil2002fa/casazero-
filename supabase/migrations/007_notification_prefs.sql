-- 007: preferenze di notifica per utente
-- Colonna JSONB su profiles; default = tutto attivo.
-- email per N2/N3 scadute è sempre true e NON viene memorizzata qui
-- (il motore la legge come invariante).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT
    '{"push_maintenance_due":true,"push_reminders":true,"email_reminders":true,"push_n3_status":true,"email_n3_status":true,"push_new_document":true,"push_new_comment":true}'::jsonb;
