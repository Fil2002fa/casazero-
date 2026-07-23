-- ============================================================
-- CasaZero — 027: tabelle checklist di consegna + seed strato BASE (B4, commit 3)
-- Applica Filippo nel SQL Editor; subito dopo esegue le query di verifica in
-- fondo e incolla l'output reale nel footer (convenzione 024/025/026).
-- SOLO modello dati e seed: nessun helper di calcolo, nessuna mappa derivata
-- (quella è il commit 4), nessuna UI.
-- ------------------------------------------------------------
-- DUE STRATI (diagnosi B4):
--  • BASE — righe valide per ogni residenza, versionate, UNICHE DI SISTEMA
--    (non copiate dentro ogni residenza): document_checklist_template.
--  • DERIVATO — generato a runtime dagli impianti nel piano attivo (commit 4),
--    NON materializzato qui.
-- Le eccezioni per residenza (riga non applicabile / "atteso da") vivono in
-- residence_checklist_exception.
--
-- SCOPE (CHECK a 4 valori). In v1 si usano solo 3; 'unit' resta nello schema
-- ma NON è usato finché la risoluzione per-unità non arriva (B4.5):
--  • condominium   → attesa di parti comuni
--  • residence     → attesa della residenza nel suo insieme, non ripartita
--  • dossier_admin → passaggio consegne all'amministratore (raggruppamento UI)
--  • unit          → per-unità, NON usato in v1
--
-- REGOLA DI MATCH per scope (la implementa il commit 4 — documentata qui perché
-- è parte del contratto del modello dati):
--  • condominium   → conta come presente SOLO un documento con unit_id IS NULL
--  • residence     → qualunque documento della residenza, unit_id ignorato
--  • dossier_admin → come condominium (unit_id IS NULL); cambia solo il
--                    raggruppamento in UI, non la regola di match
--  • unit          → non usato in v1
--
-- CHIAVE CANONICA anti-duplicazione (expectation_key), usata dal commit 4 per
-- fondere BASE e DERIVATO e come join verso le eccezioni:
--     expectation_key = scope || ':' || doc_type || ':' || coalesce(sistema,'')
-- BASE e DERIVATO che puntano alla stessa attesa collidono su questa chiave e
-- contano una volta sola.
--
-- doc_type / sistema sono TEXT liberi SENZA CHECK, coerenti con documents
-- (024/026): il vocabolario ammesso vive in un'unica costante TS
-- (src/lib/document-classification.ts), non in un CHECK Postgres.
-- ============================================================

-- ------------------------------------------------------------
-- BASE: template di checklist, versionato, unico di sistema
-- ------------------------------------------------------------
CREATE TABLE document_checklist_template (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version     INTEGER NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('unit', 'condominium', 'dossier_admin', 'residence')),
  doc_type    TEXT NOT NULL,
  sistema     TEXT,                       -- NULL = attesa non impianto-specifica
  label       TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Eccezioni per residenza: riga marcata non applicabile + "atteso da"
-- ------------------------------------------------------------
CREATE TABLE residence_checklist_exception (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  residence_id    UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
  expectation_key TEXT NOT NULL,          -- vedi CHIAVE CANONICA sopra: vale per BASE e DERIVATO
  unit_id         UUID REFERENCES units(id) ON DELETE CASCADE,  -- v1: sempre NULL
  not_applicable  BOOLEAN NOT NULL DEFAULT false,
  expected_from   TEXT,                   -- testo libero: fornitore/soggetto che deve consegnare
  note            TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULLS NOT DISTINCT (PG15+): con unit_id NULL (il caso v1) due eccezioni con
  -- stesso residence_id+expectation_key verrebbero altrimenti ammesse entrambe
  -- (NULL != NULL nelle UNIQUE standard), vanificando l'anti-duplicazione.
  CONSTRAINT residence_checklist_exception_uniq
    UNIQUE NULLS NOT DISTINCT (residence_id, expectation_key, unit_id)
);

CREATE INDEX idx_checklist_exception_residence
  ON residence_checklist_exception(residence_id);

