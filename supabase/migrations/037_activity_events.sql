-- CasaZero — 037: activity_events, registro append-only di comunicazioni e atti
-- amministrativi. NON è il fascicolo legale (quello resta `completions`) e NON
-- duplica i completamenti: i completamenti entrano nel feed solo via join a
-- lettura. Qui finiscono solo gli atti che oggi non lasciano traccia leggibile.
--
-- Applica Filippo nel SQL Editor; subito dopo esegue le query di verifica in
-- fondo e incolla l'output reale nel footer (convenzione 024/025/026/027).
--
-- Modello di immutabilità copiato da `completions` (001_schema.sql:156-167 +
-- 002_rls.sql:304-316 + 008_rls_completions_hardening.sql):
--   • nessun `updated_at` sulla tabella
--   • nessuna policy UPDATE, nessuna policy DELETE, per nessun ruolo
--   • DROP POLICY IF EXISTS difensivi (no-op se non esistono)
--   • in più, rispetto a completions: REVOKE UPDATE/DELETE a livello di GRANT,
--     così l'append-only non dipende solo dall'assenza di policy — se un giorno
--     qualcuno creasse per errore una policy UPDATE, il privilegio manca comunque.
--
-- ATTENZIONE (limite noto, non aggirabile): il ruolo `service_role` bypassa RLS
-- e i GRANT. Le scritture da server action con service client non sono vincolate
-- dalle policy INSERT qui sotto. Stesso limite già presente su `completions`.

-- ============================================================
-- 1. Tabella
-- ============================================================

CREATE TABLE activity_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope: il registro vive dentro la residenza. Nessun evento senza residenza.
  -- Nessun ON DELETE: come completions (001_schema.sql:159), la cancellazione
  -- di una residenza con registro va fatta a mano via service role, non per
  -- cascata silenziosa. Un CASCADE sarebbe l'unico DELETE possibile su una
  -- tabella dichiarata append-only.
  residence_id UUID NOT NULL REFERENCES residences(id),
  unit_id      UUID REFERENCES units(id),

  event_type   TEXT NOT NULL CHECK (event_type IN (
    'sollecito_inviato',
    'invito_inviato',
    'invito_accettato',
    'admin_assegnato',
    'admin_rimosso',
    'documento_caricato',
    -- Registra SOLO la classificazione confermata da una persona, mai
    -- l'auto-classificazione AI ad alta confidenza. È un vincolo di prodotto,
    -- non esprimibile in un CHECK: il DB non può distinguere le due origini.
    -- Chi aggiunge un punto di scrittura per questo tipo deve verificarlo a mano.
    'documento_classificato',
    -- Un evento per ATTO, non per istanza: l'archiviazione agisce su tutte le
    -- istanze di un template nella residenza (activation_status passa ad
    -- 'archiviata', tipo item_activation: 'inclusa' | 'esclusa' | 'archiviata').
    -- Il numero di voci toccate va nel payload, non moltiplicato in righe.
    'voce_archiviata'
  )),

  -- Attore: chi ha compiuto l'atto. NULL solo per atti non umani.
  -- `actor_role` e `actor_name` sono CONGELATI al momento dell'atto: un registro
  -- storico non deve cambiare di senso se il ruolo o il nome della persona
  -- cambiano dopo. Stessa logica di completions.performed_by_name
  -- (001_schema.sql:163), che esiste proprio per sopravvivere all'attore.
  actor_id     UUID REFERENCES profiles(id),
  actor_role   user_role,
  actor_name   TEXT,

  -- Dati strutturati dell'evento, MAI testo già formattato per lo schermo:
  -- il registro è immutabile, quindi una stringa di presentazione sbagliata
  -- resterebbe sbagliata per sempre. La resa testuale è responsabilità della UI.
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb
                 CHECK (jsonb_typeof(payload) = 'object'),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Nessun updated_at — record immutabile
);

-- Il feed è "una residenza, ordinata dal più recente": è l'unico accesso previsto.
CREATE INDEX idx_activity_events_residence_created
  ON activity_events(residence_id, created_at DESC);

