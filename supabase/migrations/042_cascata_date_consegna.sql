-- ============================================================
-- CasaZero — 042: persistenza dei livelli della cascata di consegna
-- APPLICATA a mano nel SQL Editor il 2026-10-24, verificata da Filippo:
-- esiti reali nel footer in fondo (V0-V9, tutti con l'atteso). La V0b ha
-- confermato che il corpo vivo del guard coincideva con quello della 021,
-- quindi la riscrittura della sezione 5 non ha cancellato nessun ramo.
-- Test RLS (6 negativi + 5 positivi) eseguiti il 2026-10-26, tutti con
-- l'atteso: esiti in fondo, blocchi commentati.
-- Statement singoli idempotenti, nessun BEGIN/COMMIT (il SQL Editor non gira
-- in transazione): rieseguibile senza effetti collaterali.
-- SOLO modello dati + RLS + grants: nessun seed, nessuna UI, nessuna modifica
-- alle RPC di creazione (quelle sono la 044) e nessun next_due_date toccato.
-- ------------------------------------------------------------
-- PREREQUISITO: la 041 (units.delivery_date) va applicata PRIMA di questa.
--
-- OBIETTIVO: rendere RICALCOLABILE la base di una scadenza. La cascata
-- approvata il 24/10 e
--
--     voce > categoria > unita > residenza > NULL
--
-- ma oggi due dei cinque livelli non esistono in nessuna colonna:
--   - CATEGORIA: le date per categoria del wizard (p_category_dates) sono
--     passate alla RPC e poi buttate. E il limite dichiarato in
--     013_add_unit_atomic.sql:22-27, ed e la ragione per cui un'unita
--     aggiunta dopo la creazione divergeva dalle sorelle.
--   - VOCE: l'override manuale della sezione avanzata della modale.
-- Senza persistenza la cascata vale solo al momento della scrittura, cioe
-- resta esattamente il bug di partenza: una regola non riesaminabile.
--
-- NIENTE VALORI DERIVATI SALVATI (vincolo Filippo del 24/10):
-- due_basis_override contiene SOLO l'override manuale a livello voce, mai la
-- base risolta. La base effettiva la calcola sempre e solo resolveDueBasis
-- (src/lib/maintenance-due.ts, commit 7), unica fonte di verita, e la stessa
-- cascata viene riprodotta dalle RPC (044). Salvare la base risolta
-- creerebbe un secondo posto da tenere sincronizzato a ogni cambio di data
-- di unita o di categoria: la classe di bug che questa migrazione chiude.
--
-- LA CASCATA GOVERNA SOLO LA PRIMA SCADENZA. Dal primo completamento in poi
-- la data la riscrive czero_recalc_due da completed_at (003_m2.sql:22-27) e
-- il fascicolo prende il posto del modello: per questo il ricalcolo salta
-- ogni item con almeno un completamento (decisione Filippo del 24/10) e
-- completions non viene mai toccata.
--
-- QUESTA MIGRAZIONE NON CAMBIA NIENTE DI OSSERVABILE: residence_category_dates
-- nasce VUOTA (le date per categoria del passato non sono mai state scritte da
-- nessuna parte, quindi non c'e niente da backfillare) e due_basis_override
-- nasce NULL su ogni riga. Con tutti e due i livelli assenti la cascata cade
-- sul livello unita, che la 041 ha appena allineato alla residenza: stesse
-- scadenze di oggi, riga per riga. La verifica V8 lo prova.
--
-- VOCABOLARIO DELLE CATEGORIE: TEXT senza CHECK, come feature_key/doc_type
-- (024/026/030). Il set ammesso vive in una costante TS (WIZARD_CATEGORIES in
-- admin/residences/new/page.tsx:16-29), non in un CHECK Postgres: aggiungere
-- una categoria non deve richiedere una migrazione. Il legame con
-- maintenance_templates.category e per VALORE, non una FK — non esiste una
-- tabella delle categorie. Conseguenza accettata: una categoria scritta male
-- non fa errore, semplicemente non trova mai voci. La verifica V9 la stana.
--
-- NESSUN INDICE RIDONDANTE: la UNIQUE (residence_id, category) indicizza gia
-- i lookup per sola residenza con la leading column, e questa tabella non ha
-- un secondo pattern di accesso. A differenza di 027/030 non aggiungo un
-- indice esplicito su residence_id: sarebbe un costo in scrittura senza un
-- lettore.
-- ============================================================

-- ------------------------------------------------------------
-- 1. residence_category_dates — livello CATEGORIA della cascata
--    Riga presente = quella categoria, in quella residenza, parte da questa
--    data. Riga assente = nessun livello categoria, la cascata scende.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS residence_category_dates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  residence_id  UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,  -- vocabolario in costante TS, non CHECK
  -- NOT NULL per costruzione: l'assenza di livello si esprime con l'assenza
  -- della riga, non con una data nulla. Due modi di dire "nessuna data"
  -- sarebbero due stati da distinguere in ogni lettura.
  delivery_date DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT residence_category_dates_uniq UNIQUE (residence_id, category)
);

COMMENT ON TABLE residence_category_dates IS
  'Livello CATEGORIA della cascata delle date di consegna (voce > categoria > unita > residenza > NULL). Riga assente = nessun livello categoria. Risolta solo da resolveDueBasis (src/lib/maintenance-due.ts) e dalle RPC di creazione: nessuna superficie la legge da sola.';

-- updated_at via la funzione condivisa gia esistente (001_schema.sql:294),
-- la stessa di profiles e maintenance_items: nessuna funzione nuova.
DROP TRIGGER IF EXISTS residence_category_dates_updated_at ON residence_category_dates;
CREATE TRIGGER residence_category_dates_updated_at
  BEFORE UPDATE ON residence_category_dates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 2. maintenance_items.due_basis_override — livello VOCE della cascata
-- ------------------------------------------------------------
ALTER TABLE maintenance_items
  ADD COLUMN IF NOT EXISTS due_basis_override DATE;

COMMENT ON COLUMN maintenance_items.due_basis_override IS
  'Override MANUALE della data base di questa singola voce (sezione avanzata della modale Registra consegna). Contiene solo l''override, MAI la base risolta: la base effettiva la calcola resolveDueBasis risalendo la cascata voce > categoria > unita > residenza > NULL. NULL = nessun override, la cascata scende.';

-- ============================================================
-- 3. RLS — coerente con units: lettura a chi ha accesso alla residenza
--    (quindi anche l'admin assegnato), scrittura al solo super_admin
--    proprietario (decisione Filippo del 24/10).
-- ============================================================
ALTER TABLE residence_category_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "category_dates: lettura se si ha accesso"  ON residence_category_dates;
DROP POLICY IF EXISTS "category_dates: super_admin inserisce"     ON residence_category_dates;
DROP POLICY IF EXISTS "category_dates: super_admin aggiorna"      ON residence_category_dates;
DROP POLICY IF EXISTS "category_dates: super_admin cancella"      ON residence_category_dates;

-- Lettura: stesso perimetro di "residences: lettura se si ha accesso"
-- (002_rls.sql:154-156). L'admin assegnato legge, non scrive.
CREATE POLICY "category_dates: lettura se si ha accesso"
  ON residence_category_dates FOR SELECT
  USING (public.czero_can_access_residence(residence_id));

-- Scrittura: copia esatta della forma di "units: super_admin inserisce"
-- (002_rls.sql:158-166) e "units: super_admin aggiorna" (:168-176).
CREATE POLICY "category_dates: super_admin inserisce"
  ON residence_category_dates FOR INSERT
  WITH CHECK (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM residences
      WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
    )
  );

CREATE POLICY "category_dates: super_admin aggiorna"
  ON residence_category_dates FOR UPDATE
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM residences
      WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
    )
  );

