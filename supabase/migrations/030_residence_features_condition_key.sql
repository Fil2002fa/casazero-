-- ============================================================
-- CasaZero — 030: modello di condizionalita del catalogo (commit 1/6)
-- ANTEPRIMA. Applica Filippo nel SQL Editor; poi esegue le query di
-- verifica in fondo e incolla l'output reale nel footer (convenzione
-- 018/024/025/027). SOLO modello dati + RLS + grants: nessun seed,
-- nessuna UI, nessuna modifica alla RPC di creazione (quella e la 032).
-- ------------------------------------------------------------
-- OBIETTIVO (catalogo 19 -> 35 voci): dare al catalogo un asse di
-- condizionalita GENERICO e guidato dai dati, cosi che l'ottava dotazione
-- sia UNA riga di catalogo e zero DDL.
--
-- DUE PEZZI, un solo concern:
--  1. residence_features (EAV) — quali dotazioni ha una residenza, con
--     provenienza tracciata per singola dotazione (wizard vs AI/B5).
--  2. maintenance_templates.condition_key — la dotazione richiesta da un
--     template. NULL = incondizionata (istanziata SEMPRE, comportamento
--     odierno). Non-NULL = istanziata solo se la residenza ha quella
--     feature presente. Il filtro sara una JOIN generica su condition_key
--     (la implementa la 032), MAI un CASE hardcoded per dotazione.
--
-- VOCABOLARIO di feature_key / condition_key: TEXT libero SENZA CHECK,
-- coerente con doc_type/sistema (024/026/027). Il set ammesso vivra in
-- un'unica costante TS, non in un CHECK Postgres: aggiungere una dotazione
-- non deve richiedere una migrazione. Il legame e per VALORE
-- (template.condition_key = residence_features.feature_key), non una FK.
--
-- PROVENIENZA (source): CHECK a 2 valori 'wizard'|'ai'. E l'unico campo a
-- vocabolario chiuso e stabile — B5 deve poter distinguere con CERTEZZA
-- cio che ha dichiarato il costruttore (wizard) da cio che ha dedotto
-- l'AI. Per questo le scritture di residence_features sono riservate al
-- service role (RPC 032 con source='wizard'; pipeline AI B5 con
-- source='ai'); authenticated ha SOLO SELECT — vedi blocco GRANTS.
-- Se un commit successivo scegliesse di scrivere qui dal client
-- autenticato, DEVE aggiungere una policy INSERT/UPDATE mirata e i column
-- grant coerenti (lezione 018): non riaprire genericamente la scrittura.
-- ============================================================

-- ------------------------------------------------------------
-- 1. residence_features — EAV delle dotazioni per residenza
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS residence_features (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  residence_id  UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
  feature_key   TEXT NOT NULL,                 -- vocabolario in costante TS, non CHECK
  present       BOOLEAN NOT NULL,              -- true = dotazione presente; false = dichiarata assente
  source        TEXT NOT NULL CHECK (source IN ('wizard', 'ai')),
  confirmed_by  UUID REFERENCES profiles(id),  -- chi ha confermato (null finche non confermata)
  confirmed_at  TIMESTAMPTZ,                   -- quando (null finche non confermata)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Una sola riga per (residenza, dotazione): l'ultima parola vince via
  -- upsert su questa chiave (wizard prima, AI/B5 poi, o viceversa).
  CONSTRAINT residence_features_uniq UNIQUE (residence_id, feature_key)
);

-- La UNIQUE indicizza gia (residence_id, feature_key); questo copre i
-- lookup per sola residenza col leading column. Esplicito per parita con
-- l'indice di residence_checklist_exception (027).
CREATE INDEX IF NOT EXISTS idx_residence_features_residence
  ON residence_features(residence_id);

-- ------------------------------------------------------------
-- 2. maintenance_templates.condition_key — dotazione richiesta
--    NULL = incondizionata (default; nessuna riga esistente cambia
--    comportamento). Popolata dal seed (commit 2, migrazione 031).
-- ------------------------------------------------------------
ALTER TABLE maintenance_templates
  ADD COLUMN IF NOT EXISTS condition_key TEXT;

COMMENT ON COLUMN maintenance_templates.condition_key IS
  'Dotazione richiesta (per valore = residence_features.feature_key). NULL = voce incondizionata, istanziata in ogni residenza. Filtro applicato dalla RPC di creazione (032).';

-- ============================================================
-- RLS — coerente con residence_checklist_exception (027):
-- config per-residenza gestita dal super_admin proprietario. Qui pero
-- SOLO SELECT: le scritture sono service-role (vedi header + GRANTS).
-- ============================================================
ALTER TABLE residence_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "residence_features: super_admin legge le proprie" ON residence_features;

CREATE POLICY "residence_features: super_admin legge le proprie"
  ON residence_features FOR SELECT
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM residences
      WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
    )
  );
-- Nessuna policy INSERT/UPDATE/DELETE -> scritture da client autenticato
-- bloccate a livello RLS. Il service role bypassa RLS (RPC 032, AI B5).

