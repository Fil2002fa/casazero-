-- ============================================================
-- CasaZero — 013: aggiunta unità atomica
-- Applicata a mano nel SQL Editor il 2026-07-03 (smoke test ok).
-- Sostituisce i 2 insert PostgREST separati di createUnit in
-- src/app/(dashboard)/admin/residences/[id]/units/actions.ts
-- con un'unica transazione: unità + maintenance_items scope='unit'.
-- Qualsiasi errore → ROLLBACK totale (nessuna unità senza piano).
-- ------------------------------------------------------------
-- Differenze consapevoli rispetto al codice TS precedente:
--   1. Filtro is_active = true sui template (il codice precedente
--      istanziava anche i template disattivati del catalogo v2).
--   2. Aritmetica date via interval Postgres (clamp a fine mese),
--      coerente con czero_create_residence_with_units e
--      czero_recalc_due — non il rollover di setMonth() JS.
--   3. Status 'scaduta' se la scadenza calcolata è nel passato
--      (il codice precedente scriveva sempre 'in_attesa').
-- ------------------------------------------------------------
-- LIMITE NOTO (accettato): gli override data per categoria del
-- wizard (p_category_dates della 012) non sono persistiti da
-- nessuna parte. Un'unità aggiunta dopo la creazione usa SEMPRE
-- delivery_date della residenza come base: le sue scadenze
-- possono divergere da quelle delle unità sorelle create dal
-- wizard con date per categoria personalizzate.
-- ============================================================

CREATE OR REPLACE FUNCTION czero_add_unit_with_items(
  p_residence_id uuid,
  p_label        text,
  p_floor        integer   -- nullable: il form può non indicare il piano
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id uuid;
  v_base    date;
BEGIN
  -- 1. Base scadenze dalla residenza. INTO STRICT: se la residenza
  --    non esiste fallisce QUI, prima di qualsiasi scrittura.
  BEGIN
    SELECT COALESCE(delivery_date, CURRENT_DATE)
    INTO STRICT v_base
    FROM residences
    WHERE id = p_residence_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN
    RAISE EXCEPTION 'Residenza % inesistente', p_residence_id;
  END;

  -- 2. Unità (label già trim-mata dal chiamante, come oggi)
  INSERT INTO units (residence_id, label, floor)
  VALUES (p_residence_id, p_label, p_floor)
  RETURNING id INTO v_unit_id;

  -- 3. Item di unità: 1 per template attivo scope='unit'.
  --    scadenza = base + frequency_months; scaduta se nel passato.
  INSERT INTO maintenance_items (template_id, residence_id, unit_id, next_due_date, status)
  SELECT
    mt.id, p_residence_id, v_unit_id, due.d,
    CASE WHEN due.d < CURRENT_DATE THEN 'scaduta' ELSE 'in_attesa' END::maintenance_status
  FROM maintenance_templates mt
  CROSS JOIN LATERAL (
    SELECT (v_base + (mt.frequency_months || ' months')::interval)::date AS d
  ) due
  WHERE mt.is_active = true
    AND mt.scope = 'unit';

  -- completion_mode/obligation_type restano NULL (eredita dal template);
  -- activation_status prende il default DB 'inclusa'.

  RETURN v_unit_id;
END;
$$;

-- Permessi: solo il service role può eseguirla
REVOKE EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION czero_add_unit_with_items(uuid, text, integer) TO service_role;

-- ============================================================
-- SMOKE TEST (eseguire in transazione con ROLLBACK: non sporca nulla)
-- Decommentare l'intero blocco ed eseguirlo in un colpo solo.
-- Eseguito il 2026-07-03: n_items=8 = n_template_attivi_unit,
-- n_incoerenti_attesi_0=0. NB: non aspettarsi 'scaduta' su tutte
-- le voci anche con base nel passato: le frequenze lunghe (36/60
-- mesi) possono scadere nel futuro e restare 'in_attesa'.
-- ============================================================
-- BEGIN;
--
-- SELECT czero_add_unit_with_items(
--   (SELECT id FROM residences ORDER BY created_at LIMIT 1),
--   '__SMOKE_TEST_UNIT__',
--   99
-- ) AS unit_id;
--
-- SELECT
--   (SELECT count(*) FROM maintenance_items mi
--      JOIN units u ON u.id = mi.unit_id
--     WHERE u.label = '__SMOKE_TEST_UNIT__') AS n_items,
--   (SELECT count(*) FROM maintenance_templates
--     WHERE is_active = true AND scope = 'unit') AS n_template_attivi_unit,
--   (SELECT count(*) FROM maintenance_items mi
--      JOIN units u ON u.id = mi.unit_id
--     WHERE u.label = '__SMOKE_TEST_UNIT__'
--       AND (mi.next_due_date < CURRENT_DATE) <> (mi.status = 'scaduta')) AS n_incoerenti_attesi_0;
--
-- ROLLBACK;

-- ============================================================
-- TEST NEGATIVO opzionale (blocco separato: l'eccezione abortisce
-- la transazione, quindi NON metterlo nello stesso run del test
-- sopra). Eseguito il 2026-07-03: ERROR "Residenza ... inesistente",
-- zero scritture.
-- ============================================================
-- BEGIN;
-- SELECT czero_add_unit_with_items(gen_random_uuid(), '__MAI_CREATA__', 1);
-- ROLLBACK;
