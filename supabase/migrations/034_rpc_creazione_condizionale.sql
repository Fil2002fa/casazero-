-- ============================================================
-- CasaZero — 034: RPC di creazione residenza con filtro condizionale.
-- ANTEPRIMA. Applica Filippo nel SQL Editor.
-- ATTENZIONE, LEZIONE 032: NON selezionare porzioni di testo prima di
-- eseguire. Il SQL Editor esegue solo la selezione, se c'e'. Deseleziona
-- (click a vuoto) ed esegui tutto, poi incolla l'output dell'ultima riga.
-- ------------------------------------------------------------
-- CONCERN UNICO: czero_create_residence_with_units smette di istanziare
-- ogni template attivo e istanzia solo quelli la cui condizione e'
-- soddisfatta dalle dotazioni dichiarate per la residenza.
--
-- FUORI SCOPE: wizard UI, DERIVED_MAP, accensione delle 16 voci spente,
-- backfill delle residenze esistenti.
-- ============================================================

-- ------------------------------------------------------------
-- SCELTA DEL PARAMETRO: jsonb {feature_key: boolean}, non text[].
-- Motivo, in una riga: residence_features.present e' un boolean che ammette
-- il false ESPLICITO ("dotazione dichiarata assente", 030 riga 45), e un
-- text[] di sole chiavi presenti collasserebbe "dichiarata assente" e "non
-- chiesta" nella stessa assenza, distruggendo proprio la distinzione che la
-- tabella esiste per registrare e che la pipeline AI di B5 deve riconciliare.
--
-- Il parametro e' in CODA alla firma e ha un DEFAULT: senza, la chiamata
-- esistente in actions.ts (7 parametri nominali) si romperebbe all'istante.
-- Il default e' NULL, non '{}': vedi il blocco sui tre stati qui sotto.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- TRE STATI DEL PARAMETRO — la distinzione che rende la 034 applicabile
-- da sola, senza aspettare il commit wizard.
--
--   p_features IS NULL   -> dotazioni NON DICHIARATE. Filtro disattivato:
--                           ogni template attivo viene istanziato, esattamente
--                           come prima della 034. E' il default, quindi e'
--                           cio' che ottiene il wizard di oggi, che non passa
--                           il parametro.
--   p_features = '{}'    -> dichiarazione ESPLICITA di "nessuna dotazione".
--                           Filtro attivo: nessuna voce condizionata entra.
--   p_features = {...}   -> filtro attivo chiave per chiave.
--
-- REGOLA: un chiamante che non passa p_features NON sta dichiarando che la
-- residenza e' priva di dotazioni. Silenzio e negazione sono cose diverse, e
-- il piano di manutenzione e' il posto sbagliato per confonderle.
--
-- CONSEGUENZA: applicare la 034 da sola non cambia nulla per nessuno. Le 5
-- voci condizionali oggi attive (lucernari, antenna, messa a terra, fossa
-- biologica, fotovoltaico) continuano a nascere in ogni nuova residenza
-- finche' il wizard non inizia a dichiarare le dotazioni. Nessuna finestra
-- di piani silenziosamente incompleti, nessun vincolo di rilascio congiunto.
-- Il filtro si accende quando il chiamante passa esplicitamente p_features.
--
-- Nessuna residenza ESISTENTE e' toccata in nessuno dei tre casi: vedi
-- VERIFICA 1 qui sotto.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- VERIFICA 1 — la RPC agisce SOLO in creazione. Confermato leggendo il
-- corpo della 012 e i suoi chiamanti:
--   • il corpo contiene esclusivamente INSERT (residences, units,
--     maintenance_items). Nessun UPDATE, nessun DELETE, nessun TRUNCATE:
--     non puo' modificare ne' cancellare nulla di preesistente.
--   • unico chiamante: createResidence in
--     src/app/(dashboard)/admin/residences/new/actions.ts:45, cioe' il
--     wizard "nuova residenza". Non e' invocata da alcun path di modifica.
--   • gli INSERT sono tutti vincolati a v_residence_id, la residenza appena
--     creata in questa stessa transazione.
-- -> nessuna residenza esistente viene toccata, nessun maintenance_item
--    gia' creato viene cancellato. Il filtro cambia solo cio' che NASCE.
--
-- VERIFICA 2 — GAP LATENTE su czero_add_unit_with_items (013).
-- Quella RPC istanzia i template con scope='unit' quando si aggiunge
-- un'unita' dopo la creazione, e NON conosce condition_key. Oggi e'
-- innocuo: tutti e 21 i template condizionali hanno scope='condominium'
-- (verificato: SELECT scope, count(*) ... -> condominium | 21, nessuna riga
-- unit). Diventerebbe un buco il giorno in cui nasce un template
-- condizionale scope='unit': l'aggiunta di un'unita' lo istanzierebbe
-- scavalcando il filtro. NON toccata qui (un concern per commit): da
-- allineare nello stesso commit che introducesse il primo condizionale
-- di unita'.
-- ------------------------------------------------------------