-- ============================================================
-- GRANTS — difesa in profondita (lezione 018): la sola RLS con i GRANT
-- di default di Supabase lascerebbe ad authenticated INSERT/UPDATE/DELETE
-- sulle colonne, inclusa la provenienza `source`. Li revochiamo: resta
-- SELECT (gated dalla policy). Scritture solo via service role.
-- anon non deve toccare nulla: RLS lo blocca gia, ma revochiamo per igiene.
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON public.residence_features FROM authenticated;
-- TRUNCATE/TRIGGER/REFERENCES non passano dalla RLS: col GRANT ALL di
-- default di Supabase authenticated li aveva comunque, e TRUNCATE avrebbe
-- svuotato l'intera tabella scavalcando le policy (stessa classe della 018).
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.residence_features FROM authenticated;
REVOKE ALL                    ON public.residence_features FROM anon;

-- condition_key su maintenance_templates NON richiede grant: la RLS dei
-- template (002) espone solo SELECT ad authenticated, nessuna policy di
-- scrittura -> la colonna e scrivibile solo via service role/SQL Editor
-- (il seed del commit 2). Nessuna modifica ai grant dei template qui.

-- PostgREST scarta silenziosamente tabelle/colonne non nella schema-cache:
-- ricaricala PRIMA che giri codice che legge queste strutture.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICA POST-APPLY (eseguire subito dopo l'apply; incollare l'output
-- reale come footer, convenzione 027). NB: queste query girano a vuoto
-- FINCHE la migrazione non e applicata — sono da eseguire da Filippo dopo
-- l'apply. Claude non applica DDL (CLAUDE.md), quindi il footer ESITO
-- REALE resta da compilare a mano: nessun esito inventato.
-- ============================================================
-- 1. La tabella esiste con RLS attiva:
-- SELECT relname, relrowsecurity FROM pg_class
-- WHERE relname = 'residence_features';
--
-- 2. Colonne, tipi e nullabilita di residence_features:
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'residence_features'
-- ORDER BY ordinal_position;
--
-- 3. CHECK su source (2 valori) + UNIQUE (residence_id, feature_key):
-- SELECT conname, contype, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.residence_features'::regclass
--   AND contype IN ('c', 'u')
-- ORDER BY contype;
--
-- 4. La policy SELECT super_admin esiste, e non ce ne sono altre:
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'residence_features'
-- ORDER BY policyname;
--
-- 5. Grants su residence_features: authenticated ha SOLO SELECT; anon nulla:
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name = 'residence_features'
--   AND grantee IN ('authenticated', 'anon')
-- ORDER BY grantee, privilege_type;
--
-- 6. condition_key aggiunta ai template e TUTTA NULL (nessun comportamento
--    cambia: 0 righe condizionate finche non arriva il seed 031):
-- SELECT count(*) AS templates_totali,
--        count(condition_key) AS con_condition_key_non_null
-- FROM maintenance_templates;
-- ============================================================
--
-- -- ESITO REALE (applicata da Filippo il 2026-07-28) --
-- 1. tabella + RLS | residence_features | rowsecurity=true
-- 2. colonne (8):
--    confirmed_at | timestamp with time zone | nullable=YES | default=-
--    confirmed_by | uuid                     | nullable=YES | default=-
--    created_at   | timestamp with time zone | nullable=NO  | default=now()
--    feature_key  | text                     | nullable=NO  | default=-
--    id           | uuid                     | nullable=NO  | default=gen_random_uuid()
--    present      | boolean                  | nullable=NO  | default=-
--    residence_id | uuid                     | nullable=NO  | default=-
--    source       | text                     | nullable=NO  | default=-
-- 3. constraint:
--    residence_features_source_check | CHECK ((source = ANY (ARRAY['wizard'::text, 'ai'::text])))
--    residence_features_uniq         | UNIQUE (residence_id, feature_key)
-- 4. policy | "residence_features: super_admin legge le proprie" | SELECT (unica)
-- 5. grants authenticated (PRE-revoca TRUNCATE/TRIGGER/REFERENCES, query eseguita
--    prima della revoca manuale): REFERENCES, SELECT, TRIGGER, TRUNCATE
-- 5b. grants POST-revoca (verificato via query read-only da Claude il 2026-07-28,
--     il blocco RICONTROLLO nel messaggio non conteneva output):
--     authenticated -> SELECT (solo); anon -> nessuna riga (assente)
-- 6. condition_key | templates_totali=29 | con_condition_key_non_null=0
--
-- CONCLUSIONE: 6/6 controlli + ricontrollo post-revoca confermano. RLS attiva,
-- 8 colonne, CHECK a 2 valori su source, UNIQUE(residence_id,feature_key), una
-- sola policy SELECT, authenticated con solo SELECT dopo la revoca manuale
-- (TRUNCATE/TRIGGER/REFERENCES rimossi), anon assente, condition_key tutta NULL
-- sui 29 template. La revoca manuale di TRUNCATE/TRIGGER/REFERENCES e ora anche
-- codificata sopra (blocco GRANTS) per riproducibilita.
-- ============================================================