-- DELETE: differenza VOLUTA rispetto a units, che non ha policy DELETE.
-- Togliere il livello categoria si esprime togliendo la riga (vedi NOT NULL
-- su delivery_date). Un'unita non si cancella perche e referenziata da item e
-- da completions; una data di categoria non e referenziata da niente e non e
-- prova di nulla: non e fascicolo, e composizione del piano. La cancellazione
-- resta tracciata in activity_events (vecchio -> NULL).
CREATE POLICY "category_dates: super_admin cancella"
  ON residence_category_dates FOR DELETE
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM residences
      WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
    )
  );

-- ============================================================
-- 4. GRANTS — difesa in profondita (lezione 018). Qui, a differenza della
--    030, authenticated DEVE poter scrivere: le quattro policy sopra sono il
--    filtro. Si revoca solo cio che la RLS non puo filtrare.
-- ============================================================
-- TRUNCATE/TRIGGER/REFERENCES non passano dalla RLS: col GRANT ALL di default
-- di Supabase authenticated li avrebbe, e TRUNCATE avrebbe svuotato l'intera
-- tabella scavalcando le policy (stessa classe della 018).
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.residence_category_dates FROM authenticated;
REVOKE ALL                           ON public.residence_category_dates FROM anon;

-- ============================================================
-- 5. Guard per colonne della 021, esteso a due_basis_override.
--    MOTIVO: la decisione del 24/10 riserva al super_admin la scrittura
--    delle date di consegna. units.delivery_date e gia coperta (l'unica
--    policy FOR UPDATE su units e super_admin, 002_rls.sql:168-176) e
--    residence_category_dates lo e dalle policy qui sopra, ma su
--    maintenance_items il ruolo admin ha una allowlist ampia che include
--    next_due_date (vedi header della 021): senza questo ramo l'admin
--    potrebbe scrivere la base della cascata via RLS diretta.
--    Funzione riscritta per intero con CREATE OR REPLACE (idempotente): il
--    corpo e quello della 021 piu il solo ramo nuovo.
-- ============================================================
CREATE OR REPLACE FUNCTION czero_maintenance_items_role_column_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role user_role;
BEGIN
  v_role := czero_user_role();

  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.residence_id IS DISTINCT FROM OLD.residence_id
     OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'colonna non modificabile via RLS authenticated';
  END IF;

  IF v_role = 'admin' AND NEW.activation_status IS DISTINCT FROM OLD.activation_status THEN
    RAISE EXCEPTION 'colonna non modificabile dal ruolo admin: activation_status';
  END IF;

  -- Ramo nuovo (042): la base della cascata e dato del super_admin.
  IF v_role = 'admin' AND NEW.due_basis_override IS DISTINCT FROM OLD.due_basis_override THEN
    RAISE EXCEPTION 'colonna non modificabile dal ruolo admin: due_basis_override';
  END IF;

  RETURN NEW;
