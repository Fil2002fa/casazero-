-- ============================================================
-- CasaZero — 044: le unita nascono "Non consegnata".
-- ANTEPRIMA. Applica Filippo nel SQL Editor.
-- ATTENZIONE, LEZIONE 032: NON selezionare porzioni di testo prima di
-- eseguire. Il SQL Editor esegue solo la selezione, se c'e'. Deseleziona
-- (click a vuoto) ed esegui tutto, poi incolla l'output dell'ultima riga.
-- Statement singoli idempotenti (DROP IF EXISTS, CREATE OR REPLACE,
-- REVOKE/GRANT), nessun BEGIN/COMMIT: rieseguire il file non rompe nulla.
-- ------------------------------------------------------------
-- NUMERAZIONE: la 044 e' riservata dalla testata della 042 (042:12) e dalla
-- 045 (045:9) all'allineamento delle RPC di creazione alla cascata.
--
-- CONCERN UNICO: le due RPC di creazione applicano la cascata di
-- resolveDueBasis (src/lib/maintenance-due.ts:170-202) invece di datare
-- tutto dalla residenza.
--
--   czero_create_residence_with_units (034 -> 044)
--     1. p_category_dates SALVATE in residence_category_dates (prima:
--        usate nel calcolo e buttate, 042:22-25), solo le chiavi che
--        corrispondono a una categoria di template esistente.
--     2. Nuovo parametro p_units_delivery_date (in coda, DEFAULT NULL):
--          NULL  -> unita con delivery_date NULL ("Non consegnata");
--          data  -> opzione del wizard "Unita gia consegnate tutte il
--                   <data>": tutte le unita con quella delivery_date.
--     3. Voci di unita:
--          unita consegnate     -> categoria, altrimenti data dell'unita;
--          unita non consegnate -> next_due_date NULL, status 'in_attesa',
--                                  SALVO le promemoria (vedi sotto).
--     4. Voci condominiali: invariate (categoria, altrimenti residenza),
--        lette dalla tabella appena scritta invece che dal jsonb.
--
--   czero_add_unit_with_items (013 -> 044), firma invariata
--     1. Unita con delivery_date NULL (come gia oggi: 013 non la scriveva).
--     2. Voci di unita next_due_date NULL, status 'in_attesa', salvo le
--        promemoria.
--     3. "Residenza inesistente" con ERRCODE P0002 (prima P0001 generico).
--
-- PROMEMORIA (decisione di Filippo, 29/10): restano datate come oggi.
-- Motivo: il cron le avanza e le notifica solo se hanno una data
-- (api/cron/daily/route.ts:52-54, .lte esclude NULL), e la RPC di consegna
-- le salta (046:113-115). Messe a NULL alla creazione, resterebbero NULL
-- anche dopo la consegna: nessun promemoria, mai. Base per le promemoria
-- di un'unita NON consegnata: categoria, altrimenti residenza — e' il
-- calcolo della 034. Per la 013 e' un cambiamento: prima usava solo la
-- residenza, ora legge anche la categoria salvata. Chiude il LIMITE NOTO
-- della 013 (013:22-27).
-- "Promemoria" = maintenance_templates.completion_mode: alla creazione la
-- voce non ha override (completion_mode NULL = eredita dal template), stessa
-- regola effettiva della 046 (coalesce(mi..., mt...)).
--
-- OVERRIDE DELLA VOCE (due_basis_override): alla creazione e' sempre NULL,
-- quindi il primo livello della cascata non si applica qui.
--
-- STATUS, nei tre INSERT di voci (condominiali, di unita nella 034, di
-- unita nella 013):
--   promemoria -> SEMPRE 'in_attesa', anche con data passata. Invariante:
--                 una promemoria non e' mai scaduta (CLAUDE.md), e il cron
--                 non la marca mai (route.ts:71-85, ramo N1 con continue).
--                 Prima della 044 una promemoria con base nel passato
--                 nasceva 'scaduta' nel DB.
--   altre voci -> 'scaduta' se la data calcolata e' passata, come la 034;
--                 una data NULL da' 'in_attesa' (NULL < CURRENT_DATE -> ELSE).
--
-- FUORI SCOPE
--   - filtro condition_key nella 013: migrazione 047 dedicata (decisione
--     del 29/10), coi suoi test. Oggi e' un no-op (034:71-80).
--   - wizard e testo di aiuto "Data consegna": commit dopo l'apply.
--   - riallineamento delle unita gia create: file separato
--     supabase/maintenance/riallinea_voci_unita_non_consegnate.sql.
--
-- ORDINE DI RILASCIO: la 044 e' compatibile con l'app di oggi (il nuovo
-- parametro ha un DEFAULT, la 013 non cambia firma). Effetto immediato
-- dell'apply: le residenze create dal wizard attuale nascono con tutte le
-- unita non consegnate. Il codice che passa p_units_delivery_date va
-- rilasciato DOPO l'apply, altrimenti PostgREST risponde PGRST202.
--
-- CODICI D'ERRORE (nessun RAISE con 40001: PostgREST lo ritenta
-- all'infinito, 046:21; nessun conflitto di concorrenza qui, quindi
-- nemmeno PT409):
--   P0002  residenza inesistente (013)
--   22007  data di categoria non valida (cast ::date), creazione annullata
-- ============================================================

