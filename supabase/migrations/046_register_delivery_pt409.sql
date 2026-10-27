-- ============================================================
-- CasaZero — 046: czero_register_delivery, conflitto di data con PT409
-- invece di 40001.
-- APPLICATA a mano nel SQL Editor il 2026-10-27, verificata da Filippo: V1, V2,
-- NEG3 e residui con l'esito atteso (footer). Statement singoli idempotenti
-- (CREATE OR REPLACE, REVOKE/GRANT), nessun BEGIN/COMMIT.
-- ------------------------------------------------------------
-- NUMERAZIONE: 046 e non 044, che resta riservata all'aggiornamento delle
-- RPC di creazione (testata della 042).
--
-- PERCHE: la 045 segnalava "data di consegna cambiata nel frattempo" con
-- SQLSTATE 40001 (serialization_failure). PostgREST tratta 40001 come errore
-- transitorio e RITENTA la transazione: la funzione rifallisce a ogni giro e
-- la richiesta HTTP non risponde mai. Osservato il 27/10 nel test a due
-- schede su Appartamento 6 (teolo): la modale e rimasta su "Salvataggio...",
-- in pg_stat_activity un backend authenticator (pid 369635, pgrst_call
-- czero_register_delivery) girava in loop, terminato a mano con
-- pg_terminate_backend. Il DB non ha scritto nulla: ogni giro e annullato.
-- Fonte: Supabase troubleshooting, "SQLSTATE 40001 (serialization_failure)
-- in an RPC function causes infinite retries" (bug PostgREST 14, corretto
-- in PostgREST 16; raccomandazione: mai errcode 40001 in un RAISE).
--
-- COSA CAMBIA: SOLO l'ERRCODE del conflitto, 40001 -> PT409. Con il
-- prefisso PT PostgREST risponde con lo status HTTP indicato (409 Conflict)
-- e non ritenta. Il resto della funzione e identico alla 045, riga per riga
-- (CREATE OR REPLACE richiede il corpo intero): firma, SECURITY INVOKER,
-- search_path, controlli, scritture, evento, valore di ritorno.
--
-- CODICI D'ERRORE dopo la 046:
--   42501  ruolo non ammesso
--   P0002  unita non trovata (o fuori perimetro RLS)
--   PT409  data di consegna cambiata nel frattempo   (era 40001)
--   22023  piano non valido (motivo nel messaggio)
--
-- DOPO L'APPLY: units/actions.ts mappa 'PT409' (non piu '40001') sul
-- messaggio "La data e stata cambiata da qualcun altro: ricarica la pagina."
-- Tra l'apply e quel commit il conflitto non loopa piu, ma la action lo
-- mostra come "Errore temporaneo... riprova" (ramo default): esito onesto,
-- non bloccante.
-- ============================================================