END;
$$;

-- Il trigger della 021 resta quello: punta alla funzione per nome, quindi non
-- va ricreato. Il DROP/CREATE sotto e solo per rendere lo statement
-- rieseguibile su un DB dove la 021 non fosse stata applicata.
DROP TRIGGER IF EXISTS maintenance_items_role_column_guard ON public.maintenance_items;
CREATE TRIGGER maintenance_items_role_column_guard
  BEFORE UPDATE ON public.maintenance_items
  FOR EACH ROW EXECUTE FUNCTION czero_maintenance_items_role_column_guard();

-- PostgREST scarta silenziosamente tabelle/colonne non nella schema-cache:
-- ricaricala PRIMA che giri codice che legge queste strutture.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICA PRE-APPLY (eseguire PRIMA degli statement sopra)
-- ============================================================
-- V0. Ne la tabella ne la colonna esistono ancora. Atteso: 0 righe entrambe.
-- SELECT relname FROM pg_class WHERE relname = 'residence_category_dates';
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'maintenance_items'
--    AND column_name = 'due_basis_override';
-- ESITO: 0 righe entrambe.

-- V0b. GUARDIA SULLA SEZIONE 5 — il corpo VIVO del guard deve coincidere con
--      quello della 021, altrimenti la riscrittura CREATE OR REPLACE della
--      sezione 5 cancellerebbe rami aggiunti dopo e mai migrati.
--      Confrontare l'output con supabase/migrations/021_maintenance_items
--      _role_column_guard.sql:31-58: stessi rami, nessuno in piu.
--      Atteso: v_role IS NULL -> RETURN NEW; il ramo delle 5 colonne di
--      identita; il ramo activation_status per il solo ruolo admin. NIENTE
--      ALTRO. Se diverge: NON lanciare la sezione 5, riportare l'output.
-- SELECT pg_get_functiondef('public.czero_maintenance_items_role_column_guard()'::regprocedure);
-- ESITO: funzione viva IDENTICA al corpo della 021 — i tre rami attesi e
--        nient'altro, nessun ramo due_basis_override preesistente. Quindi
--        la sezione 5 e corretta cosi com'e: via libera all'apply.

-- V1. La 041 e applicata (prerequisito). Atteso: 1 riga | date | YES
-- SELECT data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'units'
--    AND column_name = 'delivery_date';
-- ESITO: date | YES (stessa query della V2 di 041, applicata subito prima).

-- V2. Baseline delle scadenze, da riconfrontare identica dopo l'apply (V8).
--     ESITO: 1176 voci | 0 senza data | 2023-03-31 | 2031-12-13 (stessa
--     query della V1 di 041, stessa sessione di apply).
-- SELECT count(*) AS voci,
--        count(*) FILTER (WHERE next_due_date IS NULL) AS senza_data,
--        min(next_due_date) AS prima, max(next_due_date) AS ultima
--   FROM maintenance_items;

-- ============================================================
-- VERIFICA POST-APPLY (footer da compilare con l'output REALE: nessun esito
-- inventato — Claude non applica DDL, vedi CLAUDE.md)
-- ============================================================
-- V3. Tabella presente con RLS attiva. Atteso: residence_category_dates | t
-- SELECT relname, relrowsecurity FROM pg_class
--  WHERE relname = 'residence_category_dates';
-- ESITO: residence_category_dates | true

-- V4. Colonne, tipi, nullabilita. Atteso: 6 righe, delivery_date NOT NULL.
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'residence_category_dates'
--  ORDER BY ordinal_position;
-- ESITO: 6 colonne, nell'ordine
--        id            uuid        NO   gen_random_uuid()
--        residence_id  uuid        NO
--        category      text        NO
--        delivery_date date        NO
--        created_at    timestamptz NO   now()
--        updated_at    timestamptz NO   now()

-- V5. UNIQUE presente.
-- Atteso: residence_category_dates_uniq | u | UNIQUE (residence_id, category)
-- SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.residence_category_dates'::regclass AND contype = 'u';
-- ESITO: residence_category_dates_uniq | u | UNIQUE (residence_id, category)

-- V6. Le quattro policy, e nessun'altra.
-- Atteso: 4 righe (SELECT/INSERT/UPDATE/DELETE)
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'residence_category_dates'
--  ORDER BY cmd;
-- ESITO: 4 policy e nessun'altra —
--        category_dates: super_admin cancella   | DELETE
--        category_dates: super_admin inserisce  | INSERT
--        category_dates: lettura se si ha accesso | SELECT
--        category_dates: super_admin aggiorna   | UPDATE

-- V7. Grants: authenticated ha SELECT/INSERT/UPDATE/DELETE e NON TRUNCATE o
--     REFERENCES; anon non ha niente.
--     Atteso: 4 righe per authenticated, 0 per anon.
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'public' AND table_name = 'residence_category_dates'
--    AND grantee IN ('authenticated', 'anon')
--  ORDER BY grantee, privilege_type;
-- ESITO: authenticated -> DELETE, INSERT, SELECT, UPDATE (nessun TRUNCATE,
--        nessun REFERENCES, nessun TRIGGER). anon -> nessuna riga.

