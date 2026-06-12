-- ============================================================
-- CasaZero — Seed dati di test: Residenza Cavaccio
-- DA ESEGUIRE DOPO seed.sql (che crea i 27 template)
--
-- Crea: Furlan Costruzioni → Residenza Cavaccio → 14 unità
--       maintenance_items per tutti i template
--       alcuni item con scadenza nel passato (per testare N2/N3)
--
-- Dopo il seed, per testare come super_admin:
--   UPDATE profiles
--   SET role = 'super_admin',
--       builder_id = (SELECT id FROM builders WHERE name = 'Furlan Costruzioni')
--   WHERE id = auth.uid();
--
-- Per testare come client (sostituisci UNIT_ID con uno degli UUID stampati):
--   INSERT INTO unit_members (unit_id, profile_id, started_at, is_primary)
--   VALUES ('UNIT_ID', auth.uid(), CURRENT_DATE, true);
--
-- Per testare come admin di condominio:
--   UPDATE profiles SET role = 'admin', builder_id = (SELECT id FROM builders WHERE name = 'Furlan Costruzioni') WHERE id = auth.uid();
--   INSERT INTO admin_assignments (profile_id, residence_id)
--   VALUES (auth.uid(), (SELECT id FROM residences WHERE name = 'Residenza Cavaccio'));
-- ============================================================

DO $$
DECLARE
  v_builder_id    UUID;
  v_residence_id  UUID;
  v_unit_ids      UUID[] := ARRAY[]::UUID[];
  v_unit_id       UUID;
  v_template      RECORD;
  i               INTEGER;
  v_due           DATE;
BEGIN

  -- Builder
  INSERT INTO builders (name, primary_color)
  VALUES ('Furlan Costruzioni', '#04342C')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_builder_id;

  -- Se già esisteva, recupera l'id
  IF v_builder_id IS NULL THEN
    SELECT id INTO v_builder_id FROM builders WHERE name = 'Furlan Costruzioni' LIMIT 1;
  END IF;

  -- Residenza
  INSERT INTO residences (builder_id, name, address, energy_class, delivery_date)
  VALUES (
    v_builder_id,
    'Residenza Cavaccio',
    'Via Cavaccio 12, Pordenone',
    'A2',
    '2023-03-01'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_residence_id;

  IF v_residence_id IS NULL THEN
    SELECT id INTO v_residence_id FROM residences WHERE name = 'Residenza Cavaccio' LIMIT 1;
  END IF;

  -- 14 unità
  FOR i IN 1..14 LOOP
    INSERT INTO units (residence_id, label, floor)
    VALUES (v_residence_id, 'Unità ' || i, CEIL(i::FLOAT / 2)::INTEGER)
    RETURNING id INTO v_unit_id;
    v_unit_ids := v_unit_ids || v_unit_id;
  END LOOP;

  RAISE NOTICE 'Builder: %', v_builder_id;
  RAISE NOTICE 'Residenza: %', v_residence_id;
  RAISE NOTICE 'Unità create: %', array_length(v_unit_ids, 1);

  -- ── Item di condominio (scope = 'condominium', unit_id = NULL) ─────────
  FOR v_template IN
    SELECT id, frequency_months, priority
    FROM maintenance_templates
    WHERE scope = 'condominium'
  LOOP
    -- N3 scadute per testare il flusso admin
    v_due := CASE v_template.priority
      WHEN 'N3' THEN CURRENT_DATE - INTERVAL '15 days'
      ELSE CURRENT_DATE + (v_template.frequency_months || ' months')::INTERVAL
    END;

    INSERT INTO maintenance_items (
      template_id, residence_id, unit_id, next_due_date, status
    ) VALUES (
      v_template.id, v_residence_id, NULL,
      v_due,
      CASE WHEN v_due < CURRENT_DATE THEN 'in_attesa' ELSE 'in_attesa' END
    );
  END LOOP;

  -- ── Item di unità (scope = 'unit') — per ogni unità ───────────────────
  FOREACH v_unit_id IN ARRAY v_unit_ids LOOP
    FOR v_template IN
      SELECT id, frequency_months, priority
      FROM maintenance_templates
      WHERE scope = 'unit'
    LOOP
      -- Alcuni N2 in scadenza per testare il flusso cliente
      -- (unità 1 e 2: N2 mensili già scaduti)
      v_due := CASE
        WHEN v_template.priority = 'N2'
             AND v_template.frequency_months <= 1
             AND v_unit_id = v_unit_ids[1]
          THEN CURRENT_DATE - INTERVAL '3 days'
        WHEN v_template.priority = 'N2'
             AND v_template.frequency_months <= 12
             AND v_unit_id = v_unit_ids[2]
          THEN CURRENT_DATE - INTERVAL '7 days'
        ELSE
          CURRENT_DATE + (v_template.frequency_months || ' months')::INTERVAL
      END;

      INSERT INTO maintenance_items (
        template_id, residence_id, unit_id, next_due_date, status
      ) VALUES (
        v_template.id, v_residence_id, v_unit_id,
        v_due,
        'in_attesa'
      );
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Seed completato. Esegui il cron (/api/cron/daily) per marcare gli item scaduti.';

END $$;