-- DROP della vecchia firma a 7 argomenti: senza questo resterebbero due
-- overload e la risoluzione dipenderebbe dai parametri passati — una
-- chiamata senza p_features colpirebbe ancora la versione non filtrata.
DROP FUNCTION IF EXISTS czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb);

CREATE FUNCTION czero_create_residence_with_units(
  p_builder_id     uuid,
  p_name           text,
  p_address        text,
  p_energy_class   text,
  p_delivery_date  date,
  p_units          jsonb,                       -- array di {label text, floor int}
  p_category_dates jsonb DEFAULT '{}'::jsonb,   -- {categoria: 'yyyy-mm-dd'} override wizard
  p_features       jsonb DEFAULT NULL           -- {feature_key: boolean}; NULL = dotazioni non dichiarate
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_residence_id uuid;
BEGIN
  -- 1. Residenza
  INSERT INTO residences (builder_id, name, address, energy_class, delivery_date)
  VALUES (p_builder_id, p_name, p_address, p_energy_class, p_delivery_date)
  RETURNING id INTO v_residence_id;

  -- 2. Dotazioni dichiarate dal wizard. PRIMA degli item: il filtro dei
  --    template legge questa tabella.
  --    source='wizard' e' l'invariante della 030: distingue con certezza cio'
  --    che ha dichiarato il costruttore da cio' che dedurra' l'AI in B5.
  --    present=false viene registrato: "dichiarata assente" e' informazione.
  --
  --    CAST TOLLERANTE sulle stringhe: un JSON che arriva da un form o da un
  --    round-trip TS porta spesso "true" invece di true. Accettando solo il
  --    tipo boolean, quella riga verrebbe scartata in silenzio: la dotazione
  --    non si registra, la voce non entra nel piano, nessun errore da nessuna
  --    parte. Silent data loss. Le stringhe vengono quindi normalizzate.
  --    I tipi rimanenti (number, object, array, null) restano esclusi: sono
  --    input malformato, e vengono ignorati invece di far fallire la creazione.
  --
  --    Con p_features NULL il COALESCE produce zero righe, ed e' corretto:
  --    "non dichiarato" non e' "dichiarato assente", quindi non si scrive nulla.
  INSERT INTO residence_features (residence_id, feature_key, present, source)
  SELECT v_residence_id, f.key,
         CASE jsonb_typeof(f.value)
           WHEN 'boolean' THEN (f.value)::text::boolean
           WHEN 'string'  THEN (f.value #>> '{}') IN ('true','t','1')
         END,
         'wizard'
  FROM jsonb_each(COALESCE(p_features, '{}'::jsonb)) AS f
  WHERE jsonb_typeof(f.value) IN ('boolean','string');

  -- 3. Unità (label e floor arrivano dal chiamante, nessun default hard-coded)
  INSERT INTO units (residence_id, label, floor)
  SELECT v_residence_id, u->>'label', (u->>'floor')::integer
  FROM jsonb_array_elements(p_units) AS u;

  -- 4a. Item condominiali: 1 per template scope='condominium'
  --     base = override categoria dal wizard se non vuoto, altrimenti delivery_date;
  --     scadenza = base + frequency_months; scaduta se nel passato.
  INSERT INTO maintenance_items (template_id, residence_id, unit_id, next_due_date, status)
  SELECT
    mt.id, v_residence_id, NULL, due.d,
    CASE WHEN due.d < CURRENT_DATE THEN 'scaduta' ELSE 'in_attesa' END::maintenance_status
  FROM maintenance_templates mt
  CROSS JOIN LATERAL (
    SELECT (
      COALESCE(NULLIF(btrim(p_category_dates->>mt.category), '')::date, p_delivery_date)
      + (mt.frequency_months || ' months')::interval
    )::date AS d
  ) due
  WHERE mt.is_active = true
    AND mt.scope = 'condominium'
    -- Filtro condizionale GENERICO, guidato dai dati: nessun CASE per
    -- dotazione, nessuna chiave citata nel codice. L'ottava dotazione e'
    -- una riga di catalogo e zero DDL (obiettivo della 030).
    -- p_features NULL -> dotazioni non dichiarate, filtro spento: entra tutto,
    --   comportamento identico a prima della 034 (vedi TRE STATI in testa).
    -- condition_key NULL -> entra sempre (comportamento storico invariato).
    -- condition_key non-NULL -> entra solo con la feature presente.
    AND (
      p_features IS NULL
      OR mt.condition_key IS NULL
      OR EXISTS (
        SELECT 1 FROM residence_features rf
        WHERE rf.residence_id = v_residence_id
          AND rf.feature_key  = mt.condition_key
          AND rf.present
      )
    );

  -- 4b. Item di unità: 1 per template scope='unit' × ogni unità appena creata
  --     Stesso filtro: oggi nessun template condizionale ha scope='unit'
  --     (quindi e' un no-op), ma applicarlo qui evita che il primo
  --     condizionale di unita' nasca gia' scoperto.
  INSERT INTO maintenance_items (template_id, residence_id, unit_id, next_due_date, status)
  SELECT
    mt.id, v_residence_id, un.id, due.d,
    CASE WHEN due.d < CURRENT_DATE THEN 'scaduta' ELSE 'in_attesa' END::maintenance_status
  FROM maintenance_templates mt
  CROSS JOIN units un
  CROSS JOIN LATERAL (
    SELECT (
      COALESCE(NULLIF(btrim(p_category_dates->>mt.category), '')::date, p_delivery_date)
      + (mt.frequency_months || ' months')::interval
    )::date AS d
  ) due
  WHERE mt.is_active = true
    AND mt.scope = 'unit'
    AND un.residence_id = v_residence_id
    AND (
      p_features IS NULL
      OR mt.condition_key IS NULL
      OR EXISTS (
        SELECT 1 FROM residence_features rf
        WHERE rf.residence_id = v_residence_id
          AND rf.feature_key  = mt.condition_key
          AND rf.present
      )
    );

  -- completion_mode/obligation_type restano NULL (eredita dal template);
  -- activation_status prende il default DB 'inclusa'.

  RETURN v_residence_id;
END;
$$;

-- Permessi riscritti sulla NUOVA firma a 8 argomenti: quelli della vecchia
-- sono spariti col DROP. Solo il service role puo' eseguirla.
REVOKE EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb, jsonb) TO service_role;

-- PostgREST: la firma della funzione e' cambiata, la schema-cache va ricaricata
-- o le chiamate RPC falliranno con "function not found".
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- AUTO-VERIFICA IN CODA — SELECT, ultima istruzione: il SQL Editor ne mostra
-- il risultato, quindi l'esito dell'apply e' visibile senza query separate.
-- Attesi: 1 | la firma a 8 argomenti (p_features jsonb in coda) | true |
--         false | false | true | search_path=public
-- Se n_overload e' 2, il DROP non ha agito e resta la vecchia versione NON
-- filtrata: non lasciare il DB in quello stato.
-- secdef e proconfig sono verificati perche' il DROP+CREATE li ricostruisce
-- da zero: se SECURITY DEFINER o search_path non sopravvivessero, la RPC
-- girerebbe coi privilegi del chiamante o risolverebbe i nomi altrove, e il
-- danno si vedrebbe solo a runtime.
-- Se non compare alcun risultato, lo script non e' stato eseguito per intero
-- (vedi l'avviso sulla selezione parziale in testa al file).
-- ------------------------------------------------------------
SELECT
  count(*)                                                           AS n_overload_atteso_1,
  max(pg_get_function_identity_arguments(p.oid))                     AS firma,
  bool_or(has_function_privilege('service_role',  p.oid, 'EXECUTE')) AS service_role_atteso_true,
  bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS authenticated_atteso_false,
  bool_or(has_function_privilege('anon',          p.oid, 'EXECUTE')) AS anon_atteso_false,
  bool_and(p.prosecdef)                                              AS secdef_atteso_true,
  max(array_to_string(p.proconfig, ','))                             AS proconfig_atteso_search_path_public
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'czero_create_residence_with_units';

-- ============================================================
-- SMOKE TEST (in transazione con ROLLBACK: non sporca nulla).
-- Decommentare l'intero blocco ed eseguirlo in un colpo solo.
-- Due residenze nella stessa transazione, una per ciascun ramo:
--   A) p_features passato    -> filtro attivo, tre direzioni + cast stringa;
--   B) p_features OMESSO     -> ramo NULL, retrocompatibilita'.
-- Gli UUID dei tre template usati sono stati verificati sul DB il 2026-08-01
-- (fotovoltaico 7296f859, lucernari b95a07e2, antenna 3fb467a8: tutti
-- is_active=true, scope='condominium').
-- ============================================================
-- BEGIN;
--
-- -- A) filtro attivo
-- SELECT czero_create_residence_with_units(
--   (SELECT id FROM builders LIMIT 1),
--   '__SMOKE_034__', 'Via di prova 1', 'A',
--   '2024-01-15'::date,
--   '[{"label":"Unita 1","floor":1},{"label":"Unita 2","floor":1}]'::jsonb,
--   '{}'::jsonb,
--   '{"impianto_fotovoltaico": true, "lucernari": false, "centrale_termica": "true"}'::jsonb
-- ) AS residence_id_a;
--
-- -- B) ramo NULL: SETTE argomenti, p_features omesso. E' la chiamata che fa
-- --    oggi actions.ts: deve comportarsi esattamente come prima della 034.
-- SELECT czero_create_residence_with_units(
--   (SELECT id FROM builders LIMIT 1),
--   '__SMOKE_034_NULL__', 'Via di prova 2', 'A',
--   '2024-01-15'::date,
--   '[{"label":"Unita 1","floor":1}]'::jsonb,
--   '{}'::jsonb
-- ) AS residence_id_b;
--
-- -- Attesi (A):
-- --   n_features = 3 (true, false e la stringa "true": tutte e tre registrate)
-- --   centrale_termica_present = true  (cast tollerante sulla stringa)
-- --   fotovoltaico_atteso_1 = 1  (dichiarata presente -> voce istanziata)
-- --   lucernari_atteso_0    = 0  (dichiarata assente  -> voce esclusa)
-- --   antenna_atteso_0      = 0  (non dichiarata      -> voce esclusa)
-- --   incondizionate = attesi_incondizionati
-- -- NB: centrale_termica non genera un item perche' il suo template e' ancora
-- --     is_active=false. La riga in residence_features prova comunque il cast.
-- SELECT
--   (SELECT count(*) FROM residence_features rf
--      JOIN residences r ON r.id = rf.residence_id
--     WHERE r.name = '__SMOKE_034__')                                   AS n_features_atteso_3,
--   (SELECT rf.present FROM residence_features rf
--      JOIN residences r ON r.id = rf.residence_id
--     WHERE r.name = '__SMOKE_034__'
--       AND rf.feature_key = 'centrale_termica')                        AS centrale_termica_atteso_true,
--   (SELECT count(*) FROM maintenance_items mi
--      JOIN residences r ON r.id = mi.residence_id
--     WHERE r.name = '__SMOKE_034__'
--       AND mi.template_id = '7296f859-9ad6-45bb-8d1a-298f93a50146')    AS fotovoltaico_atteso_1,
--   (SELECT count(*) FROM maintenance_items mi
--      JOIN residences r ON r.id = mi.residence_id
--     WHERE r.name = '__SMOKE_034__'
--       AND mi.template_id = 'b95a07e2-062e-4714-91d1-3e5cc64131b7')    AS lucernari_atteso_0,
--   (SELECT count(*) FROM maintenance_items mi
--      JOIN residences r ON r.id = mi.residence_id
--     WHERE r.name = '__SMOKE_034__'
--       AND mi.template_id = '3fb467a8-157a-4c31-88f5-2d8dd61f7527')    AS antenna_atteso_0,
--   (SELECT count(*) FROM maintenance_items mi
--      JOIN residences r ON r.id = mi.residence_id
--      JOIN maintenance_templates mt ON mt.id = mi.template_id
--     WHERE r.name = '__SMOKE_034__' AND mi.unit_id IS NULL
--       AND mt.condition_key IS NULL)                                   AS incondizionate_condominio,
--   (SELECT count(*) FROM maintenance_templates
--     WHERE is_active AND scope = 'condominium' AND condition_key IS NULL) AS attesi_incondizionati;
--
-- -- Attesi (B) — il ramo critico della retrocompatibilita':
-- --   n_features_atteso_0 = 0   (nessuna riga scritta: non dichiarato != assente)
-- --   condizionali_istanziate = attesi_condizionali_attivi
-- --   Il confronto e' contro la query, non contro il numero 5: se un domani
-- --   una delle 5 venisse spenta o una delle 16 accesa, il test resta valido.
-- SELECT
--   (SELECT count(*) FROM residence_features rf
--      JOIN residences r ON r.id = rf.residence_id
--     WHERE r.name = '__SMOKE_034_NULL__')                              AS n_features_atteso_0,
--   (SELECT count(*) FROM maintenance_items mi
--      JOIN residences r ON r.id = mi.residence_id
--      JOIN maintenance_templates mt ON mt.id = mi.template_id
--     WHERE r.name = '__SMOKE_034_NULL__' AND mi.unit_id IS NULL
--       AND mt.condition_key IS NOT NULL)                               AS condizionali_istanziate,
--   (SELECT count(*) FROM maintenance_templates
--     WHERE is_active AND scope = 'condominium' AND condition_key IS NOT NULL) AS attesi_condizionali_attivi;
--
-- ROLLBACK;