-- ------------------------------------------------------------
-- 1. czero_create_residence_with_units — 9 argomenti
-- ------------------------------------------------------------
-- DROP della firma a 8 argomenti (034): senza, resterebbero due overload e
-- una chiamata senza p_units_delivery_date colpirebbe ancora la versione
-- che data tutto dalla residenza.
DROP FUNCTION IF EXISTS czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION czero_create_residence_with_units(
  p_builder_id           uuid,
  p_name                 text,
  p_address              text,
  p_energy_class         text,
  p_delivery_date        date,
  p_units                jsonb,                       -- array di {label text, floor int}
  p_category_dates       jsonb DEFAULT '{}'::jsonb,   -- {Categoria: 'yyyy-mm-dd'} dal wizard
  p_features             jsonb DEFAULT NULL,          -- {feature_key: boolean}; NULL = non dichiarate
  p_units_delivery_date  date  DEFAULT NULL           -- NULL = unita non consegnate
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

  -- 2. Date per categoria. PRIMA degli item: il calcolo le legge da qui.
  --    Valori vuoti scartati (il wizard manda solo i campi compilati, ma un
  --    round-trip puo' portare ""). Chiavi senza template scartate: il
  --    vocabolario non ha CHECK (042:343-347), una chiave sbagliata non
  --    combacerebbe con nessuna voce. Una data non valida fa fallire il
  --    cast (22007) e annulla l'intera creazione, come gia nella 034.
  INSERT INTO residence_category_dates (residence_id, category, delivery_date)
  SELECT v_residence_id, c.key, NULLIF(btrim(c.value #>> '{}'), '')::date
  FROM jsonb_each(COALESCE(p_category_dates, '{}'::jsonb)) AS c
  WHERE NULLIF(btrim(c.value #>> '{}'), '') IS NOT NULL
    AND EXISTS (SELECT 1 FROM maintenance_templates mt WHERE mt.category = c.key);

  -- 3. Dotazioni dichiarate dal wizard: invariato dalla 034 (034:110-134).
  INSERT INTO residence_features (residence_id, feature_key, present, source)
  SELECT v_residence_id, f.key,
         CASE jsonb_typeof(f.value)
           WHEN 'boolean' THEN (f.value)::text::boolean
           WHEN 'string'  THEN (f.value #>> '{}') IN ('true','t','1')
         END,
         'wizard'
  FROM jsonb_each(COALESCE(p_features, '{}'::jsonb)) AS f
  WHERE jsonb_typeof(f.value) IN ('boolean','string');

  -- 4. Unita: delivery_date = p_units_delivery_date (NULL = non consegnate).
  INSERT INTO units (residence_id, label, floor, delivery_date)
  SELECT v_residence_id, u->>'label', (u->>'floor')::integer, p_units_delivery_date
  FROM jsonb_array_elements(p_units) AS u;

  -- 5a. Item condominiali: categoria, altrimenti residenza (invariato).
  INSERT INTO maintenance_items (template_id, residence_id, unit_id, next_due_date, status)
  SELECT
    mt.id, v_residence_id, NULL, due.d,
    CASE WHEN mt.completion_mode = 'promemoria' THEN 'in_attesa' WHEN due.d < CURRENT_DATE THEN 'scaduta' ELSE 'in_attesa' END::maintenance_status
  FROM maintenance_templates mt
  LEFT JOIN residence_category_dates rcd
         ON rcd.residence_id = v_residence_id AND rcd.category = mt.category
  CROSS JOIN LATERAL (
    SELECT (
      COALESCE(rcd.delivery_date, p_delivery_date)
      + (mt.frequency_months || ' months')::interval
    )::date AS d
  ) due
  WHERE mt.is_active = true
    AND mt.scope = 'condominium'
    -- Filtro condizionale: invariato dalla 034 (034:157-173).
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

  -- 5b. Item di unita: cascata di resolveDueBasis, ramo 'unit'.
  --     Unita consegnata  -> categoria, altrimenti data dell'unita.
  --     Non consegnata    -> NULL (gate, maintenance-due.ts:182), salvo
  --                          promemoria: categoria, altrimenti residenza.
  --     La data della residenza non e' mai base di una voce di unita
  --     ricalcolabile (maintenance-due.ts:122-125).
  INSERT INTO maintenance_items (template_id, residence_id, unit_id, next_due_date, status)
  SELECT
    mt.id, v_residence_id, un.id, due.d,
    CASE WHEN mt.completion_mode = 'promemoria' THEN 'in_attesa' WHEN due.d < CURRENT_DATE THEN 'scaduta' ELSE 'in_attesa' END::maintenance_status
  FROM maintenance_templates mt
  CROSS JOIN units un
  LEFT JOIN residence_category_dates rcd
         ON rcd.residence_id = v_residence_id AND rcd.category = mt.category
  CROSS JOIN LATERAL (
    SELECT (
      CASE
        WHEN un.delivery_date IS NOT NULL
          THEN COALESCE(rcd.delivery_date, un.delivery_date)
        WHEN mt.completion_mode = 'promemoria'
          THEN COALESCE(rcd.delivery_date, p_delivery_date)
      END
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

-- Permessi sulla NUOVA firma a 9 argomenti: quelli della vecchia sono
-- spariti col DROP. Solo il service role puo' eseguirla.
REVOKE EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb, jsonb, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb, jsonb, date) FROM anon;
REVOKE EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb, jsonb, date) FROM authenticated;
GRANT  EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb, jsonb, date) TO service_role;

-- ------------------------------------------------------------
-- 2. czero_add_unit_with_items — firma invariata (013)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION czero_add_unit_with_items(
  p_residence_id uuid,
  p_label        text,
  p_floor        integer   -- nullable: il form puo' non indicare il piano
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id        uuid;
  v_residence_date date;
BEGIN
  -- 1. Residenza: INTO STRICT, se non esiste fallisce QUI, prima di
  --    qualsiasi scrittura. La data serve solo alle promemoria.
  BEGIN
    SELECT delivery_date
    INTO STRICT v_residence_date
    FROM residences
    WHERE id = p_residence_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION 'Residenza % inesistente', p_residence_id
      USING ERRCODE = 'P0002';
  END;

  -- 2. Unita non consegnata: delivery_date NULL. La consegna si registra
  --    dopo, con czero_register_delivery (045/046).
  INSERT INTO units (residence_id, label, floor)
  VALUES (p_residence_id, p_label, p_floor)
  RETURNING id INTO v_unit_id;

  -- 3. Item di unita: NULL (gate), salvo promemoria: categoria salvata,
  --    altrimenti residenza. CURRENT_DATE resta come ultimo ripiego della
  --    013 per una residenza senza data (residences.delivery_date e'
  --    nullable nello schema, anche se il wizard la rende obbligatoria).
  INSERT INTO maintenance_items (template_id, residence_id, unit_id, next_due_date, status)
  SELECT
    mt.id, p_residence_id, v_unit_id, due.d,
    CASE WHEN mt.completion_mode = 'promemoria' THEN 'in_attesa' WHEN due.d < CURRENT_DATE THEN 'scaduta' ELSE 'in_attesa' END::maintenance_status
  FROM maintenance_templates mt
  LEFT JOIN residence_category_dates rcd
         ON rcd.residence_id = p_residence_id AND rcd.category = mt.category
  CROSS JOIN LATERAL (
    SELECT (
      CASE
        WHEN mt.completion_mode = 'promemoria'
          THEN COALESCE(rcd.delivery_date, v_residence_date, CURRENT_DATE)
      END
      + (mt.frequency_months || ' months')::interval
    )::date AS d
  ) due
  WHERE mt.is_active = true
    AND mt.scope = 'unit';

  -- completion_mode/obligation_type restano NULL (eredita dal template);
  -- activation_status prende il default DB 'inclusa'.

  RETURN v_unit_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) TO service_role;

-- PostgREST: la firma della RPC di creazione e' cambiata.
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- AUTO-VERIFICA IN CODA (V1) — ultima istruzione, il SQL Editor ne mostra
-- il risultato. Attese DUE righe, una per funzione:
--   czero_add_unit_with_items         | 1 | p_residence_id uuid, p_label text, p_floor integer
--   czero_create_residence_with_units | 1 | ... p_features jsonb, p_units_delivery_date date
-- e su entrambe: service_role true | authenticated false | anon false |
-- secdef true | search_path=public | ha_40001 false | ha_category_dates true
-- Se n_overload e' 2 sulla creazione, il DROP non ha agito: resta la
-- versione a 8 argomenti, non lasciare il DB in quello stato.
-- PRIMO APPLY DEI PERMESSI: alla 045 i REVOKE nello stesso script della
-- CREATE non hanno avuto effetto al primo colpo (045:286-291). Se una riga
-- mostra authenticated o anon true, rilanciare da soli i REVOKE/GRANT.
-- ------------------------------------------------------------
SELECT
  p.proname,
  count(*)                                                           AS n_overload_atteso_1,
  max(pg_get_function_identity_arguments(p.oid))                     AS firma,
  bool_or(has_function_privilege('service_role',  p.oid, 'EXECUTE')) AS service_role_atteso_true,
  bool_or(has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS authenticated_atteso_false,
  bool_or(has_function_privilege('anon',          p.oid, 'EXECUTE')) AS anon_atteso_false,
  bool_and(p.prosecdef)                                              AS secdef_atteso_true,
  max(array_to_string(p.proconfig, ','))                             AS proconfig_atteso_search_path_public,
  bool_or(p.prosrc LIKE '%40001%')                                   AS ha_40001_atteso_false,
  bool_and(p.prosrc LIKE '%residence_category_dates%')               AS ha_category_dates_atteso_true
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('czero_create_residence_with_units', 'czero_add_unit_with_items')
GROUP BY p.proname
ORDER BY p.proname;

-- ============================================================
-- TEST — eseguiti da supabase/maintenance/test_044.sql (file temporaneo,
-- blocchi DO decommentati, uno per esecuzione), cancellato dopo aver
-- riportato qui gli esiti, come per la 045.
-- ============================================================
--
-- -- ESITO REALE (applicata da Filippo nel SQL Editor il 2026-10-29) --
-- STORIA DELL'APPLY: prima applicazione senza la regola sullo status delle
-- promemoria (V1 ok). Riapplicata con lo status su una riga, nei tre INSERT:
--   CASE WHEN mt.completion_mode = 'promemoria' THEN 'in_attesa'
--        WHEN due.d < CURRENT_DATE THEN 'scaduta' ELSE 'in_attesa' END
-- Il file e' stato allineato a quella forma esatta: il DB e il repo
-- coincidono.
-- V1: 2 funzioni, 1 overload ciascuna, EXECUTE solo service_role,
--     SECURITY DEFINER, search_path=public, nessun 40001,
--     residence_category_dates presente. Correzione promemoria presente
--     (2 nella creazione, 1 in Aggiungi).
-- BLOCCO 0: Furlan srl | categoria di prova Finiture | 8 template di
--     unita | 3 promemoria | 0 senza completion_mode | 0 N1 non promemoria
--     | 0 promemoria non N1.
-- POS1: OK, voci unita 16 (2 x 8), ricalcolabili NULL, promemoria 6
--     giuste, condominiali 27 giuste, promemoria scadute 0, categorie
--     salvate 1.
-- POS2: OK, unita consegnate 2025-03-10, voci unita 16 giuste,
--     condominiali 27 giuste, promemoria scadute 0, categorie 1.
-- POS3: OK, unita aggiunta non consegnata, voci 8, ricalcolabili NULL,
--     promemoria 3 giuste, categorie 1.
-- NEG1: OK, P0002 residenza inesistente, unita scritte 0.
-- NEG2: OK, 22007 data non valida, residenze scritte 0.
-- NEG3: OK, creazione 42501 | aggiunta 42501.
-- RESIDUI: 0 residenze __TEST_044_.
-- ============================================================
