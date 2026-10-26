-- già applicati: seed demo Padova e archivio pre-demo
-- ============================================================================
-- Seed demo Padova + parcheggio dati pre-demo — PASSO 1 di 3 (scrittura)
-- Da eseguire a mano nel SQL Editor di Supabase (ruolo postgres), SOLO dopo
-- che tutti i risultati di passo0.sql coincidono con gli attesi.
--
--   passo0.sql  query di sola lettura (baseline e guardie)
--   passo1.sql  un unico DO $$ … $$                       ← QUESTO FILE
--   passo2.sql  query di sola lettura (verifica)
--
-- Perché DO e non BEGIN/COMMIT: il 14/09 il SQL Editor non ha tenuto una
-- transazione BEGIN/COMMIT tra esecuzioni (un DELETE passato, un UPDATE perso).
-- Un DO è un solo statement: o passa tutto o non passa niente, senza dipendere
-- da come l'editor gestisce le transazioni. Le guardie dentro il DO fanno
-- RAISE → rollback totale: rilanciarlo dopo un successo non scrive nulla.
--
-- Non tocca: completions, attachments, activity_events, notifications,
-- storage. Nessun DDL.
--
-- Va lanciato PRIMA di creare dal wizard la quarta residenza: la guardia
-- "16 residenze" lo fermerebbe, e comunque la nuova finirebbe parcheggiata.
-- ============================================================================

DO $$
DECLARE
  c_demo_builder  constant uuid := '9923adbe-cfb4-47d3-b939-747bb30bcfe2';  -- Furlan srl
  c_admin_demo    constant uuid := '7a210c85-7816-4d5f-b802-176505947469';  -- filippoloro02
  c_resident_demo constant uuid := '9d3e163b-6f21-42a7-a46a-53008cc5b011';  -- filippolorotest102
  c_admin_park    constant uuid[] := ARRAY[
    '88ba2c16-0caf-4502-b460-98e8545f211f',   -- Mario Bianchi (getUserById in errore)
    'ae7e0d00-8e28-4c9f-a624-8ed0169c06b7'    -- Luca Verdi   (getUserById in errore)
  ]::uuid[];

  -- 19 dotazioni di src/lib/residence-features.ts, tutte dichiarate come fa il
  -- wizard (new/actions.ts:57-59): un "no" dichiarato, mai NULL. Con NULL la
  -- RPC spegnerebbe il filtro e metterebbe nel piano anche ascensore,
  -- antincendio, autoclave… (034:160-161).
  c_features_no constant jsonb := jsonb_build_object(
    'ascensore', false, 'presidi_antincendio', false, 'rete_idranti', false,
    'porte_rei', false, 'illuminazione_emergenza', false,
    'impianto_rivelazione_incendi', false, 'evacuatori_fumo', false,
    'autoclave', false, 'acs_centralizzata', false, 'sollevamento_reflue', false,
    'fossa_biologica', false, 'centrale_termica', false, 'generatore_gas', false,
    'canna_fumaria_collettiva', false, 'cancello_motorizzato', false,
    'lucernari', false, 'antenna_centralizzata', false,
    'impianto_fotovoltaico', false, 'luogo_di_lavoro', false);

  v_archive    uuid;
  v_parked     uuid[];
  v_portello   uuid;
  v_giustina   uuid;
  v_bassanello uuid;
  v_a1         uuid;
  v_n          integer;