-- ============================================================
-- VERIFICA POST-APPLY (oltre all'auto-verifica in coda).
-- ============================================================
-- 1. Nessuna residenza esistente toccata: gli item delle residenze create
--    PRIMA di oggi devono essere invariati, comprese le 5 condizionali
--    attive che oggi sono istanziate ovunque (atteso: numeri identici a
--    prima dell'apply, la 034 non fa UPDATE/DELETE):
-- SELECT r.name, count(*) FILTER (WHERE mt.condition_key IS NOT NULL) AS item_condizionali
-- FROM maintenance_items mi
-- JOIN residences r ON r.id = mi.residence_id
-- JOIN maintenance_templates mt ON mt.id = mi.template_id
-- GROUP BY r.name ORDER BY r.name;
--
-- 2. La vecchia firma a 7 argomenti non esiste piu':
-- SELECT pg_get_function_identity_arguments(p.oid)
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'czero_create_residence_with_units';
-- -- atteso: 1 sola riga, con p_features jsonb in coda
-- ============================================================
--
-- -- ESITO REALE (da compilare da Filippo dopo l'apply) --
-- 0. Output dell'AUTO-VERIFICA IN CODA:
-- 1. Smoke test A (filtro attivo):
-- 2. Smoke test B (ramo NULL, retrocompatibilita'):
-- 3. Item condizionali per residenza esistente (invariati):
-- ============================================================
--
-- ============================================================
-- DEBITO APERTO — vocabolario di feature_key non vincolato.
-- residence_features.feature_key e' TEXT senza CHECK e senza FK: e' una
-- scelta deliberata della 030 (aggiungere una dotazione non deve richiedere
-- una migrazione), ma lascia il vocabolario senza guardie.
--
-- Il rischio non e' un errore, e' un SILENZIO: un typo lato wizard
-- ('ascensre') scrive una riga valida che non combacia con nessun
-- condition_key. Il template resta fuori dal piano, non viene sollevata
-- nessuna eccezione, e la voce semplicemente non esiste. Stessa classe del
-- cast booleano chiuso nel blocco 2: il piano nasce incompleto in silenzio.
--
-- CHIUSURA PREVISTA: commit 035, lato TS — le 19 chiavi come union type,
-- unica fonte di verita' condivisa da wizard e pipeline AI di B5, coerente
-- con la scelta della 030 di tenere il vocabolario in una costante e non in
-- un CHECK Postgres. NON fixato qui: un concern per commit.
-- ============================================================
