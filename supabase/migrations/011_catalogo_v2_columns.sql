-- ============================================================
-- CasaZero — 011: colonne catalogo v2 (migrazione retroattiva)
-- Il DB remoto HA GIÀ queste strutture: questo file esiste solo
-- per versionare il DDL. Idempotente: eseguirlo su un DB già
-- allineato non produce alcun effetto.
-- ------------------------------------------------------------
-- Modello a due assi (v2):
--   completion_mode  — chi completa: residente · amministratore · promemoria
--   obligation_type  — vincolo: A = Obbligo di legge · B = Raccomandata · C = Consiglio
-- Sugli item, completion_mode/obligation_type NULL = eredita dal
-- template. activation_status governa il piano attivo (le voci
-- archiviate spariscono dal piano ma restano nel fascicolo).
-- is_active/is_conditional sono flag di catalogo sui template.
-- ============================================================

-- Enum (CREATE TYPE non supporta IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE completion_mode AS ENUM ('residente', 'amministratore', 'promemoria');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE obligation_type AS ENUM ('A', 'B', 'C');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE item_activation AS ENUM ('inclusa', 'esclusa', 'archiviata');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Template: due assi + flag di catalogo
ALTER TABLE maintenance_templates
  ADD COLUMN IF NOT EXISTS completion_mode completion_mode,
  ADD COLUMN IF NOT EXISTS obligation_type obligation_type,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_conditional BOOLEAN NOT NULL DEFAULT false;

-- Item: override per residenza (NULL = eredita dal template) + attivazione
ALTER TABLE maintenance_items
  ADD COLUMN IF NOT EXISTS completion_mode completion_mode,
  ADD COLUMN IF NOT EXISTS obligation_type obligation_type,
  ADD COLUMN IF NOT EXISTS activation_status item_activation NOT NULL DEFAULT 'inclusa';
