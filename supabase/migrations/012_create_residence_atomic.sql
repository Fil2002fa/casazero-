-- ============================================================
-- CasaZero — 012: creazione residenza atomica
-- Applicata a mano nel SQL Editor il 2026-07-03 (smoke test ok).
-- Sostituisce i 3 insert PostgREST separati di
-- src/app/(dashboard)/admin/residences/new/actions.ts con
-- un'unica transazione: residenza + unità + maintenance_items.
-- Qualsiasi errore → ROLLBACK totale (nessuna residenza orfana,
-- nessuna residenza senza piano).
-- ------------------------------------------------------------
-- Differenze consapevoli rispetto al codice TS precedente:
--   1. Filtro is_active = true sui template (il codice precedente
--      istanziava anche i template disattivati del catalogo v2).
--   2. Aritmetica date via interval Postgres (clamp a fine mese),
--      coerente con czero_recalc_due — non il rollover di
--      setMonth() JS.
-- ============================================================

CREATE OR REPLACE FUNCTION czero_create_residence_with_units(
  p_builder_id     uuid,
  p_name           text,
  p_address        text,
  p_energy_class   text,
  p_delivery_date  date,
  p_units          jsonb,                       -- array di {label text, floor int}
  p_category_dates jsonb DEFAULT '{}'::jsonb    -- {categoria: 'yyyy-mm-dd'} override wizard
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

  -- 2. Unità (label e floor arrivano dal chiamante, nessun default hard-coded)
  INSERT INTO units (residence_id, label, floor)
  SELECT v_residence_id, u->>'label', (u->>'floor')::integer
  FROM jsonb_array_elements(p_units) AS u;

  -- 3a. Item condominiali: 1 per template scope='condominium'
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
    AND mt.scope = 'condominium';

  -- 3b. Item di unità: 1 per template scope='unit' × ogni unità appena creata
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
    AND un.residence_id = v_residence_id;

  -- completion_mode/obligation_type restano NULL (eredita dal template);
  -- activation_status prende il default DB 'inclusa'.

  RETURN v_residence_id;
END;
$$;

-- Permessi: solo il service role può eseguirla
REVOKE EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION czero_create_residence_with_units(uuid, text, text, text, date, jsonb, jsonb) TO service_role;

-- ============================================================
-- SMOKE TEST (eseguire in transazione con ROLLBACK: non sporca nulla)
-- Decommentare l'intero blocco ed eseguirlo in un colpo solo.
-- Eseguito il 2026-07-03 con 19 template attivi: n_units=3,
-- n_items_condominio=11, n_items_unita=24, n_incoerenti=0,
-- residui post-rollback=0.
-- ============================================================
-- BEGIN;
--
-- SELECT czero_create_residence_with_units(
--   (SELECT id FROM builders LIMIT 1),
--   '__SMOKE_TEST__', 'Via di prova 1', 'A',
--   '2024-01-15'::date,
--   '[{"label":"Unità 1","floor":1},{"label":"Unità 2","floor":1},{"label":"Unità 3","floor":2}]'::jsonb,
--   '{}'::jsonb
-- ) AS residence_id;
--
-- -- Attesi: 3 unità; item = (n. template attivi condominium) + 3 × (n. template attivi unit);
-- -- n_incoerenti = 0. NB: NON aspettarsi status 'scaduta' su tutte le voci anche con
-- -- base nel passato: le voci a frequenza lunga (36/60 mesi) possono scadere nel futuro
-- -- e restare correttamente 'in_attesa'. Il check giusto è la coerenza data↔status.
-- SELECT (SELECT count(*) FROM units WHERE residence_id IN (SELECT id FROM residences WHERE name = '__SMOKE_TEST__'))  AS n_units,
--        (SELECT count(*) FROM maintenance_items WHERE residence_id IN (SELECT id FROM residences WHERE name = '__SMOKE_TEST__') AND unit_id IS NULL) AS n_items_condominio,
--        (SELECT count(*) FROM maintenance_items WHERE residence_id IN (SELECT id FROM residences WHERE name = '__SMOKE_TEST__') AND unit_id IS NOT NULL) AS n_items_unita,
--        (SELECT count(*) FROM maintenance_items WHERE residence_id IN (SELECT id FROM residences WHERE name = '__SMOKE_TEST__')
--           AND (next_due_date < CURRENT_DATE) <> (status = 'scaduta')) AS n_incoerenti_attesi_0;
--
-- ROLLBACK;