-- ============================================================
-- RLS (coerente con 002_rls.sql)
--  • template di sistema: leggibile da ogni autenticato, scrivibile solo via
--    migrazione/seed (nessuna policy di scrittura → service role o SQL Editor).
--    Stesso modello di "templates: tutti gli autenticati leggono".
--  • eccezioni: gestite (ALL) dal super_admin proprietario della residenza.
--    Stesso modello di "items: super_admin gestisce tutto" (FOR ALL con solo
--    USING: il WITH CHECK degli INSERT eredita da USING).
-- ============================================================
ALTER TABLE document_checklist_template    ENABLE ROW LEVEL SECURITY;
ALTER TABLE residence_checklist_exception  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_template: tutti gli autenticati leggono"
  ON document_checklist_template FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "checklist_exception: super_admin gestisce tutto"
  ON residence_checklist_exception FOR ALL
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM residences
      WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
    )
  );

-- ============================================================
-- SEED strato BASE — version = 1, is_active = true. 11 righe.
-- Fuori dal seed v1 (decisioni prese): APE e planimetria catastale (per-unità,
-- B4.5); titoli edilizi / fine lavori (nessun doc_type, presupposti da
-- agibilita); collaudo ascensore (nessun template ascensore in catalogo).
-- ============================================================
INSERT INTO document_checklist_template (version, scope, doc_type, sistema, label, sort_order) VALUES
  -- condominium
  (1, 'condominium',   'agibilita',                NULL,        'Agibilità (SCA)',                                1),
  (1, 'condominium',   'dich_conformita_dm37',     'elettrico', 'Conformità impianto elettrico parti comuni',     2),
  (1, 'condominium',   'polizza_decennale',        NULL,        'Polizza decennale postuma',                      3),
  (1, 'condominium',   'as_built',                 NULL,        'Elaborati as-built',                             4),
  (1, 'condominium',   'piano_manutenzione_opera', NULL,        'Piano di manutenzione dell''opera',              5),
  -- dossier_admin
  (1, 'dossier_admin', 'regolamento_condominiale', NULL,        'Regolamento condominiale',                       6),
  (1, 'dossier_admin', 'tabelle_millesimali',      NULL,        'Tabelle millesimali',                            7),
  (1, 'dossier_admin', 'elenco_fornitori',         NULL,        'Elenco fornitori e manutentori',                 8),
  (1, 'dossier_admin', 'garanzia',                 NULL,        'Raccolta garanzie componenti comuni',            9),
  -- residence
  (1, 'residence',     'capitolato',               NULL,        'Capitolato e varianti',                         10),
  (1, 'residence',     'schede_materiali',         NULL,        'Schede materiali e finiture',                   11);

-- PostgREST scarta silenziosamente colonne/tabelle non presenti nella sua
-- schema-cache: ricaricala PRIMA che giri codice che legge queste tabelle.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICA POST-APPLY (eseguire subito dopo, incollare l'output come footer).
-- ============================================================
-- 1. Le due tabelle esistono con RLS attiva:
-- SELECT relname, relrowsecurity FROM pg_class
-- WHERE relname IN ('document_checklist_template','residence_checklist_exception');
--
-- 2. Le 2 policy sulle 2 tabelle esistono:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename IN ('document_checklist_template','residence_checklist_exception')
-- ORDER BY tablename, policyname;
--
-- 3. Seed: 11 righe, tutte version=1/is_active=true, ripartite 5/4/2:
-- SELECT scope, count(*) FROM document_checklist_template GROUP BY scope ORDER BY scope;
-- SELECT count(*) AS tot,
--        count(*) FILTER (WHERE version=1 AND is_active) AS v1_attive
-- FROM document_checklist_template;
--
-- 4. Il vincolo UNIQUE NULLS NOT DISTINCT è presente:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'public.residence_checklist_exception'::regclass
--   AND contype = 'u';
-- ============================================================
--
-- ── ESITO REALE (applicata da Filippo il 23/07/2026) ──
--
-- 1. Le due tabelle esistono con RLS attiva:
--    document_checklist_template   | relrowsecurity = true
--    residence_checklist_exception | relrowsecurity = true
--
-- 2. Le 2 policy sulle 2 tabelle:
--    document_checklist_template   | "checklist_template: tutti gli autenticati leggono" | SELECT
--    residence_checklist_exception | "checklist_exception: super_admin gestisce tutto"    | ALL
--
-- 3. Seed 11 righe, ripartite 5/4/2, tutte version=1/is_active=true:
--    condominium=5, dossier_admin=4, residence=2
--    tot=11, v1_attive=11
--
-- 4. Vincolo di unicità presente:
--    residence_checklist_exception_uniq |
--      UNIQUE NULLS NOT DISTINCT (residence_id, expectation_key, unit_id)
-- ============================================================