CREATE INDEX idx_activity_events_actor
  ON activity_events(actor_id);

COMMENT ON TABLE activity_events IS
  'Registro append-only di comunicazioni e atti amministrativi per residenza. Non è il fascicolo legale (completions) e non ne duplica i record.';

-- ============================================================
-- 2. RLS
-- ============================================================

ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- NOTA DELIBERATA: qui NON si usa czero_can_access_residence(), che è la scorciatoia
-- ovvia e sarebbe sbagliata. Quella funzione (002_rls.sql:29-54) include un ramo
-- `role = 'client'` via unit_members: usarla darebbe al residente la lettura del
-- registro, che è esattamente ciò che il requisito esclude. I due ruoli ammessi
-- hanno quindi due policy esplicite e separate.
--
-- NOTA SULLE QUALIFICAZIONI: in ogni subquery le colonne di activity_events sono
-- qualificate (`activity_events.residence_id`). Non è cosmetica: `admin_assignments`
-- HA una colonna `residence_id`, quindi un riferimento non qualificato dentro quella
-- subquery si legherebbe silenziosamente ad admin_assignments e la condizione
-- diventerebbe la tautologia `aa.residence_id = aa.residence_id` — policy sempre vera,
-- nessun errore di parsing. È la bug class registrata in CLAUDE.md.

DROP POLICY IF EXISTS "activity_events: super_admin legge le proprie residenze" ON activity_events;
DROP POLICY IF EXISTS "activity_events: admin legge le residenze che segue"     ON activity_events;
DROP POLICY IF EXISTS "activity_events: super_admin registra"                   ON activity_events;
DROP POLICY IF EXISTS "activity_events: admin registra"                         ON activity_events;

-- SELECT — super_admin: solo le residenze del proprio builder.
CREATE POLICY "activity_events: super_admin legge le proprie residenze"
  ON activity_events FOR SELECT
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM public.residences r
      WHERE r.id = activity_events.residence_id
        AND r.builder_id = public.czero_user_builder_id()
    )
  );

-- SELECT — admin: solo le residenze che segue davvero, adesso.
CREATE POLICY "activity_events: admin legge le residenze che segue"
  ON activity_events FOR SELECT
  USING (
    public.czero_user_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM public.admin_assignments aa
      WHERE aa.profile_id = auth.uid()
        AND aa.residence_id = activity_events.residence_id
    )
  );

-- Il residente (`role = 'client'`) non ha alcuna policy SELECT: RLS nega.
-- Non serve una policy negativa, serve l'assenza di policy.

-- INSERT — super_admin. `actor_id = auth.uid()` è antispoofing a livello DB,
-- stesso hardening di completions (020_completions_insert_hardening.sql:28-38):
-- nessun client può registrare un atto a nome di un altro.
CREATE POLICY "activity_events: super_admin registra"
  ON activity_events FOR INSERT
  WITH CHECK (
    public.czero_user_role() = 'super_admin'
    AND actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.residences r
      WHERE r.id = activity_events.residence_id
        AND r.builder_id = public.czero_user_builder_id()
    )
    AND (
      unit_id IS NULL
      OR activity_events.residence_id = (SELECT u.residence_id FROM public.units u WHERE u.id = activity_events.unit_id)
    )
  );

-- INSERT — admin, solo sulle residenze che segue.
CREATE POLICY "activity_events: admin registra"
  ON activity_events FOR INSERT
  WITH CHECK (
    public.czero_user_role() = 'admin'
    AND actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.admin_assignments aa
      WHERE aa.profile_id = auth.uid()
        AND aa.residence_id = activity_events.residence_id
    )
    AND (
      unit_id IS NULL
      OR activity_events.residence_id = (SELECT u.residence_id FROM public.units u WHERE u.id = activity_events.unit_id)
    )
  );