CREATE OR REPLACE FUNCTION public.czero_register_delivery(
  p_unit_id  uuid,
  p_old_date date,
  p_new_date date,
  p_plan     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_role       user_role := public.czero_user_role();
  v_name       text;
  v_residence  uuid;
  v_current    date;
  v_n_plan     int;
  v_rows       int;
  v_bad_id     uuid;
  v_bad_reason text;
  v_fascicolo  int;
  v_event      uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'czero_register_delivery: solo il super_admin registra una consegna'
      USING ERRCODE = '42501';
  END IF;

  IF p_plan IS NULL OR jsonb_typeof(p_plan) <> 'array' THEN
    RAISE EXCEPTION 'czero_register_delivery: piano non valido: atteso un array'
      USING ERRCODE = '22023';
  END IF;

  IF p_old_date IS NOT DISTINCT FROM p_new_date THEN
    RAISE EXCEPTION 'czero_register_delivery: nessun cambiamento, la data e gia %', p_new_date
      USING ERRCODE = '22023';
  END IF;

  SELECT u.residence_id, u.delivery_date
    INTO v_residence, v_current
    FROM units u
   WHERE u.id = p_unit_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'czero_register_delivery: unita non trovata'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_current IS DISTINCT FROM p_old_date THEN
    RAISE EXCEPTION 'czero_register_delivery: la data di consegna e cambiata nel frattempo (attesa %, trovata %)',
      coalesce(p_old_date::text, 'nessuna'), coalesce(v_current::text, 'nessuna')
      USING ERRCODE = 'PT409';
  END IF;

  PERFORM 1 FROM maintenance_items mi WHERE mi.unit_id = p_unit_id FOR UPDATE;

  SELECT count(*), count(*) - count(DISTINCT p.item_id)
    INTO v_n_plan, v_rows
    FROM jsonb_to_recordset(p_plan) AS p(item_id uuid, nuova_data date);
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'czero_register_delivery: piano non valido: voce ripetuta'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.item_id,
         CASE
           WHEN p.item_id IS NULL                              THEN 'item_id mancante'
           WHEN mi.id IS NULL OR mi.unit_id IS DISTINCT FROM p_unit_id
                                                               THEN 'non appartiene all unita'
           WHEN mi.activation_status <> 'inclusa'              THEN 'fuori piano'
           WHEN coalesce(mi.completion_mode, mt.completion_mode) = 'promemoria'
                                                               THEN 'promemoria'
           WHEN EXISTS (SELECT 1 FROM completions c WHERE c.item_id = mi.id)
                                                               THEN 'nel fascicolo'
         END
    INTO v_bad_id, v_bad_reason
    FROM jsonb_to_recordset(p_plan) AS p(item_id uuid, nuova_data date)
    LEFT JOIN maintenance_items mi     ON mi.id = p.item_id
    LEFT JOIN maintenance_templates mt ON mt.id = mi.template_id
   WHERE p.item_id IS NULL
      OR mi.id IS NULL
      OR mi.unit_id IS DISTINCT FROM p_unit_id
      OR mi.activation_status <> 'inclusa'
      OR coalesce(mi.completion_mode, mt.completion_mode) = 'promemoria'
      OR EXISTS (SELECT 1 FROM completions c WHERE c.item_id = mi.id)
   LIMIT 1;
  IF v_bad_reason IS NOT NULL THEN
    RAISE EXCEPTION 'czero_register_delivery: piano non valido: voce % %', v_bad_id, v_bad_reason
      USING ERRCODE = '22023';
  END IF;

  SELECT mi.id
    INTO v_bad_id
    FROM maintenance_items mi
    JOIN maintenance_templates mt ON mt.id = mi.template_id
   WHERE mi.unit_id = p_unit_id
     AND mi.activation_status = 'inclusa'
     AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
     AND NOT EXISTS (SELECT 1 FROM completions c WHERE c.item_id = mi.id)
     AND mi.id NOT IN (SELECT p.item_id FROM jsonb_to_recordset(p_plan) AS p(item_id uuid, nuova_data date))
   LIMIT 1;
  IF v_bad_id IS NOT NULL THEN
    RAISE EXCEPTION 'czero_register_delivery: piano non valido: voce % ricalcolabile assente dal piano', v_bad_id
      USING ERRCODE = '22023';
  END IF;

  UPDATE units SET delivery_date = p_new_date WHERE id = p_unit_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'czero_register_delivery: unita non aggiornata (% righe)', v_rows
      USING ERRCODE = '42501';
  END IF;

  UPDATE maintenance_items mi
     SET next_due_date = p.nuova_data,
         status        = 'in_attesa'
    FROM jsonb_to_recordset(p_plan) AS p(item_id uuid, nuova_data date)
   WHERE mi.id = p.item_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> v_n_plan THEN
    RAISE EXCEPTION 'czero_register_delivery: voci aggiornate % su %', v_rows, v_n_plan
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)
    INTO v_fascicolo
    FROM maintenance_items mi
    JOIN maintenance_templates mt ON mt.id = mi.template_id
   WHERE mi.unit_id = p_unit_id
     AND mi.activation_status = 'inclusa'
     AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
     AND EXISTS (SELECT 1 FROM completions c WHERE c.item_id = mi.id);

  SELECT pr.full_name INTO v_name FROM profiles pr WHERE pr.id = v_uid;

  INSERT INTO activity_events
    (residence_id, unit_id, event_type, actor_id, actor_role, actor_name, payload)
  VALUES
    (v_residence, p_unit_id, 'data_consegna_modificata', v_uid, v_role, v_name,
     jsonb_build_object(
       'livello',           'unita',
       'vecchio',           p_old_date,
       'nuovo',             p_new_date,
       'ricalcolate',       v_n_plan,
       'saltate_fascicolo', v_fascicolo))
  RETURNING id INTO v_event;

  RETURN jsonb_build_object(
    'event_id',          v_event,
    'ricalcolate',       v_n_plan,
    'saltate_fascicolo', v_fascicolo);
