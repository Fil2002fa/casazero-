-- ============================================================
-- CasaZero — 054: czero_configure_voce (Configura per voce, 3a-3)
-- ------------------------------------------------------------
-- COSA FA: una funzione che applica in UN'UNICA transazione il piano di
-- scrittura calcolato dal TS (src/lib/maintenance-config.ts, planConfigWrite)
-- alle righe di una voce di una residenza. Se una riga fallisce, nessuna
-- riga cambia. Solo additiva: una funzione nuova, nessuna tabella, nessuna
-- colonna, nessuna policy toccata.
--
-- SECURITY INVOKER (non DEFINER): gira coi permessi del chiamante, quindi
-- RLS e trigger di guardia di maintenance_items restano la barriera reale.
-- La funzione NON allarga l'accesso: ripete dentro di se' i controlli, in
-- modo che un errore sia esplicito (42501) e non uno 0-righe silenzioso.
--
-- CONTROLLI INTERNI, nell'ordine:
--   1. ruolo del chiamante = super_admin (czero_user_role())
--   2. la residenza esiste e il suo builder_id = builder del chiamante
--      (czero_user_builder_id()): nessuna scrittura cross-builder
--   3. p_rows e' un array non vuoto di oggetti, senza id duplicati, con
--      SOLO le chiavi in whitelist: id, completion_mode, priority, status,
--      next_due_date, supplier_id, warranty_info
--   4. status, se presente, puo' valere solo 'in_attesa' (l'unica regola di
--      status del piano: verso promemoria)
--   5. completion_mode e priority viaggiano insieme e coerenti
--      (promemoria=N1, residente=N2, amministratore=N3): dual-write
--   6. ogni id appartiene a QUESTA residenza e a QUESTA voce (mai una lista
--      di id presa per buona)
--   7. ogni fornitore appartiene allo stesso builder della residenza
--   8. dopo l'UPDATE il numero di righe toccate deve essere uguale a quello
--      ricevuto (la RLS filtra in silenzio: 0 righe = errore, rollback)
--
-- COSA NON TOCCA: completions (mai), obligation_type, frequency_months,
-- activation_status, due_basis_override, unit_id, template_id, residence_id.
-- Una chiave assente in una riga lascia la colonna com'e'; una chiave
-- presente con null scrive NULL.
--
-- PERMESSI: REVOKE da PUBLIC e anon; EXECUTE ad authenticated (l'action
-- chiama col client di sessione, cosi' la RLS resta la seconda barriera) e a
-- service_role. Un residente o un admin che la chiamasse riceve 42501.
-- ============================================================
CREATE OR REPLACE FUNCTION public.czero_configure_voce(
  p_residence_id uuid,
  p_template_id  uuid,
  p_rows         jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_builder   uuid;
  v_expected  integer;
  v_distinct  integer;
  v_found     integer;
  v_bad_key   text;
  v_touched   jsonb;
  v_n         integer;
BEGIN
  -- 1. ruolo
  IF public.czero_user_role() IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'permessi insufficienti: solo il super_admin configura una voce'
      USING ERRCODE = '42501';
  END IF;

  -- 2. builder della residenza = builder del chiamante
  SELECT r.builder_id INTO v_builder
    FROM public.residences r
   WHERE r.id = p_residence_id;
  IF v_builder IS NULL OR v_builder IS DISTINCT FROM public.czero_user_builder_id() THEN
    RAISE EXCEPTION 'residenza non accessibile con questo account'
      USING ERRCODE = '42501';
  END IF;

  -- 3. forma del payload e whitelist delle chiavi
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'p_rows deve essere un array non vuoto' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e WHERE jsonb_typeof(e) <> 'object') THEN
    RAISE EXCEPTION 'p_rows: ogni elemento deve essere un oggetto' USING ERRCODE = '22023';
  END IF;

  SELECT k INTO v_bad_key
    FROM jsonb_array_elements(p_rows) e, jsonb_object_keys(e) k
   WHERE k NOT IN ('id', 'completion_mode', 'priority', 'status',
                   'next_due_date', 'supplier_id', 'warranty_info')
   LIMIT 1;
  IF v_bad_key IS NOT NULL THEN
    RAISE EXCEPTION 'p_rows: campo non ammesso: %', v_bad_key USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e WHERE NOT (e ? 'id') OR jsonb_typeof(e->'id') <> 'string') THEN
    RAISE EXCEPTION 'p_rows: id mancante o non valido' USING ERRCODE = '22023';
  END IF;

  v_expected := jsonb_array_length(p_rows);
  SELECT count(DISTINCT (e->>'id')::uuid) INTO v_distinct FROM jsonb_array_elements(p_rows) e;
  IF v_distinct <> v_expected THEN
    RAISE EXCEPTION 'p_rows: id duplicati' USING ERRCODE = '22023';
  END IF;

  -- 4. status: solo in_attesa
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e
              WHERE e ? 'status' AND e->>'status' IS DISTINCT FROM 'in_attesa') THEN
    RAISE EXCEPTION 'p_rows: status ammesso solo in_attesa' USING ERRCODE = '22023';
  END IF;

  -- 5. dual-write coerente tra modalita e priority
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) e
     WHERE (e ? 'completion_mode') <> (e ? 'priority')
        OR ((e ? 'completion_mode') AND (
              e->>'completion_mode' IS NULL OR e->>'priority' IS NULL
              OR (e->>'completion_mode', e->>'priority') NOT IN
                 (('promemoria', 'N1'), ('residente', 'N2'), ('amministratore', 'N3'))))
  ) THEN
    RAISE EXCEPTION 'p_rows: completion_mode e priority devono comparire insieme e coerenti'
      USING ERRCODE = '22023';
  END IF;

  -- 6. ogni id appartiene a questa residenza e a questa voce
  SELECT count(*) INTO v_found
    FROM public.maintenance_items mi
   WHERE mi.residence_id = p_residence_id
     AND mi.template_id  = p_template_id
     AND mi.id IN (SELECT (e->>'id')::uuid FROM jsonb_array_elements(p_rows) e);
  IF v_found <> v_expected THEN
    RAISE EXCEPTION 'p_rows: % righe su % non appartengono a questa voce di questa residenza',
      v_expected - v_found, v_expected USING ERRCODE = 'P0002';
  END IF;

  -- 7. fornitori dello stesso builder della residenza
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) e
     WHERE e ? 'supplier_id' AND e->>'supplier_id' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.suppliers s
                        WHERE s.id = (e->>'supplier_id')::uuid
                          AND s.builder_id = v_builder)
  ) THEN
    RAISE EXCEPTION 'p_rows: fornitore non valido per questo builder' USING ERRCODE = '42501';
  END IF;

  -- UPDATE unico: una chiave assente lascia la colonna, una chiave con null scrive NULL.
  WITH upd AS (
    UPDATE public.maintenance_items mi
       SET completion_mode = CASE WHEN r.e ? 'completion_mode'
                                  THEN (r.e->>'completion_mode')::public.completion_mode
                                  ELSE mi.completion_mode END,
           priority        = CASE WHEN r.e ? 'priority'
                                  THEN (r.e->>'priority')::public.maintenance_priority
                                  ELSE mi.priority END,
           status          = CASE WHEN r.e ? 'status'
                                  THEN (r.e->>'status')::public.maintenance_status
                                  ELSE mi.status END,
           next_due_date   = CASE WHEN r.e ? 'next_due_date'
                                  THEN (r.e->>'next_due_date')::date
                                  ELSE mi.next_due_date END,
           supplier_id     = CASE WHEN r.e ? 'supplier_id'
                                  THEN (r.e->>'supplier_id')::uuid
                                  ELSE mi.supplier_id END,
           warranty_info   = CASE WHEN r.e ? 'warranty_info'
                                  THEN r.e->>'warranty_info'
                                  ELSE mi.warranty_info END
      FROM (SELECT e, (e->>'id')::uuid AS id FROM jsonb_array_elements(p_rows) e) r
     WHERE mi.id = r.id
       AND mi.residence_id = p_residence_id
       AND mi.template_id  = p_template_id
    RETURNING mi.id
  )
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb), count(*) INTO v_touched, v_n FROM upd;

  -- 8. la RLS filtra in silenzio: meno righe del previsto = errore e rollback di tutto.
  IF v_n <> v_expected THEN
    RAISE EXCEPTION 'aggiornate % righe su % previste: nessuna modifica applicata', v_n, v_expected
      USING ERRCODE = '42501';
  END IF;

  RETURN v_touched;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.czero_configure_voce(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.czero_configure_voce(uuid, uuid, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.czero_configure_voce(uuid, uuid, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.czero_configure_voce(uuid, uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