BEGIN
  -- Guardie: qualunque sorpresa annulla TUTTO il blocco.
  IF EXISTS (SELECT 1 FROM residences
              WHERE name IN ('Residenza Portello', 'Residenza Santa Giustina', 'Residenza Bassanello')) THEN
    RAISE EXCEPTION 'STOP: residenze demo Padova gia presenti (seed gia eseguito?)';
  END IF;

  IF EXISTS (SELECT 1 FROM builders WHERE name = 'Archivio pre-demo') THEN
    RAISE EXCEPTION 'STOP: builder Archivio pre-demo gia presente (parcheggio gia eseguito?)';
  END IF;

  IF EXISTS (SELECT 1 FROM unit_members
              WHERE profile_id = c_resident_demo AND ended_at IS NULL) THEN
    -- Le pagine PWA leggono la membership con maybeSingle(): una seconda riga
    -- attiva rompe la home del residente.
    RAISE EXCEPTION 'STOP: il residente demo ha gia una membership attiva';
  END IF;

  SELECT count(*) INTO v_n FROM profiles
   WHERE (id = c_admin_demo AND role = 'admin')
      OR (id = c_resident_demo AND role = 'client')
      OR (id = ANY (c_admin_park) AND role = 'admin');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'STOP: profili attesi 4 con ruoli admin/client, trovati %', v_n;
  END IF;

  v_parked := ARRAY(SELECT id FROM residences WHERE builder_id = c_demo_builder);
  IF coalesce(array_length(v_parked, 1), 0) <> 16 THEN
    RAISE EXCEPTION 'STOP: residenze da parcheggiare attese 16, trovate %',
      coalesce(array_length(v_parked, 1), 0);
  END IF;

  -- a) Builder archivio
  INSERT INTO builders (name) VALUES ('Archivio pre-demo')
  RETURNING id INTO v_archive;

  -- b) Parcheggio: le 16 residenze esistenti e i due admin non demo.
  --    PRIMA delle RPC: le residenze nuove non devono finire nell'archivio.
  UPDATE residences SET builder_id = v_archive WHERE id = ANY (v_parked);

  UPDATE profiles SET builder_id = v_archive
   WHERE id = ANY (c_admin_park) AND role = 'admin';

  -- b2) [AGGIUNTA rispetto alla richiesta] Fornitori nati sulle residenze
  --     parcheggiate. La loro RLS guarda la residenza di origine (002:417-425),
  --     quindi spariscono comunque dal builder demo; ma con builder_id demo
  --     continuerebbero a occupare l'indice unico (builder_id, vat_number)
  --     (039:108): una DiCo di Clima Nordest (P.IVA 03118750932) caricata in
  --     demo fallirebbe con "partita IVA già di un altro fornitore".
  UPDATE suppliers SET builder_id = v_archive
   WHERE builder_id = c_demo_builder AND residence_id = ANY (v_parked);

  -- c) Assegnazioni admin sulle residenze parcheggiate (stato corrente,
  --    DELETE ammesso). Oggi: 4 di Mario Bianchi + 2 di filippoloro02.
  DELETE FROM admin_assignments WHERE residence_id = ANY (v_parked);

  -- d) Tre residenze via la stessa RPC del wizard (034, transazione interna).
  --    Consegna 2026-06-01: senza override nessuna voce scade prima del
  --    2026-12-01 (frequenza minima 6 mesi). Le categorie con data
  --    2025-08-01 generano le voci scadute (12 mesi → 2026-08-01, 6 mesi →
  --    2026-02-01).

  -- Portello: Sicurezza → Verifica linee vita (amministratore, obbligo di legge)
  --           + serramenti scaduti SOLO su A1 (variante approvata, sotto)
  v_portello := czero_create_residence_with_units(
    c_demo_builder,
    'Residenza Portello',
    'Via Portello 24, Padova',
    'A4',
    '2026-06-01'::date,
    '[{"label":"A1","floor":1},{"label":"A2","floor":2},
      {"label":"B1","floor":1},{"label":"B2","floor":2}]'::jsonb,
    '{"Sicurezza":"2025-08-01"}'::jsonb,
    c_features_no
  );

  -- Variante Portello: una data per categoria varrebbe per tutte e 4 le unità
  -- (4 serramenti scaduti). Qui scade solo la voce residente di A1, con la
  -- stessa data e lo stesso status che la RPC avrebbe scritto con
  -- Finiture = 2025-08-01 (034:147: due < CURRENT_DATE → 'scaduta').
  -- Il trigger 021 non interviene: dal SQL Editor czero_user_role() è NULL
  -- (021:40-42), e comunque cambiano solo next_due_date e status.
  SELECT id INTO STRICT v_a1 FROM units WHERE residence_id = v_portello AND label = 'A1';

  UPDATE maintenance_items mi
     SET next_due_date = '2026-08-01', status = 'scaduta'
    FROM maintenance_templates mt
   WHERE mt.id = mi.template_id
     AND mi.unit_id = v_a1
     AND mt.title = 'Controllo e lubrificazione serramenti';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'STOP: voce serramenti di Portello A1 attesa 1, trovate %', v_n;
  END IF;

  -- Santa Giustina: Spurghi → Pozzetti di ispezione e condotte (amministratore)
  --                 Accessi → Cancelli e portoni motorizzati (amministratore,
  --                           richiede la dotazione cancello_motorizzato)
  v_giustina := czero_create_residence_with_units(
    c_demo_builder,
    'Residenza Santa Giustina',
    'Via Luca Belludi 18, Padova',
    'A4',
    '2026-06-01'::date,
    '[{"label":"Unità 1","floor":0},{"label":"Unità 2","floor":0},
      {"label":"Unità 3","floor":1},{"label":"Unità 4","floor":1},
      {"label":"Unità 5","floor":2}]'::jsonb,
    '{"Spurghi":"2025-08-01","Accessi":"2025-08-01"}'::jsonb,
    c_features_no || '{"cancello_motorizzato": true}'::jsonb
  );

  -- Bassanello: Antincendio → Controllo periodico estintori (amministratore,
  --                           obbligo di legge, richiede presidi_antincendio)
  --             Fotovoltaico → Manutenzione impianto fotovoltaico (amministratore,
  --                            richiede impianto_fotovoltaico)
  v_bassanello := czero_create_residence_with_units(
    c_demo_builder,
    'Residenza Bassanello',
    'Via Pietro Bembo 88, Padova',
    'A4',
    '2026-06-01'::date,
    '[{"label":"Unità 1","floor":0},{"label":"Unità 2","floor":1},
      {"label":"Unità 3","floor":2}]'::jsonb,
    '{"Antincendio":"2025-08-01","Fotovoltaico":"2025-08-01"}'::jsonb,
    c_features_no || '{"presidi_antincendio": true, "impianto_fotovoltaico": true}'::jsonb
  );

  -- e0) [AGGIUNTA rispetto alla richiesta] builder_id dell'admin demo.
  --     Oggi è NULL: il super_admin lo vede solo tramite la sua membership su
  --     Cavaccio (policy 009, che non guarda il ruolo). Parcheggiata Cavaccio,
  --     sparirebbe dal selettore di AdminBlock (residences/[id]/page.tsx:319-321,
  --     profiles role=admin in sessione) e dal blocco "amministratore corrente"
  --     (embed profiles a :315-318): "Nessun amministratore assegnato" sulle
  --     tre residenze nuove. Con builder_id demo lo copre la policy 002:195.
  --     Effetto collaterale voluto: la sua dashboard prende il branding Furlan
  --     (whitelabel.ts segue profile.builder_id).
  UPDATE profiles SET builder_id = c_demo_builder
   WHERE id = c_admin_demo AND role = 'admin';

  -- e) Admin demo sulle tre residenze nuove
  INSERT INTO admin_assignments (profile_id, residence_id)
  VALUES (c_admin_demo, v_portello),
         (c_admin_demo, v_giustina),
         (c_admin_demo, v_bassanello);

  -- f) Residente demo su Portello A1, come fa l'accettazione dell'invito
  --    (accept-invite.ts:82-85 e :107-112): builder_id del costruttore sul
  --    profilo + membership primaria che parte oggi. v_a1 è già risolto sopra.
  UPDATE profiles SET builder_id = c_demo_builder
   WHERE id = c_resident_demo AND role = 'client';

  INSERT INTO unit_members (unit_id, profile_id, started_at, is_primary)
  VALUES (v_a1, c_resident_demo, CURRENT_DATE, true);

  RAISE NOTICE 'OK archivio=% portello=% giustina=% bassanello=% A1=%',
    v_archive, v_portello, v_giustina, v_bassanello, v_a1;
END
$$;