-- V8. NIENTE E CAMBIATO: stesso risultato di V2, riga per riga. E la tabella
--     nasce vuota, la colonna tutta NULL. Atteso: 0 e 0.
-- SELECT count(*) AS righe_categoria FROM residence_category_dates;
-- SELECT count(*) AS override_valorizzati FROM maintenance_items
--  WHERE due_basis_override IS NOT NULL;
-- SELECT count(*) AS voci,
--        count(*) FILTER (WHERE next_due_date IS NULL) AS senza_data,
--        min(next_due_date) AS prima, max(next_due_date) AS ultima
--   FROM maintenance_items;
-- ESITO: 0 righe in residence_category_dates | 0 override valorizzati |
--        1176 voci, 0 senza data, 2023-03-31, 2031-12-13 — identica alla V2.
--
-- RICONTROLLO INDIPENDENTE (24/10, service role, conteggi esatti):
--        1176 voci totali, di cui 965 di unita e 211 di parti comuni
--        0 senza next_due_date · 0 con due_basis_override
--        89 unita, 0 senza delivery_date · 21 residenze, 0 senza delivery_date
--        0 righe in residence_category_dates
-- TRAPPOLA DA NON RIPETERE: contare queste righe con una select via PostgREST
-- da 1000, non 1176: e il limite di righe per richiesta, non un dato. I
-- conteggi sopra usano count exact in head, non la lunghezza di un array.

-- V9. Categorie orfane (scritte male: non corrispondono a nessuna voce di
--     catalogo). Atteso: 0 ora, ed e la query da rilanciare dopo ogni uso
--     della modale, perche il vocabolario non ha CHECK.
-- SELECT d.residence_id, d.category FROM residence_category_dates d
--  WHERE NOT EXISTS (
--    SELECT 1 FROM maintenance_templates t WHERE t.category = d.category
--  );
-- ESITO: nessuna riga (la tabella e vuota, quindi non puo averne di orfane).
--        Le 12 categorie reali a catalogo al 24/10, da usare nei test invece
--        di un valore inventato: Accessi, Antincendio, Ascensore, Coperture,
--        Elettrico, Finiture, Fotovoltaico, Idrico, Sicurezza, Spurghi,
--        Termico, Ventilazione. Sono capitalizzate: 'serramenti' o
--        'finiture' minuscolo comparirebbero qui come orfane.

-- ============================================================
-- TEST RLS — eseguiti il 26/10/2026 nel SQL Editor, tutti con l'esito
-- atteso. UUID reali del DB demo, riverificati il 26/10 da una SELECT
-- preliminare (11/11 true).
--
-- FORMA: ogni test e UN SOLO blocco DO, non BEGIN ... ROLLBACK, ed e
-- COMMENTATO: rilanciare questo file come migrazione non deve eseguirli.
-- La prima stesura (24/10) li aveva come SQL vivo, con due difetti:
--   - il SQL Editor mostra solo il risultato dell'ULTIMA istruzione
--     (032_grants_hardening_anon.sql:76-77): un blocco che chiude con
--     ROLLBACK mostra "No rows returned" qualunque sia l'esito, quindi
--     NEG3, NEG4 e tutti i POSITIVI non erano leggibili;
--   - il 14/09 l'editor non ha tenuto una transazione tra esecuzioni
--     separate: un DO e un solo statement, una sola esecuzione per
--     costruzione.
-- Ogni ramo del DO termina con RAISE EXCEPTION: rollback totale sempre,
-- anche se il test fallisce, quindi nessun test lascia righe nel DB. Il
-- banner rosso e voluto: il verdetto e il testo dopo ESITO (OK / FALLITO /
-- INATTESO). Il ruolo si cambia con set_config(..., true), locale alla
-- transazione del DO.
--
-- ATTORI
--   super_admin  99b90ec5-6a80-4ec3-8884-377163c5510b  pippoloro02@gmail.com
--                builder Furlan 9923adbe-cfb4-47d3-b939-747bb30bcfe2
--   admin        7a210c85-7816-4d5f-b802-176505947469  filippoloro02@gmail.com
--                assegnato a Portello, Bassanello, Santa Giustina
--
-- RESIDENZE
--   Portello            adf97f32-859a-493e-b145-915979f1ae09  (admin assegnato)
--   Arcella (Furlan)    37257b8c-5195-4714-9d14-5973c2032c9c  (admin NON assegnato)
--   __TEST_ACCENSIONE__ 9c719e2d-1a15-44e1-b11f-e29c067c5a42  (altro builder)
--
-- VOCI
--   Portello, unita A1  699aa01c-e21d-4482-a8e4-fe35943874e6
--                       (Imbiancatura interni, categoria Finiture,
--                        unita A1 = 4818141d-242c-4351-8dcd-005337afeb2b)
--   Portello, comuni    ea6870dc-0aff-415f-8433-a96a9e21fcb3
--                       (Pulizia grondaie, categoria Coperture)
--   Arcella, comuni     809123e6-ffe9-4f52-bd95-c63b9debca1f
--
-- La categoria usata nei test e 'Finiture', che esiste a catalogo: un valore
-- inventato comparirebbe nella V9 come categoria orfana.
-- ============================================================