END;
$$;

COMMENT ON FUNCTION public.czero_register_delivery(uuid, date, date, jsonb) IS
  'Registra la consegna di un unita: units.delivery_date, next_due_date delle voci del piano (planDeliveryRecalc), evento data_consegna_modificata. SECURITY INVOKER: il perimetro e la RLS del super_admin. Tutto o niente.';

REVOKE EXECUTE ON FUNCTION public.czero_register_delivery(uuid, date, date, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.czero_register_delivery(uuid, date, date, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.czero_register_delivery(uuid, date, date, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICA POST-APPLY (footer da compilare con l'output REALE)
-- Gli stessi statement, decommentati, erano in supabase/maintenance/test_046.sql
-- (file temporaneo, cancellato dopo aver compilato questo footer).
-- ============================================================
-- V1. Funzione presente, INVOKER, search_path fissato, ERRCODE nuovo nel
-- corpo e vecchio assente.
-- Atteso: czero_register_delivery | false | {search_path=public} | true | false
-- SELECT p.proname, p.prosecdef, p.proconfig,
--        p.prosrc LIKE '%ERRCODE = ''PT409''%' AS ha_pt409,
--        p.prosrc LIKE '%ERRCODE = ''40001''%' AS ha_40001
--   FROM pg_proc p
--  WHERE p.proname = 'czero_register_delivery';
-- ESITO (27/10): czero_register_delivery | false | {search_path=public} |
--        ha_pt409 true | ha_40001 false. Come atteso.

-- V2. EXECUTE solo ad authenticated (e ai ruoli di sistema), non ad anon.
-- Atteso: authenticated, postgres, service_role. PUBLIC e anon assenti.
-- Va eseguita SEMPRE dopo l'apply (lezione della 045: il primo REVOKE puo
-- non prendere effetto senza errore). Se PUBLIC o anon compaiono: rilanciare
-- da soli i tre statement REVOKE/GRANT e rifare la V2, riportando entrambe.
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
--  WHERE routine_schema = 'public' AND routine_name = 'czero_register_delivery'
--  ORDER BY grantee;
-- ESITO (27/10): authenticated, postgres, service_role. PUBLIC e anon
--        assenti al primo colpo, nessun rilancio dei REVOKE/GRANT.

-- ------------------------------------------------------------
-- NEGATIVO 3 (aggiornato) — data vecchia non coincidente: respinta con
-- PT409, e NIENTE scritto. Stessa fixture della 045 (Portello, unita A1
-- 4818141d-242c-4351-8dcd-005337afeb2b, super_admin
-- 99b90ec5-6a80-4ec3-8884-377163c5510b).
-- Differenza dalla 045: gli eventi data_consegna_modificata non sono piu 0
-- (consegne reali registrate dal 27/10), quindi si confronta il conteggio
-- PRIMA e DOPO la chiamata, non con 0.
-- Il test gira nel SQL Editor, non via PostgREST: nessun loop possibile
-- anche se il codice fosse ancora 40001; in quel caso scatta WHEN OTHERS e
-- l'esito e FALLITO con il codice reale.
-- ATTESO: ESITO 046 NEG3: OK, PT409 -> ... cambiata nel frattempo ... | data invariata, eventi invariati
-- ------------------------------------------------------------
-- DO $$
-- DECLARE v_old date; v_plan jsonb; v_msg text; v_state text; v_after date; v_ev_before int; v_ev_after int;
-- BEGIN
--   SELECT delivery_date INTO v_old FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';
--   SELECT count(*) INTO v_ev_before FROM public.activity_events WHERE event_type = 'data_consegna_modificata';
--   SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', mi.id, 'nuova_data', '2027-11-02')), '[]'::jsonb) INTO v_plan
--     FROM public.maintenance_items mi JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--    WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b' AND mi.activation_status = 'inclusa'
--      AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--      AND NOT EXISTS (SELECT 1 FROM public.completions c WHERE c.item_id = mi.id);
--   PERFORM set_config('request.jwt.claims', '{"sub":"99b90ec5-6a80-4ec3-8884-377163c5510b","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   BEGIN
--     PERFORM public.czero_register_delivery('4818141d-242c-4351-8dcd-005337afeb2b',
--       coalesce(v_old + 1, '2000-01-01'::date), coalesce(v_old + 2, '2000-01-02'::date), v_plan);
--   EXCEPTION
--     WHEN SQLSTATE 'PT409' THEN
--       v_msg := SQLERRM; v_state := SQLSTATE;
--     WHEN OTHERS THEN
--       RAISE EXCEPTION 'ESITO 046 NEG3: FALLITO, codice % -> %', SQLSTATE, SQLERRM;
--   END;
--   SELECT delivery_date INTO v_after FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';
--   SELECT count(*) INTO v_ev_after FROM public.activity_events WHERE event_type = 'data_consegna_modificata';
--   IF v_msg IS NOT NULL AND v_after IS NOT DISTINCT FROM v_old AND v_ev_after = v_ev_before THEN
--     RAISE EXCEPTION 'ESITO 046 NEG3: OK, % -> % | data invariata, eventi invariati (%)', v_state, v_msg, v_ev_after;
--   END IF;
--   RAISE EXCEPTION 'ESITO 046 NEG3: FALLITO, errore %, data prima % dopo %, eventi prima % dopo %',
--     coalesce(v_msg, 'nessuno'), v_old, v_after, v_ev_before, v_ev_after;
-- END $$;
-- ESITO (27/10): ESITO 046 NEG3: OK, PT409 -> la data di consegna e cambiata
--        nel frattempo (attesa 2026-06-02, trovata 2026-06-01) | data invariata,
--        eventi invariati (5).

-- ------------------------------------------------------------
-- CONTROLLO RESIDUI — dopo NEG3. ATTESO: data di A1 uguale a quella letta
-- da NEG3 (2026-06-01 al 26/10, salvo modifiche reali da allora).
-- ------------------------------------------------------------
-- SELECT delivery_date AS data_a1 FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';
-- ESITO (27/10): data_a1 2026-06-01, uguale a quella letta da NEG3.

-- ------------------------------------------------------------
-- PROVA DAL VIVO (dopo il commit della mappa PT409): test a due schede su
-- un'unita di teolo. ATTESO: la seconda conferma mostra entro pochi secondi
-- "La data e stata cambiata da qualcun altro: ricarica la pagina.", e
-- pg_stat_activity (usename = 'authenticator') non ha query active su
-- czero_register_delivery.
-- ESITO (27/10, dopo c8c954f): OK. Due schede su teolo: la seconda conferma
--        mostra in pochi secondi "La data e stata cambiata da qualcun altro:
--        ricarica la pagina.", pg_stat_activity pulito dopo il conflitto.
