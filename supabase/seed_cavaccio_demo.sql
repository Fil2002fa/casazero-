-- ============================================================
-- CasaZero — Seed demo Residenza Cavaccio (M5 — presentazione Furlan)
--
-- IDEMPOTENTE: può essere ri-eseguito. Cancella solo i dati demo
-- di Cavaccio (suppliers, completions, documents) e li ricrea.
-- NON tocca residenza, unità, maintenance_items di struttura,
-- né altre residenze.
--
-- Prerequisito: seed_dev.sql già eseguito (residenza + 27 item).
--
-- Come eseguire: Supabase Dashboard → SQL Editor → incolla e Run.
--
-- Come ri-eseguire (es. dopo aggiornamenti demo): stessa cosa,
-- cancella e ricrea solo i dati elencati sopra.
-- ============================================================

DO $$
DECLARE
  v_residence_id  UUID;
  v_unit1_id      UUID;
  v_unit2_id      UUID;

  v_sup_termoidr  UUID;
  v_sup_elettrico UUID;
  v_sup_coperture UUID;
  v_sup_spurghi   UUID;

  v_item_id       UUID;
BEGIN

  -- ── 0. Trova Residenza Cavaccio ───────────────────────────────────────────
  SELECT id INTO v_residence_id
  FROM residences WHERE name = 'Residenza Cavaccio' LIMIT 1;

  IF v_residence_id IS NULL THEN
    RAISE EXCEPTION 'Residenza Cavaccio non trovata. Esegui prima seed_dev.sql';
  END IF;

  SELECT id INTO v_unit1_id FROM units
  WHERE residence_id = v_residence_id AND label = 'Unità 1';

  SELECT id INTO v_unit2_id FROM units
  WHERE residence_id = v_residence_id AND label = 'Unità 2';

  RAISE NOTICE 'Residenza Cavaccio: %', v_residence_id;
  RAISE NOTICE 'Unità 1: %  |  Unità 2: %', v_unit1_id, v_unit2_id;

  -- ── 1. Pulizia dati demo precedenti (idempotente) ────────────────────────
  DELETE FROM completions WHERE residence_id = v_residence_id;
  DELETE FROM documents    WHERE residence_id = v_residence_id;
  DELETE FROM suppliers    WHERE residence_id = v_residence_id;

  -- Reset override su tutti gli item (supplier_id, warranty_info, priority, frequency)
  UPDATE maintenance_items
  SET supplier_id       = NULL,
      warranty_info     = NULL,
      priority          = NULL,
      frequency_months  = NULL
  WHERE residence_id = v_residence_id;

  -- Reset status/next_due degli item di Unità 1 e Unità 2
  -- (li riassegniamo sotto con gli stati demo)
  UPDATE maintenance_items
  SET status        = 'in_attesa',
      next_due_date = CURRENT_DATE + INTERVAL '6 months'
  WHERE residence_id = v_residence_id
    AND unit_id IN (v_unit1_id, v_unit2_id);

  -- ── 2. Fornitori ──────────────────────────────────────────────────────────
  INSERT INTO suppliers (residence_id, name, phone, email, categories)
  VALUES (v_residence_id,
          'Termo-idraulica Rossi Srl',
          '+39 0434 512345',
          'info@termoidraulica-rossi.it',
          ARRAY['Termico','Ventilazione'])
  RETURNING id INTO v_sup_termoidr;

  INSERT INTO suppliers (residence_id, name, phone, email, categories)
  VALUES (v_residence_id,
          'Bortoluzzi Impianti Elettrici',
          '+39 0434 678901',
          'info@bortoluzziimpianti.it',
          ARRAY['Elettrico','Fotovoltaico'])
  RETURNING id INTO v_sup_elettrico;

  INSERT INTO suppliers (residence_id, name, phone, email, categories)
  VALUES (v_residence_id,
          'Coperture Friulane Srl',
          '+39 0434 234567',
          'lavori@coperturefriulane.it',
          ARRAY['Coperture','Sicurezza'])
  RETURNING id INTO v_sup_coperture;

  INSERT INTO suppliers (residence_id, name, phone, email, categories)
  VALUES (v_residence_id,
          'Idroservice Pordenone',
          '+39 0434 890123',
          'info@idroservice-pn.it',
          ARRAY['Spurghi'])
  RETURNING id INTO v_sup_spurghi;

  RAISE NOTICE '4 fornitori creati';

  -- ── 3. supplier_id + warranty_info su maintenance_items ──────────────────
  UPDATE maintenance_items mi
  SET supplier_id   = v_sup_termoidr,
      warranty_info = 'Garanzia costruttore 5 anni — impianto termico e riscaldamento a pavimento'
  WHERE mi.residence_id = v_residence_id
    AND mi.template_id IN (SELECT id FROM maintenance_templates WHERE category = 'Termico');

  UPDATE maintenance_items mi
  SET supplier_id   = v_sup_termoidr,
      warranty_info = 'Garanzia costruttore 2 anni — sistema VMC Zehnder ComfoAir Q350'
  WHERE mi.residence_id = v_residence_id
    AND mi.template_id IN (SELECT id FROM maintenance_templates WHERE category = 'Ventilazione');

  UPDATE maintenance_items mi
  SET supplier_id   = v_sup_elettrico,
      warranty_info = 'Garanzia costruttore 5 anni — impianto elettrico'
  WHERE mi.residence_id = v_residence_id
    AND mi.template_id IN (SELECT id FROM maintenance_templates WHERE category = 'Elettrico');

  UPDATE maintenance_items mi
  SET supplier_id   = v_sup_elettrico,
      warranty_info = 'Garanzia costruttore 10 anni — moduli FV; 5 anni — inverter SolarEdge SE3K'
  WHERE mi.residence_id = v_residence_id
    AND mi.template_id IN (SELECT id FROM maintenance_templates WHERE category = 'Fotovoltaico');

  UPDATE maintenance_items mi
  SET supplier_id = v_sup_coperture
  WHERE mi.residence_id = v_residence_id
    AND mi.template_id IN (SELECT id FROM maintenance_templates WHERE category IN ('Coperture','Sicurezza'));

  UPDATE maintenance_items mi
  SET supplier_id = v_sup_spurghi
  WHERE mi.residence_id = v_residence_id
    AND mi.template_id IN (SELECT id FROM maintenance_templates WHERE category = 'Spurghi');

  -- ── 4. Spread stati — Unità 1 ─────────────────────────────────────────────
  -- 3 N2 scadute → card rosse in home
  UPDATE maintenance_items SET status = 'scaduta', next_due_date = CURRENT_DATE - 8
  WHERE residence_id = v_residence_id AND unit_id = v_unit1_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Test differenziale impianto elettrico');

  UPDATE maintenance_items SET status = 'scaduta', next_due_date = CURRENT_DATE - 12
  WHERE residence_id = v_residence_id AND unit_id = v_unit1_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Test differenziale generale FV');

  UPDATE maintenance_items SET status = 'scaduta', next_due_date = CURRENT_DATE - 5
  WHERE residence_id = v_residence_id AND unit_id = v_unit1_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Controllo serramenti');

  -- 2 N1 con scadenza passata → sezione Consigliate
  UPDATE maintenance_items SET status = 'in_attesa', next_due_date = CURRENT_DATE - 3
  WHERE residence_id = v_residence_id AND unit_id = v_unit1_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Controllo visivo prese e comandi');

  UPDATE maintenance_items SET status = 'in_attesa', next_due_date = CURRENT_DATE - 6
  WHERE residence_id = v_residence_id AND unit_id = v_unit1_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Controllo inverter e quadri FV');

  -- 1 N2 quasi in scadenza (+7 giorni) → avviso imminente
  UPDATE maintenance_items SET status = 'in_attesa', next_due_date = CURRENT_DATE + 7
  WHERE residence_id = v_residence_id AND unit_id = v_unit1_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Pulizia filtri unità interne A/C');

  -- ── 5. Spread stati — Unità 2 ─────────────────────────────────────────────
  -- 3 N2 scadute → card rosse
  UPDATE maintenance_items SET status = 'scaduta', next_due_date = CURRENT_DATE - 20
  WHERE residence_id = v_residence_id AND unit_id = v_unit2_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Carica refrigerante climatizzazione');

  UPDATE maintenance_items SET status = 'scaduta', next_due_date = CURRENT_DATE - 35
  WHERE residence_id = v_residence_id AND unit_id = v_unit2_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Pressione vasi di espansione');

  UPDATE maintenance_items SET status = 'scaduta', next_due_date = CURRENT_DATE - 9
  WHERE residence_id = v_residence_id AND unit_id = v_unit2_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Test differenziale impianto elettrico');

  -- ── 6. Spread stati — Condominio ──────────────────────────────────────────
  -- N3 in_corso (admin ha già preso in carico)
  UPDATE maintenance_items SET status = 'in_corso', next_due_date = CURRENT_DATE - 18
  WHERE residence_id = v_residence_id AND unit_id IS NULL
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Fosse biologiche e condensa grassi: pulizia');

  -- N3 scaduta (da prendere in carico)
  UPDATE maintenance_items SET status = 'scaduta', next_due_date = CURRENT_DATE - 10
  WHERE residence_id = v_residence_id AND unit_id IS NULL
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Pozzetti di ispezione e condotte: pulizia');

  -- ── 7. Completions — storico 12 mesi (lug 2025 – mag 2026) ───────────────

  -- 2025-07-10 | VMC: sostituzione filtri | Unità 1 | Rossi Srl
  SELECT id INTO v_item_id FROM maintenance_items
  WHERE residence_id = v_residence_id AND unit_id = v_unit1_id
    AND template_id = (SELECT id FROM maintenance_templates WHERE title = 'VMC: sostituzione filtri');
  IF v_item_id IS NOT NULL THEN
    INSERT INTO completions
      (item_id, unit_id, residence_id, completed_at, performed_by_name, notes)
    VALUES (v_item_id, v_unit1_id, v_residence_id,
            '2025-07-10', 'Termo-idraulica Rossi Srl',
            'Filtri G4 sostituiti. Portata aria verificata a norma UNI EN 13141.');
    UPDATE maintenance_items
    SET status = 'in_attesa', next_due_date = '2026-07-10' WHERE id = v_item_id;
  END IF;

  -- 2025-09-20 | Condotti evacuazione vapori cottura | Unità 1 | Rossi Srl
  SELECT id INTO v_item_id FROM maintenance_items
  WHERE residence_id = v_residence_id AND unit_id = v_unit1_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Condotti evacuazione vapori di cottura');
  IF v_item_id IS NOT NULL THEN
    INSERT INTO completions
      (item_id, unit_id, residence_id, completed_at, performed_by_name, notes)
    VALUES (v_item_id, v_unit1_id, v_residence_id,
            '2025-09-20', 'Termo-idraulica Rossi Srl',
            'Condotto cappa aspirante pulito e sgombro. Griglia di uscita verificata.');
    UPDATE maintenance_items
    SET status = 'in_attesa', next_due_date = '2026-09-20' WHERE id = v_item_id;
  END IF;

  -- 2025-10-05 | Pulizia grondaie | Condominio | Coperture Friulane
  SELECT id INTO v_item_id FROM maintenance_items
  WHERE residence_id = v_residence_id AND unit_id IS NULL
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Pulizia grondaie e canali di gronda');
  IF v_item_id IS NOT NULL THEN
    INSERT INTO completions
      (item_id, unit_id, residence_id, completed_at, performed_by_name, notes)
    VALUES (v_item_id, NULL, v_residence_id,
            '2025-10-05', 'Coperture Friulane Srl',
            'Grondaie liberate da fogliame autunnale e detriti. Calate pluviali sbloccate.');
    UPDATE maintenance_items
    SET status = 'in_attesa', next_due_date = '2027-10-05' WHERE id = v_item_id;
  END IF;

  -- 2025-10-20 | VMC: pulizia condotti | Unità 2 | Rossi Srl
  SELECT id INTO v_item_id FROM maintenance_items
  WHERE residence_id = v_residence_id AND unit_id = v_unit2_id
    AND template_id = (SELECT id FROM maintenance_templates WHERE title = 'VMC: pulizia condotti');
  IF v_item_id IS NOT NULL THEN
    INSERT INTO completions
      (item_id, unit_id, residence_id, completed_at, performed_by_name, notes)
    VALUES (v_item_id, v_unit2_id, v_residence_id,
            '2025-10-20', 'Termo-idraulica Rossi Srl',
            'Condotti puliti con spazzole rotanti. Nessuna ostruzione. Portata regolare.');
    UPDATE maintenance_items
    SET status = 'in_attesa', next_due_date = '2026-06-20' WHERE id = v_item_id;
  END IF;

  -- 2025-11-10 | Verifica linee vita | Condominio | Coperture Friulane
  SELECT id INTO v_item_id FROM maintenance_items
  WHERE residence_id = v_residence_id AND unit_id IS NULL
    AND template_id = (SELECT id FROM maintenance_templates WHERE title = 'Verifica linee vita');
  IF v_item_id IS NOT NULL THEN
    INSERT INTO completions
      (item_id, unit_id, residence_id, completed_at, performed_by_name, notes)
    VALUES (v_item_id, NULL, v_residence_id,
            '2025-11-10', 'Coperture Friulane Srl',
            'Linee vita certificate UNI EN 795. Tutti gli ancoraggi conformi. Prossima verifica: nov 2026.');
    UPDATE maintenance_items
    SET status = 'in_attesa', next_due_date = '2026-11-10' WHERE id = v_item_id;
  END IF;

  -- 2026-01-15 | Controllo serramenti | Unità 2 | Marco Ferretti
  SELECT id INTO v_item_id FROM maintenance_items
  WHERE residence_id = v_residence_id AND unit_id = v_unit2_id
    AND template_id = (SELECT id FROM maintenance_templates WHERE title = 'Controllo serramenti');
  IF v_item_id IS NOT NULL THEN
    INSERT INTO completions
      (item_id, unit_id, residence_id, completed_at, performed_by_name, notes)
    VALUES (v_item_id, v_unit2_id, v_residence_id,
            '2026-01-15', 'Marco Ferretti',
            'Serramenti controllati. Guarnizioni porta-finestra balcone sostituite. Maniglioni lubrificati.');
    UPDATE maintenance_items
    SET status = 'in_attesa', next_due_date = '2026-07-15' WHERE id = v_item_id;
  END IF;

  -- 2026-03-12 | Registrazione libretto impianto | Unità 1 | Luca Marini
  SELECT id INTO v_item_id FROM maintenance_items
  WHERE residence_id = v_residence_id AND unit_id = v_unit1_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Registrazione manutenzione su libretto impianto');
  IF v_item_id IS NOT NULL THEN
    INSERT INTO completions
      (item_id, unit_id, residence_id, completed_at, performed_by_name, notes)
    VALUES (v_item_id, v_unit1_id, v_residence_id,
            '2026-03-12', 'Luca Marini',
            'Libretto impianto aggiornato con interventi stagione invernale 2025/2026.');
    UPDATE maintenance_items
    SET status = 'in_attesa', next_due_date = '2027-03-12' WHERE id = v_item_id;
  END IF;

  -- 2026-05-22 | Pompa circolazione a pavimento | Unità 1 | Rossi Srl
  SELECT id INTO v_item_id FROM maintenance_items
  WHERE residence_id = v_residence_id AND unit_id = v_unit1_id
    AND template_id = (SELECT id FROM maintenance_templates
                       WHERE title = 'Pompa di circolazione impianto a pavimento');
  IF v_item_id IS NOT NULL THEN
    INSERT INTO completions
      (item_id, unit_id, residence_id, completed_at, performed_by_name, notes)
    VALUES (v_item_id, v_unit1_id, v_residence_id,
            '2026-05-22', 'Termo-idraulica Rossi Srl',
            'Pompa Grundfos ALPHA3 verificata. Portata e pressione nei parametri. Antigelo al 30% confermato.');
    UPDATE maintenance_items
    SET status = 'in_attesa', next_due_date = '2027-05-22' WHERE id = v_item_id;
  END IF;

  RAISE NOTICE '8 completions create (lug 2025 – mag 2026)';

  -- ── 8. Documenti (metadati; file placeholder in Storage) ─────────────────
  INSERT INTO documents
    (residence_id, unit_id, category, title, storage_path, file_name, file_date)
  VALUES
    -- APE residenza (scope: tutta la residenza)
    (v_residence_id, NULL, 'energetici',
     'Attestato di Prestazione Energetica (APE) — Classe A2',
     'demo/APE_ResidenzaCavaccio_2023.pdf',
     'APE_ResidenzaCavaccio_2023.pdf',
     '2023-02-15'),

    -- Dichiarazione di conformità impianto FV
    (v_residence_id, NULL, 'conformita',
     'Dichiarazione di Conformità Impianto Fotovoltaico',
     'demo/DichConformita_FV_Cavaccio_2023.pdf',
     'DichConformita_FV_Cavaccio_2023.pdf',
     '2023-03-01'),

    -- Manuale VMC
    (v_residence_id, NULL, 'tecnici',
     'Manuale d''uso e manutenzione VMC Zehnder ComfoAir Q350',
     'demo/Manuale_VMC_Zehnder_ComfoAirQ350.pdf',
     'Manuale_VMC_Zehnder_ComfoAirQ350.pdf',
     '2023-03-01'),

    -- Certificato di garanzia inverter FV
    (v_residence_id, NULL, 'tecnici',
     'Certificato di garanzia inverter SolarEdge SE3K',
     'demo/Garanzia_Inverter_SolarEdge_SE3K.pdf',
     'Garanzia_Inverter_SolarEdge_SE3K.pdf',
     '2023-03-01'),

    -- Planimetria catastale Unità 1 (scope: unità specifica)
    (v_residence_id, v_unit1_id, 'proprieta',
     'Planimetria catastale — Unità 1',
     'demo/Planimetria_Unit1_Cavaccio.pdf',
     'Planimetria_Unit1_Cavaccio.pdf',
     '2023-02-20');

  RAISE NOTICE '5 documenti creati';

  -- ── Riepilogo finale ──────────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '══ Seed demo Cavaccio completato ══════════════════════';
  RAISE NOTICE 'Fornitori:    4 (Rossi, Bortoluzzi, Coperture Friulane, Idroservice)';
  RAISE NOTICE 'Completions:  8  (lug 2025 – mag 2026)';
  RAISE NOTICE 'Documenti:    5  (APE, FV, VMC, garanzia inverter, planimetria)';
  RAISE NOTICE '';
  RAISE NOTICE 'Stati Unità 1:  3 scadute N2, 2 consigliate N1, 1 quasi-scadenza (+7gg)';
  RAISE NOTICE 'Stati Unità 2:  3 scadute N2';
  RAISE NOTICE 'Condominio:     1 in_corso N3, 1 scaduta N3';
  RAISE NOTICE '';
  RAISE NOTICE 'Account demo: assegna il tuo profilo con uno di questi snippet:';
  RAISE NOTICE '  -- Super admin:';
  RAISE NOTICE '  UPDATE profiles SET role = ''super_admin'',';
  RAISE NOTICE '    builder_id = (SELECT builder_id FROM residences WHERE name = ''Residenza Cavaccio'')';
  RAISE NOTICE '    WHERE id = auth.uid();';
  RAISE NOTICE '';
  RAISE NOTICE '  -- Client (Unità 1):';
  RAISE NOTICE '  INSERT INTO unit_members (unit_id, profile_id, started_at, is_primary)';
  RAISE NOTICE '  VALUES ((SELECT id FROM units WHERE residence_id = (SELECT id FROM residences WHERE name = ''Residenza Cavaccio'') AND label = ''Unità 1''), auth.uid(), CURRENT_DATE, true);';
  RAISE NOTICE '';
  RAISE NOTICE '  -- Admin di condominio:';
  RAISE NOTICE '  UPDATE profiles SET role = ''admin'',';
  RAISE NOTICE '    builder_id = (SELECT builder_id FROM residences WHERE name = ''Residenza Cavaccio'')';
  RAISE NOTICE '    WHERE id = auth.uid();';
  RAISE NOTICE '  INSERT INTO admin_assignments (profile_id, residence_id)';
  RAISE NOTICE '  VALUES (auth.uid(), (SELECT id FROM residences WHERE name = ''Residenza Cavaccio''));';
  RAISE NOTICE '═══════════════════════════════════════════════════════';

END $$;