-- UPDATE e DELETE: nessuna policy, per nessun ruolo → negati da RLS.
-- DROP difensivi (no-op se non esistono), stessa tecnica di 008 righe 31-35.
DROP POLICY IF EXISTS "activity_events: aggiornamento" ON activity_events;
DROP POLICY IF EXISTS "activity_events: eliminazione"  ON activity_events;

-- ============================================================
-- 3. Grants — secondo livello, indipendente dalle policy
-- ============================================================
-- Coerente con 031_grants_hardening.sql / 032_grants_hardening_anon.sql.
-- Qui l'append-only smette di dipendere dall'assenza di policy: il privilegio
-- UPDATE/DELETE non esiste proprio per i ruoli applicativi.

REVOKE ALL ON public.activity_events FROM anon;
REVOKE ALL ON public.activity_events FROM authenticated;
GRANT SELECT, INSERT ON public.activity_events TO authenticated;

-- ============================================================
-- 4. PostgREST — ultima istruzione eseguibile del file
-- ============================================================
-- PostgREST scarta silenziosamente tabelle non presenti nella sua schema-cache:
-- ricaricala PRIMA che giri codice che legge o scrive questa tabella.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICA POST-APPLY (eseguire e incollare l'output nel footer)
-- ============================================================

-- V1 — le uniche policy esistenti devono essere 2 SELECT + 2 INSERT.
--      Zero righe con cmd IN ('UPDATE','DELETE','ALL').
-- SELECT policyname, cmd, roles
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'activity_events'
--  ORDER BY cmd, policyname;

-- V2 — i privilegi di `authenticated` devono essere esattamente SELECT e INSERT;
--      `anon` non deve comparire affatto.
-- SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_schema = 'public' AND table_name = 'activity_events'
--    AND grantee IN ('anon','authenticated')
--  ORDER BY grantee, privilege_type;

-- V3 — RLS attiva sulla tabella.
-- SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class WHERE relname = 'activity_events';

-- V4 — prova negativa di scoping: nessuna policy deve nominare unit_members
--      (sarebbe il ramo residente entrato di straforo via czero_can_access_residence).
--      Attesa: zero righe.
-- SELECT policyname, qual::text
--   FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'activity_events'
--    AND qual::text ILIKE '%unit_members%';

-- V5 — prova negativa di spoofing dell'attore (deve FALLIRE con violazione RLS).
--      Eseguire come utente super_admin autenticato, non come service_role.
-- BEGIN;
--   INSERT INTO activity_events (residence_id, event_type, actor_id, actor_role)
--   VALUES ('<residenza-del-proprio-builder>', 'sollecito_inviato',
--           '<un-profile_id-diverso-dal-proprio>', 'super_admin');
-- ROLLBACK;

-- V6 — prova negativa di immutabilità (deve toccare 0 righe o fallire).
--      Eseguire come utente autenticato, non come service_role.
-- BEGIN;
--   UPDATE activity_events SET payload = '{}'::jsonb WHERE true;
--   DELETE FROM activity_events WHERE true;
-- ROLLBACK;

-- ── ESITO REALE (apply 09/09/2026) ──
--
-- V1 — 4 righe, nessuna UPDATE/DELETE/ALL:
--   activity_events: admin registra                        | INSERT | {public}
--   activity_events: super_admin registra                  | INSERT | {public}
--   activity_events: admin legge le residenze che segue    | SELECT | {public}
--   activity_events: super_admin legge le proprie residenze| SELECT | {public}
--
-- V2 — authenticated: INSERT, SELECT. anon: nessuna riga (REVOKE efficace).
--
-- V3 — activity_events | relrowsecurity=true | relforcerowsecurity=false
--
-- V4 — zero righe: nessuna policy nomina unit_members.
--
-- V6 — nessun errore, tabella vuota. Prova di immutabilità da ripetere
--      quando ci saranno eventi, ora non discriminante.
--
-- V5 — NON ESEGUITA. Richiede un utente autenticato: il SQL Editor gira come
--      owner e bypassa RLS, quindi qualunque esito sarebbe fuorviante.
--      Verifica rimandata a un test dall'app dopo il commit che scrive
--      il primo evento.