-- ------------------------------------------------------------
-- BLOCCO 0 — VERIFICA PRELIMINARE DEGLI UUID, da lanciare PRIMA dei test:
-- ogni fixture sopra esiste e ha le proprieta che i test presuppongono
-- (perimetri, ruoli, assegnazione admin, categoria a catalogo, nessuna
-- data Finiture gia presente che farebbe scattare la UNIQUE). SELECT
-- singola, sola lettura. Serve anche ai test di 043, che usano Portello,
-- A1 e il super_admin.
-- ATTESO: 11 righe, tutte ok = true
-- ------------------------------------------------------------
-- SELECT cosa, ok FROM (VALUES
--  ('01 Portello builder Furlan', EXISTS (SELECT 1 FROM public.residences WHERE id = 'adf97f32-859a-493e-b145-915979f1ae09' AND builder_id = '9923adbe-cfb4-47d3-b939-747bb30bcfe2')),
--  ('02 Arcella builder Furlan', EXISTS (SELECT 1 FROM public.residences WHERE id = '37257b8c-5195-4714-9d14-5973c2032c9c' AND builder_id = '9923adbe-cfb4-47d3-b939-747bb30bcfe2')),
--  ('03 TEST_ACCENSIONE altro builder', EXISTS (SELECT 1 FROM public.residences WHERE id = '9c719e2d-1a15-44e1-b11f-e29c067c5a42' AND builder_id <> '9923adbe-cfb4-47d3-b939-747bb30bcfe2')),
--  ('04 unita A1 in Portello', EXISTS (SELECT 1 FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b' AND residence_id = 'adf97f32-859a-493e-b145-915979f1ae09')),
--  ('05 super_admin di Furlan', EXISTS (SELECT 1 FROM public.profiles WHERE id = '99b90ec5-6a80-4ec3-8884-377163c5510b' AND role = 'super_admin' AND builder_id = '9923adbe-cfb4-47d3-b939-747bb30bcfe2')),
--  ('06 admin', EXISTS (SELECT 1 FROM public.profiles WHERE id = '7a210c85-7816-4d5f-b802-176505947469' AND role = 'admin')),
--  ('07 admin assegnato a Portello', EXISTS (SELECT 1 FROM public.admin_assignments WHERE profile_id = '7a210c85-7816-4d5f-b802-176505947469' AND residence_id = 'adf97f32-859a-493e-b145-915979f1ae09')),
--  ('08 admin NON assegnato ad Arcella', NOT EXISTS (SELECT 1 FROM public.admin_assignments WHERE profile_id = '7a210c85-7816-4d5f-b802-176505947469' AND residence_id = '37257b8c-5195-4714-9d14-5973c2032c9c')),
--  ('09 voce 699aa01c di A1 in Portello', EXISTS (SELECT 1 FROM public.maintenance_items WHERE id = '699aa01c-e21d-4482-a8e4-fe35943874e6' AND unit_id = '4818141d-242c-4351-8dcd-005337afeb2b' AND residence_id = 'adf97f32-859a-493e-b145-915979f1ae09')),
--  ('10 Finiture a catalogo', EXISTS (SELECT 1 FROM public.maintenance_templates WHERE category = 'Finiture')),
--  ('11 nessuna data Finiture preesistente', NOT EXISTS (SELECT 1 FROM public.residence_category_dates WHERE category = 'Finiture' AND residence_id IN ('adf97f32-859a-493e-b145-915979f1ae09','37257b8c-5195-4714-9d14-5973c2032c9c','9c719e2d-1a15-44e1-b11f-e29c067c5a42')))
-- ) AS t(cosa, ok) ORDER BY cosa;
-- ESITO (26/10): 11/11 true.

-- ------------------------------------------------------------
-- NEGATIVO 1 — l'admin NON scrive la base della cascata, nemmeno su una
-- voce della residenza che amministra. Senza il ramo nuovo della sezione 5
-- la allowlist della 021 glielo permetterebbe. Se l'admin non vedesse la
-- voce (0 righe) il guard non sarebbe messo alla prova: esito INATTESO.
-- ATTESO: ESITO 042 NEG1: OK, guard -> colonna non modificabile dal ruolo
--         admin: due_basis_override
-- ------------------------------------------------------------
-- DO $$
-- DECLARE n int;
-- BEGIN
--   PERFORM set_config('request.jwt.claims', '{"sub":"7a210c85-7816-4d5f-b802-176505947469","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   BEGIN
--     UPDATE public.maintenance_items SET due_basis_override = '2026-01-01'
--      WHERE id = '699aa01c-e21d-4482-a8e4-fe35943874e6';
--     GET DIAGNOSTICS n = ROW_COUNT;
--   EXCEPTION WHEN raise_exception THEN
--     IF SQLERRM = 'colonna non modificabile dal ruolo admin: due_basis_override' THEN
--       RAISE EXCEPTION 'ESITO 042 NEG1: OK, guard -> %', SQLERRM;
--     END IF;
--     RAISE EXCEPTION 'ESITO 042 NEG1: INATTESO -> %', SQLERRM;
--   END;
--   IF n = 0 THEN
--     RAISE EXCEPTION 'ESITO 042 NEG1: INATTESO, 0 righe visibili all admin, guard non messo alla prova';
--   END IF;
--   RAISE EXCEPTION 'ESITO 042 NEG1: FALLITO, admin ha scritto due_basis_override su % righe (annullato)', n;
-- END $$;
-- ESITO (26/10): OK, bloccato dal guard.

-- ------------------------------------------------------------
-- NEGATIVO 2 — l'admin NON inserisce una data di categoria: nessuna policy
-- INSERT per il suo ruolo, nemmeno sulla residenza che amministra.
-- ATTESO: ESITO 042 NEG2: OK, RLS -> new row violates row-level security policy ...
-- ------------------------------------------------------------
-- DO $$
-- BEGIN
--   PERFORM set_config('request.jwt.claims', '{"sub":"7a210c85-7816-4d5f-b802-176505947469","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   BEGIN
--     INSERT INTO public.residence_category_dates (residence_id, category, delivery_date)
--     VALUES ('adf97f32-859a-493e-b145-915979f1ae09', 'Finiture', '2026-01-01');
--   EXCEPTION WHEN insufficient_privilege THEN
--     IF SQLERRM LIKE 'new row violates row-level security policy%' THEN
--       RAISE EXCEPTION 'ESITO 042 NEG2: OK, RLS -> %', SQLERRM;
--     END IF;
--     RAISE EXCEPTION 'ESITO 042 NEG2: INATTESO -> %', SQLERRM;
--   END;
--   RAISE EXCEPTION 'ESITO 042 NEG2: FALLITO, admin ha inserito (annullato)';
-- END $$;
-- ESITO (26/10): OK, new row violates row-level security policy.

-- ------------------------------------------------------------
-- NEGATIVO 3 — l'admin NON aggiorna una data di categoria che esiste gia.
-- La riga viene creata come postgres nello stesso blocco, perche una UPDATE
-- su zero righe non proverebbe niente: senza la riga, "0 righe aggiornate"
-- sarebbe l'esito sia con la policy sia senza.
-- ATTESO: ESITO 042 NEG3: OK, la riga esiste ma admin ne aggiorna 0
-- ------------------------------------------------------------
-- DO $$
-- DECLARE n int;
-- BEGIN
--   INSERT INTO public.residence_category_dates (residence_id, category, delivery_date)
--   VALUES ('adf97f32-859a-493e-b145-915979f1ae09', 'Finiture', '2026-01-01');
--   PERFORM set_config('request.jwt.claims', '{"sub":"7a210c85-7816-4d5f-b802-176505947469","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   UPDATE public.residence_category_dates SET delivery_date = '2026-02-01'
--    WHERE residence_id = 'adf97f32-859a-493e-b145-915979f1ae09' AND category = 'Finiture';
--   GET DIAGNOSTICS n = ROW_COUNT;
--   IF n = 0 THEN
--     RAISE EXCEPTION 'ESITO 042 NEG3: OK, la riga esiste ma admin ne aggiorna 0';
--   END IF;
--   RAISE EXCEPTION 'ESITO 042 NEG3: FALLITO, admin ha aggiornato % righe (annullato)', n;
-- END $$;
-- ESITO (26/10): OK, la riga esiste ma admin ne aggiorna 0.

-- ------------------------------------------------------------
-- NEGATIVO 4 — l'admin NON legge le date di categoria di una residenza che
-- non amministra (Arcella). Riga creata come postgres, stesso motivo del
-- test 3: senza la riga, "0 righe" non distinguerebbe la policy dal vuoto.
-- ATTESO: ESITO 042 NEG4: OK, admin vede 0 righe su Arcella
-- ------------------------------------------------------------
-- DO $$
-- DECLARE n int;
-- BEGIN
--   INSERT INTO public.residence_category_dates (residence_id, category, delivery_date)
--   VALUES ('37257b8c-5195-4714-9d14-5973c2032c9c', 'Finiture', '2026-01-01');
--   PERFORM set_config('request.jwt.claims', '{"sub":"7a210c85-7816-4d5f-b802-176505947469","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   SELECT count(*) INTO n FROM public.residence_category_dates
--    WHERE residence_id = '37257b8c-5195-4714-9d14-5973c2032c9c';
--   IF n = 0 THEN
--     RAISE EXCEPTION 'ESITO 042 NEG4: OK, admin vede 0 righe su Arcella';
--   END IF;
--   RAISE EXCEPTION 'ESITO 042 NEG4: FALLITO, admin vede % righe su Arcella', n;
-- END $$;
-- ESITO (26/10): OK, admin vede 0 righe di Arcella.

-- ------------------------------------------------------------
-- NEGATIVO 5 — il super_admin NON scrive fuori dal proprio builder: la
-- clausola EXISTS della policy lega residence_id a czero_user_builder_id().
-- __TEST_ACCENSIONE__ sta sul builder "Archivio pre-demo".
-- ATTESO: ESITO 042 NEG5: OK, RLS -> new row violates row-level security policy ...
-- ------------------------------------------------------------
-- DO $$
-- BEGIN
--   PERFORM set_config('request.jwt.claims', '{"sub":"99b90ec5-6a80-4ec3-8884-377163c5510b","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   BEGIN
--     INSERT INTO public.residence_category_dates (residence_id, category, delivery_date)
--     VALUES ('9c719e2d-1a15-44e1-b11f-e29c067c5a42', 'Finiture', '2026-01-01');
--   EXCEPTION WHEN insufficient_privilege THEN
--     IF SQLERRM LIKE 'new row violates row-level security policy%' THEN
--       RAISE EXCEPTION 'ESITO 042 NEG5: OK, RLS -> %', SQLERRM;
--     END IF;
--     RAISE EXCEPTION 'ESITO 042 NEG5: INATTESO -> %', SQLERRM;
--   END;
--   RAISE EXCEPTION 'ESITO 042 NEG5: FALLITO, super_admin ha scritto su altro builder (annullato)';
-- END $$;
-- ESITO (26/10): OK, new row violates row-level security policy.

-- ------------------------------------------------------------
-- NEGATIVO 6 — la UNIQUE regge: due righe sulla stessa coppia (residenza,
-- categoria). Gira come postgres: il vincolo non passa dalla RLS.
-- ATTESO: ESITO 042 NEG6: OK, respinto da residence_category_dates_uniq
-- ------------------------------------------------------------
-- DO $$
-- DECLARE v_con text;
-- BEGIN
--   BEGIN
--     INSERT INTO public.residence_category_dates (residence_id, category, delivery_date)
--     VALUES ('adf97f32-859a-493e-b145-915979f1ae09', 'Finiture', '2026-01-01'),
--            ('adf97f32-859a-493e-b145-915979f1ae09', 'Finiture', '2026-03-01');
--   EXCEPTION WHEN unique_violation THEN
--     GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME;
--     IF v_con = 'residence_category_dates_uniq' THEN
--       RAISE EXCEPTION 'ESITO 042 NEG6: OK, respinto da %', v_con;
--     END IF;
--     RAISE EXCEPTION 'ESITO 042 NEG6: INATTESO, respinto da %', v_con;
--   END;
--   RAISE EXCEPTION 'ESITO 042 NEG6: FALLITO, due righe sulla stessa coppia (annullato)';
-- END $$;
-- ESITO (26/10): OK, respinto da residence_category_dates_uniq.

-- ------------------------------------------------------------
-- POSITIVO 1 — l'admin LEGGE le date di categoria della residenza che
-- amministra. E il rovescio del test 4: residenza dentro il suo perimetro,
-- la riga deve comparire.
-- ATTESO: ESITO 042 POS1: OK, admin vede 1 riga, data 2026-01-01
-- ------------------------------------------------------------
-- DO $$
-- DECLARE n int; v_date date;
-- BEGIN
--   INSERT INTO public.residence_category_dates (residence_id, category, delivery_date)
--   VALUES ('adf97f32-859a-493e-b145-915979f1ae09', 'Finiture', '2026-01-01');
--   PERFORM set_config('request.jwt.claims', '{"sub":"7a210c85-7816-4d5f-b802-176505947469","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   SELECT count(*), max(delivery_date) INTO n, v_date FROM public.residence_category_dates
--    WHERE residence_id = 'adf97f32-859a-493e-b145-915979f1ae09';
--   IF n = 1 AND v_date = '2026-01-01' THEN
--     RAISE EXCEPTION 'ESITO 042 POS1: OK, admin vede 1 riga, data %', v_date;
--   END IF;
--   RAISE EXCEPTION 'ESITO 042 POS1: FALLITO, admin vede % righe, data %', n, v_date;
-- END $$;
-- ESITO (26/10): OK, admin vede 1 riga, data 2026-01-01.

-- ------------------------------------------------------------
-- POSITIVO 2 — il super_admin inserisce, aggiorna e cancella una data di
-- categoria sulla propria residenza, e il trigger updated_at scatta.
-- CORRETTO il 26/10: la prima stesura confrontava updated_at > created_at,
-- che e SEMPRE falso dentro una sola transazione — NOW() e l'ora di inizio
-- della transazione (set_updated_at, 001_schema.sql:299), quindi default e
-- trigger scrivono lo stesso istante. Ora created_at/updated_at sono
-- inseriti al 2000-01-01: se il trigger scatta, updated_at diventa NOW().
-- ATTESO: ESITO 042 POS2: OK, update 2026-02-01, updated_at <ora> > 2000-01-01, delete 1
-- ------------------------------------------------------------
-- DO $$
-- DECLARE v_id uuid; v_date date; v_upd timestamptz; n int;
-- BEGIN
--   PERFORM set_config('request.jwt.claims', '{"sub":"99b90ec5-6a80-4ec3-8884-377163c5510b","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   INSERT INTO public.residence_category_dates (residence_id, category, delivery_date, created_at, updated_at)
--   VALUES ('adf97f32-859a-493e-b145-915979f1ae09', 'Finiture', '2026-01-01', '2000-01-01', '2000-01-01')
--   RETURNING id INTO v_id;
--   UPDATE public.residence_category_dates SET delivery_date = '2026-02-01'
--    WHERE id = v_id
--   RETURNING delivery_date, updated_at INTO v_date, v_upd;
--   DELETE FROM public.residence_category_dates WHERE id = v_id;
--   GET DIAGNOSTICS n = ROW_COUNT;
--   IF v_id IS NOT NULL AND v_date = '2026-02-01' AND v_upd > '2000-01-01' AND n = 1 THEN
--     RAISE EXCEPTION 'ESITO 042 POS2: OK, update %, updated_at % > 2000-01-01, delete %', v_date, v_upd, n;
--   END IF;
--   RAISE EXCEPTION 'ESITO 042 POS2: FALLITO, id %, update %, updated_at %, delete %', v_id, v_date, v_upd, n;
-- END $$;
-- ESITO (26/10): OK, update 2026-02-01, updated_at 2026-10-26 19:17:08+00,
--        delete 1.

-- ------------------------------------------------------------
-- POSITIVO 3 — il super_admin scrive l'override di voce: il ramo nuovo del
-- guard riguarda il solo ruolo admin, non lui.
-- ATTESO: ESITO 042 POS3: OK, 1 riga, override 2026-01-01
-- ------------------------------------------------------------
-- DO $$
-- DECLARE n int; v date;
-- BEGIN
--   PERFORM set_config('request.jwt.claims', '{"sub":"99b90ec5-6a80-4ec3-8884-377163c5510b","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   UPDATE public.maintenance_items SET due_basis_override = '2026-01-01'
--    WHERE id = '699aa01c-e21d-4482-a8e4-fe35943874e6'
--   RETURNING due_basis_override INTO v;
--   GET DIAGNOSTICS n = ROW_COUNT;
--   IF n = 1 AND v = '2026-01-01' THEN
--     RAISE EXCEPTION 'ESITO 042 POS3: OK, % riga, override %', n, v;
--   END IF;
--   RAISE EXCEPTION 'ESITO 042 POS3: FALLITO, % righe, override %', n, v;
-- END $$;
-- ESITO (26/10): OK, 1 riga, override 2026-01-01.

-- ------------------------------------------------------------
-- POSITIVO 4 — scrittura senza sessione utente (service role e SQL Editor):
-- czero_user_role() e NULL, il guard esce subito con RETURN NEW. E il
-- percorso delle RPC di creazione e del cron.
-- ATTESO: ESITO 042 POS4: OK, ruolo <NULL>, 1 riga, override 2026-01-01
-- ------------------------------------------------------------
-- DO $$
-- DECLARE n int; v date; v_role text;
-- BEGIN
--   v_role := public.czero_user_role()::text;
--   UPDATE public.maintenance_items SET due_basis_override = '2026-01-01'
--    WHERE id = '699aa01c-e21d-4482-a8e4-fe35943874e6'
--   RETURNING due_basis_override INTO v;
--   GET DIAGNOSTICS n = ROW_COUNT;
--   IF v_role IS NULL AND n = 1 AND v = '2026-01-01' THEN
--     RAISE EXCEPTION 'ESITO 042 POS4: OK, ruolo <NULL>, % riga, override %', n, v;
--   END IF;
--   RAISE EXCEPTION 'ESITO 042 POS4: FALLITO, ruolo %, % righe, override %', coalesce(v_role, '<NULL>'), n, v;
-- END $$;
-- ESITO (26/10): OK, ruolo NULL, 1 riga.

-- ------------------------------------------------------------
-- POSITIVO 5 — il guard NON si e allargato per sbaglio: l'admin continua a
-- poter scrivere cio che la 021 gli lasciava, incluso next_due_date, sulla
-- residenza che amministra. Se questo test fallisse, la sezione 5 avrebbe
-- rotto updateMaintenanceItemConfig.
-- ATTESO: ESITO 042 POS5: OK, admin aggiorna 1 riga, next_due_date <data>
-- ------------------------------------------------------------
-- DO $$
-- DECLARE n int; v date;
-- BEGIN
--   PERFORM set_config('request.jwt.claims', '{"sub":"7a210c85-7816-4d5f-b802-176505947469","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   UPDATE public.maintenance_items
--      SET status = status, next_due_date = next_due_date,
--          frequency_months = frequency_months, warranty_info = warranty_info,
--          supplier_id = supplier_id, completion_mode = completion_mode,
--          obligation_type = obligation_type, priority = priority
--    WHERE id = '699aa01c-e21d-4482-a8e4-fe35943874e6'
--   RETURNING next_due_date INTO v;
--   GET DIAGNOSTICS n = ROW_COUNT;
--   IF n = 1 THEN
--     RAISE EXCEPTION 'ESITO 042 POS5: OK, admin aggiorna % riga, next_due_date %', n, v;
--   END IF;
--   RAISE EXCEPTION 'ESITO 042 POS5: FALLITO, admin aggiorna % righe', n;
-- END $$;
-- ESITO (26/10): OK, admin aggiorna 1 riga, next_due_date 2029-06-01.

-- ------------------------------------------------------------
-- CONTROLLO RESIDUI — i test non hanno lasciato righe ne override.
-- ATTESO: 0 | 0
-- ------------------------------------------------------------
-- SELECT (SELECT count(*) FROM residence_category_dates) AS righe_categoria,
--        (SELECT count(*) FROM maintenance_items
--          WHERE due_basis_override IS NOT NULL) AS override_valorizzati;
-- ESITO (26/10): 0 | 0. Nessuna data di categoria e nessun override rimasti
--        dopo gli 11 test: il rollback dei DO e misurato, non solo atteso.
