-- ============================================================
-- CasaZero — 047: "Aggiungi unita" rispetta le dotazioni della residenza.
-- ANTEPRIMA. Applica Filippo nel SQL Editor.
-- ATTENZIONE, LEZIONE 032: NON selezionare porzioni di testo prima di
-- eseguire. Il SQL Editor esegue solo la selezione, se c'e'. Deseleziona
-- (click a vuoto) ed esegui tutto, poi incolla l'output dell'ultima riga.
-- Statement singoli idempotenti (CREATE OR REPLACE, REVOKE/GRANT), nessun
-- BEGIN/COMMIT: rieseguire il file non rompe nulla.
-- ------------------------------------------------------------
-- NUMERAZIONE: la 047 e' riservata dalla testata della 044 (044:65-66).
--
-- CONCERN UNICO: czero_add_unit_with_items (044) istanzia le voci di unita
-- senza il filtro condition_key su residence_features, a differenza di
-- czero_create_residence_with_units (044:199-208). Un'unita aggiunta
-- riceverebbe le voci di dotazioni che la residenza non ha dichiarato.
--
-- STATO PRIMA DELL'APPLY (query di sola lettura di Filippo, 30/10):
--   template condizionali: condominium | 21 | 21, nessuno scope='unit';
--   voci di unita con dotazione non dichiarata: 0 righe.
-- Il buco e' quindi latente (034:71-80): si aprirebbe col primo template
-- condizionale di unita. Nessun riallineamento necessario.
--
-- FILTRO. La 044 alla creazione usa tre rami:
--   p_features IS NULL           -> dotazioni non dichiarate: passa tutto
--   mt.condition_key IS NULL     -> voce non condizionata: passa
--   dotazione present = true     -> passa
-- "Aggiungi" non riceve p_features. Il primo ramo diventa: la residenza non
-- ha righe in residence_features. Con p_features NULL la creazione non ne
-- scrive nessuna (COALESCE a '{}', 044:135), quindi una residenza creata
-- senza dotazioni dichiarate riceve le voci condizionate sia alla creazione
-- sia in "Aggiungi". Il wizard manda sempre tutte le 19 chiavi, anche i "no"
-- (new/actions.ts:65-73): righe presenti, filtro identico alla creazione.
--
-- LIMITE NOTO (accettato da Filippo il 30/10): una creazione con
-- p_features = '{}' (oggetto vuoto, non NULL; possibile solo chiamando la
-- RPC a mano, il wizard non lo fa) esclude le voci condizionate alla
-- creazione ma non scrive righe in residence_features. "Aggiungi" la legge
-- come "non dichiarata" e le include. Chiuderlo richiederebbe un segnale
-- "dotazioni dichiarate" sulla residenza: cambio di schema, fuori scope.
--
-- LE DOTAZIONI NON CAMBIANO DOPO LA CREAZIONE: in src/ nessun codice scrive
-- residence_features, e RLS ammette solo SELECT (030:81-105). Il filtro di
-- "Aggiungi" legge quindi lo stesso stato che ha letto la creazione.
--
-- INVARIATO DALLA 044: firma, unita con delivery_date NULL, voci
-- ricalcolabili con next_due_date NULL, promemoria datate (categoria,
-- residenza, CURRENT_DATE) e sempre 'in_attesa', P0002 per residenza
-- inesistente, permessi solo service_role.
--
-- FUORI SCOPE: units/actions.ts (perimetro, log dell'errore, messaggi di
-- dominio): commit separato.
-- ============================================================

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
    AND mt.scope = 'unit'
    -- Filtro condizionale: stessa forma della creazione (044:199-208).
    -- Nessuna riga in residence_features = dotazioni non dichiarate, come
    -- p_features NULL alla creazione (vedi testata, anche per il limite
    -- su p_features = '{}').
    AND (
      mt.condition_key IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM residence_features rf0
        WHERE rf0.residence_id = p_residence_id
      )
      OR EXISTS (
        SELECT 1 FROM residence_features rf
        WHERE rf.residence_id = p_residence_id
          AND rf.feature_key  = mt.condition_key
          AND rf.present
      )
    );

  -- completion_mode/obligation_type restano NULL (eredita dal template);
  -- activation_status prende il default DB 'inclusa'.

  RETURN v_unit_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) TO service_role;

-- ------------------------------------------------------------
-- AUTO-VERIFICA IN CODA (V1) — ultima istruzione. Attesa UNA riga:
--   czero_add_unit_with_items | 1 | p_residence_id uuid, p_label text, p_floor integer
--   service_role true | authenticated false | anon false | secdef true |
--   search_path=public | ha_40001 false | ha_residence_features true |
--   ha_category_dates true
-- Se authenticated o anon risultano true, rilanciare da soli i
-- REVOKE/GRANT (lezione della 045, 045:286-291).
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
  bool_and(p.prosrc LIKE '%residence_features%')                     AS ha_residence_features_atteso_true,
  bool_and(p.prosrc LIKE '%residence_category_dates%')               AS ha_category_dates_atteso_true
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'czero_add_unit_with_items'
GROUP BY p.proname;

-- ============================================================
-- TEST — eseguiti da supabase/maintenance/test_047.sql (file temporaneo,
-- un blocco per esecuzione), cancellato dopo aver riportato qui gli esiti.
-- ============================================================
--
-- -- ESITO REALE (applicata da Filippo nel SQL Editor il 2026-10-30) --
-- V1: czero_add_unit_with_items | 1 overload | p_residence_id uuid,
--     p_label text, p_floor integer | service_role true | authenticated
--     false | anon false | secdef true | search_path=public | ha_40001
--     false | ha_residence_features true | ha_category_dates true.
-- BLOCCO 0: Furlan srl | 8 template di unita | 3 promemoria | 0
--     condizionali di unita | 0 residui.
-- POS1: OK | attivi_unit 9, creazione 9 (prova t), aggiunta 9 (prova t),
--     stesso insieme t.
-- POS2: OK | attivi_unit 9, creazione 8 (prova f), aggiunta 8 (prova f),
--     stesso insieme t.
-- POS3: OK | righe dotazioni 0, attivi_unit 9, creazione 9 (prova t),
--     aggiunta 9 (prova t), stesso insieme t.
-- POS4: OK | ricalcolabili datate 0, promemoria 3, promemoria senza data
--     0, promemoria non in_attesa 0, unita consegnata f.
-- NEG1: OK | sqlstate P0002, unita scritte 0.
-- NEG2: OK | sqlstate 42501.
-- RESIDUI: 0 residenze __TEST_047_ | 0 template __TEST_047_.
-- ============================================================
