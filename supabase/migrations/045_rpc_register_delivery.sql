-- ============================================================
-- CasaZero — 045: RPC czero_register_delivery, registra la consegna di
-- un'unita applicando il piano calcolato da planDeliveryRecalc.
-- APPLICATA a mano nel SQL Editor il 2026-10-26, verificata da Filippo:
-- V1, V2, blocco 0, NEG1-NEG6, POS e residui con l'esito atteso (footer).
-- Statement singoli idempotenti (CREATE OR REPLACE, REVOKE/GRANT), nessun
-- BEGIN/COMMIT.
-- ------------------------------------------------------------
-- NUMERAZIONE: 045 e non 044 perche la testata della 042 riserva la 044
-- all'aggiornamento delle RPC di creazione (cascata in SQL).
--
-- COSA FA, in UNA transazione (una chiamata di funzione e un solo
-- statement: qualunque errore annulla tutto, registro compreso):
--   1. units.delivery_date = nuova data
--   2. next_due_date (e status = 'in_attesa') delle voci del piano
--   3. una riga activity_events 'data_consegna_modificata', livello unita
-- La funzione NON calcola le date: le riceve dal piano TS (resolveDueBasis +
-- nextDueFrom, unica aritmetica). Fa da rete di sicurezza: rifiuta un piano
-- che tocchi voci che non deve toccare.
--
-- PERCHE' SECURITY INVOKER (verificato sulle policy, non presunto):
-- il super_admin del builder ha gia una policy per ognuna delle tre scritture.
--   - units UPDATE:          "units: super_admin aggiorna"
--                            002_rls.sql:168-176 (ruolo + residenza del builder)
--   - maintenance_items UPD: "items: super_admin gestisce tutto" FOR ALL
--                            002_rls.sql:286-294; il guard per colonne
--                            (042 sezione 5) blocca solo l'admin
--   - activity_events INS:   "activity_events: super_admin registra"
--                            037_activity_events.sql:139-153 (ruolo, actor_id =
--                            auth.uid(), residenza del builder, unita coerente)
--                            + GRANT INSERT a authenticated (037:184-186)
-- Letture necessarie, anch'esse coperte: units/maintenance_items/completions
-- SELECT via czero_can_access_* (002:154-156, 278-284, 304-310),
-- maintenance_templates leggibili da ogni autenticato (002:267-269),
-- profiles "legge il proprio" (002:187-189) per il nome dell'attore.
-- Con INVOKER la RLS resta il perimetro: un super_admin di un altro builder
-- non vede l'unita (errore "unita non trovata"), e nessun ramo DEFINER puo
-- scavalcare una policy per sbaglio.
--
-- CONTROLLO DI RUOLO IN TESTA COMUNQUE: senza, un admin vedrebbe l'unita
-- (residenza assegnata), l'UPDATE su units toccherebbe 0 righe in silenzio e
-- quello sulle voci passerebbe (la sua allowlist include next_due_date).
-- Il conteggio delle righe scritte e verificato lo stesso, come seconda rete.
--
-- RETE DI SICUREZZA SUL PIANO: errore se una voce del piano
--   - non appartiene all'unita,
--   - non e 'inclusa' (fuori piano),
--   - e promemoria (completion_mode effettivo, voce ?? template),
--   - ha almeno un completamento (il fascicolo vince sul modello),
--   - compare due volte.
-- AGGIUNTA OLTRE LA RICHIESTA, approvata il 26/10: errore anche se il piano NON
-- copre una voce ricalcolabile dell'unita (piano incompleto). Senza, un
-- piano parziale lascerebbe voci con la scadenza della vecchia consegna.
--
-- CONCORRENZA: p_old_date e la data che l'anteprima ha visto. La riga di
-- units e letta FOR UPDATE: due registrazioni concorrenti si serializzano e
-- la seconda trova una data diversa da quella attesa -> errore 40001, niente
-- scritto. Le voci sono bloccate FOR UPDATE prima dei controlli: un
-- completamento concorrente aspetta il commit e poi riscrive la scadenza da
-- completed_at (czero_recalc_due), che e l'esito giusto.
--
-- STATUS = 'in_attesa' sulle voci ricalcolate (approvato il 26/10): stesso gesto
-- di czero_recalc_due (003_m2.sql:22-27). Il cron imposta 'scaduta'
-- (api/cron/daily/route.ts:94) ma non la toglie mai: senza questo reset una
-- voce spostata nel futuro resterebbe 'scaduta' nel DB. Le voci che nascono
-- gia scadute le rimarca il cron al giro successivo.
--
-- CODICI D'ERRORE, perche l'app distingua l'esito senza leggere il testo:
--   42501  ruolo non ammesso
--   P0002  unita non trovata (o fuori perimetro RLS)
--   40001  data di consegna cambiata nel frattempo
--   22023  piano non valido (motivo nel messaggio)
--
-- LIMITI NOTI
--   1. La regola "ogni modifica della data di consegna finisce nel registro"
--      (decisione del 24/10) e garantita dal CODICE APPLICATIVO, non dal DB.
--      Con SECURITY INVOKER la stessa policy che permette alla RPC di
--      scrivere ("units: super_admin aggiorna", 002_rls.sql:168-176) lascia
--      al super_admin anche l'UPDATE diretto di units.delivery_date via
--      PostgREST, senza passare dalla RPC e quindi senza riga nel registro.
--      Idem per next_due_date ("items: super_admin gestisce tutto").
--   2. RINFORZO IN CODA, commit separato (vedi handoff): scrittura di
--      units.delivery_date solo via RPC. Due vincoli da sapere PRIMA di
--      scriverlo:
--      a) un REVOKE UPDATE (delivery_date) ON units FROM authenticated da
--         solo NON basta: authenticated ha UPDATE a livello di TABELLA, e un
--         privilegio di tabella copre tutte le colonne a prescindere dai
--         REVOKE di colonna. Va revocato l'UPDATE di tabella e ri-concesso
--         per colonna solo dove serve. Al 26/10 l'app non aggiorna units
--         con il client di sessione: l'unico UPDATE (label) passa dal
--         service client (units/actions.ts:241), che i GRANT non vedono.
--      b) questa RPC e INVOKER: gira come authenticated, quindi dopo il
--         revoke perderebbe lei stessa il diritto di scrivere delivery_date.
--         Il rinforzo implica il passaggio a SECURITY DEFINER, con il
--         controllo di ruolo e builder ESPLICITO in testa (la RLS non
--         farebbe piu da perimetro) e SET search_path gia presente.
--
-- PAYLOAD DELL'EVENTO (contratto della 043 + conteggi):
--   { "livello": "unita", "vecchio": "YYYY-MM-DD"|null, "nuovo": "YYYY-MM-DD"|null,
--     "ricalcolate": <int>, "saltate_fascicolo": <int> }
-- Attore dalla sessione (auth.uid(), ruolo e nome congelati), mai da
-- parametro: stesso antispoofing di activity-log.ts.
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
      USING ERRCODE = '40001';
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
-- ============================================================
-- V1. Funzione presente, INVOKER, search_path fissato.
-- Atteso: czero_register_delivery | f | {search_path=public}
-- SELECT p.proname, p.prosecdef, p.proconfig FROM pg_proc p
--  WHERE p.proname = 'czero_register_delivery';
-- ESITO (26/10): czero_register_delivery | false | {search_path=public}.
--        INVOKER e search_path fissato, come atteso.

-- V2. EXECUTE solo ad authenticated (e ai ruoli di sistema), non ad anon.
-- Atteso: authenticated presente, anon e PUBLIC assenti
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
--  WHERE routine_schema = 'public' AND routine_name = 'czero_register_delivery'
--  ORDER BY grantee;
-- ESITO (26/10): authenticated, postgres, service_role. PUBLIC e anon
--        assenti.
--        PRIMO APPLY DEI PERMESSI SENZA EFFETTO: la prima V2 mostrava
--        ancora PUBLIC e anon (il default di Postgres concede EXECUTE a
--        PUBLIC alla creazione della funzione). REVOKE/GRANT rilanciati da
--        soli, V2 rifatta: l'esito sopra e quello della seconda. Lezione:
--        la V2 va sempre eseguita, un REVOKE nello stesso script della
--        CREATE non va dato per applicato.

-- ============================================================
-- TEST — un blocco DO per test, una sola esecuzione ciascuno. Ogni ramo
-- termina in RAISE EXCEPTION: rollback totale sempre, nessun test lascia
-- righe. Il banner rosso e voluto: conta il testo dopo ESITO.
-- UUID reali (riverificati il 26/10, blocco 0 della 042): Portello
-- adf97f32-859a-493e-b145-915979f1ae09, unita A1
-- 4818141d-242c-4351-8dcd-005337afeb2b, super_admin
-- 99b90ec5-6a80-4ec3-8884-377163c5510b, admin
-- 7a210c85-7816-4d5f-b802-176505947469. La data attuale di A1 e il piano si
-- leggono dentro il blocco, come postgres, PRIMA di cambiare ruolo: il test
-- non dipende da una data copiata a mano.
-- FIXTURE DEL FASCICOLO (NEG2): nessuna voce di unita di Portello e nel
-- fascicolo (scenari-date-consegna.md:51-55), e Cavaccio, dove stanno i
-- completamenti su voci di unita, NON e piu sul builder Furlan: passo1.sql
-- l'ha parcheggiata su "Archivio pre-demo" (passo1.sql:81-93,
-- passo2.sql:61). Con INVOKER il super_admin di Furlan non la vede: il
-- rifiuto arriverebbe da "unita non trovata", non dal controllo del
-- fascicolo. Percio NEG2 cerca la voce in QUALUNQUE builder (il blocco 0
-- mostra quale) e, come postgres e dentro il DO, punta temporaneamente
-- profiles.builder_id del super_admin sul builder di quella residenza.
-- Il RAISE finale annulla anche questo: nessuna riga cambia davvero.
-- Non si inserisce un completamento finto: completions non si tocca,
-- nemmeno in un test annullato.
-- ============================================================

-- ------------------------------------------------------------
-- BLOCCO 0 — fixture. ATTESO: data di A1 qualunque, ricalcolabili_a1 > 0,
-- promemoria_a1 > 0, fascicolo_a1 = 0, voce_fascicolo valorizzata (con
-- residenza e builder: atteso Cavaccio su Archivio pre-demo).
-- ------------------------------------------------------------
-- SELECT
--   (SELECT delivery_date FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b') AS data_a1,
--   (SELECT count(*) FROM public.maintenance_items mi JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--     WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b' AND mi.activation_status = 'inclusa'
--       AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--       AND NOT EXISTS (SELECT 1 FROM public.completions c WHERE c.item_id = mi.id)) AS ricalcolabili_a1,
--   (SELECT count(*) FROM public.maintenance_items mi JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--     WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b'
--       AND coalesce(mi.completion_mode, mt.completion_mode) = 'promemoria') AS promemoria_a1,
--   (SELECT count(*) FROM public.maintenance_items mi
--     WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b'
--       AND EXISTS (SELECT 1 FROM public.completions c WHERE c.item_id = mi.id)) AS fascicolo_a1,
--   f.voce_fascicolo, f.unita_fascicolo, f.residenza_fascicolo, f.builder_fascicolo
--   FROM (SELECT 1) AS uno
--   LEFT JOIN LATERAL (
--     SELECT mi.id AS voce_fascicolo, mi.unit_id AS unita_fascicolo,
--            r.name AS residenza_fascicolo, b.name AS builder_fascicolo
--       FROM public.maintenance_items mi
--       JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--       JOIN public.residences r ON r.id = mi.residence_id
--       JOIN public.builders b ON b.id = r.builder_id
--      WHERE mi.unit_id IS NOT NULL
--        AND mi.activation_status = 'inclusa'
--        AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--        AND EXISTS (SELECT 1 FROM public.completions c WHERE c.item_id = mi.id)
--      ORDER BY mi.id LIMIT 1
--   ) AS f ON true;
-- ESITO (26/10): data_a1 2026-06-01, voce_fascicolo
--        2e33ac9f-63ac-450f-964e-326758b19d83. Gli altri campi
--        (ricalcolabili_a1, promemoria_a1, fascicolo_a1, residenza e builder
--        della voce) non sono stati riportati: NEG2, NEG4 e NEG6 passati
--        implicano che A1 ha voci ricalcolabili e promemoria e che la voce
--        nel fascicolo esiste, ma i valori non sono annotati.

-- ------------------------------------------------------------
-- NEGATIVO 1 — l'admin e respinto, anche sull'unita della residenza che
-- amministra e con un piano valido.
-- ATTESO: ESITO 045 NEG1: OK, 42501 -> ... solo il super_admin registra una consegna
-- ------------------------------------------------------------
-- DO $$
-- DECLARE v_old date; v_plan jsonb;
-- BEGIN
--   SELECT delivery_date INTO v_old FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';
--   SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', mi.id, 'nuova_data', '2027-11-02')), '[]'::jsonb) INTO v_plan
--     FROM public.maintenance_items mi JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--    WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b' AND mi.activation_status = 'inclusa'
--      AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--      AND NOT EXISTS (SELECT 1 FROM public.completions c WHERE c.item_id = mi.id);
--   PERFORM set_config('request.jwt.claims', '{"sub":"7a210c85-7816-4d5f-b802-176505947469","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   BEGIN
--     PERFORM public.czero_register_delivery('4818141d-242c-4351-8dcd-005337afeb2b', v_old,
--       coalesce(v_old + 1, '2026-11-02'::date), v_plan);
--   EXCEPTION WHEN insufficient_privilege THEN
--     RAISE EXCEPTION 'ESITO 045 NEG1: OK, 42501 -> %', SQLERRM;
--   END;
--   RAISE EXCEPTION 'ESITO 045 NEG1: FALLITO, l admin ha registrato la consegna (annullato)';
-- END $$;
-- ESITO (26/10): OK.

-- ------------------------------------------------------------
-- NEGATIVO 2 — piano con una voce nel fascicolo: respinto. Voce e unita dal
-- blocco 0 (qualunque builder, atteso Cavaccio su Archivio pre-demo). Il
-- builder del super_admin e puntato su quello della residenza, come
-- postgres e dentro il DO (annullato dal RAISE finale). Piano completo di
-- quell'unita PIU la voce con completamenti, cosi il rifiuto viene dal
-- controllo del fascicolo e non da quello di completezza.
-- ATTESO: ESITO 045 NEG2: OK, 22023 -> ... voce <uuid> nel fascicolo
-- ------------------------------------------------------------
-- DO $$
-- DECLARE v_item uuid; v_unit uuid; v_builder uuid; v_old date; v_plan jsonb;
-- BEGIN
--   SELECT mi.id, mi.unit_id, r.builder_id INTO v_item, v_unit, v_builder
--     FROM public.maintenance_items mi
--     JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--     JOIN public.residences r ON r.id = mi.residence_id
--    WHERE mi.unit_id IS NOT NULL
--      AND mi.activation_status = 'inclusa'
--      AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--      AND EXISTS (SELECT 1 FROM public.completions c WHERE c.item_id = mi.id)
--    ORDER BY mi.id LIMIT 1;
--   IF v_item IS NULL THEN
--     RAISE EXCEPTION 'ESITO 045 NEG2: INATTESO, nessuna voce di unita nel fascicolo in tutto il DB';
--   END IF;
--   UPDATE public.profiles SET builder_id = v_builder WHERE id = '99b90ec5-6a80-4ec3-8884-377163c5510b';
--   SELECT delivery_date INTO v_old FROM public.units WHERE id = v_unit;
--   SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', mi.id, 'nuova_data', '2027-11-02')), '[]'::jsonb) INTO v_plan
--     FROM public.maintenance_items mi JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--    WHERE mi.unit_id = v_unit AND mi.activation_status = 'inclusa'
--      AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--      AND NOT EXISTS (SELECT 1 FROM public.completions c WHERE c.item_id = mi.id);
--   v_plan := v_plan || jsonb_build_array(jsonb_build_object('item_id', v_item, 'nuova_data', '2027-11-02'));
--   PERFORM set_config('request.jwt.claims', '{"sub":"99b90ec5-6a80-4ec3-8884-377163c5510b","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   BEGIN
--     PERFORM public.czero_register_delivery(v_unit, v_old, coalesce(v_old + 1, '2026-11-02'::date), v_plan);
--   EXCEPTION WHEN invalid_parameter_value THEN
--     IF SQLERRM LIKE '%' || v_item::text || ' nel fascicolo' THEN
--       RAISE EXCEPTION 'ESITO 045 NEG2: OK, 22023 -> %', SQLERRM;
--     END IF;
--     RAISE EXCEPTION 'ESITO 045 NEG2: INATTESO -> %', SQLERRM;
--   END;
--   RAISE EXCEPTION 'ESITO 045 NEG2: FALLITO, piano con voce nel fascicolo accettato (annullato)';
-- END $$;
-- ESITO (26/10): OK (voce 2e33ac9f-63ac-450f-964e-326758b19d83).

-- ------------------------------------------------------------
-- NEGATIVO 3 — data vecchia non coincidente: respinta, e NIENTE scritto.
-- p_old_date = data reale + 1 giorno (o 2000-01-01 se A1 non ha data), nuova
-- = + 2 giorni, cosi non scatta prima il controllo "nessun cambiamento". Dopo
-- l'errore si rilegge: data di A1 invariata e nessun evento del tipo nuovo.
-- ATTESO: ESITO 045 NEG3: OK, 40001 -> ... cambiata nel frattempo ... | data invariata, 0 eventi
-- ------------------------------------------------------------
-- DO $$
-- DECLARE v_old date; v_plan jsonb; v_msg text; v_after date; v_ev int;
-- BEGIN
--   SELECT delivery_date INTO v_old FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';
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
--   EXCEPTION WHEN serialization_failure THEN
--     v_msg := SQLERRM;
--   END;
--   SELECT delivery_date INTO v_after FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';
--   SELECT count(*) INTO v_ev FROM public.activity_events WHERE event_type = 'data_consegna_modificata';
--   IF v_msg IS NOT NULL AND v_after IS NOT DISTINCT FROM v_old AND v_ev = 0 THEN
--     RAISE EXCEPTION 'ESITO 045 NEG3: OK, 40001 -> % | data invariata, 0 eventi', v_msg;
--   END IF;
--   RAISE EXCEPTION 'ESITO 045 NEG3: FALLITO, errore %, data prima % dopo %, eventi %', coalesce(v_msg, 'nessuno'), v_old, v_after, v_ev;
-- END $$;
-- ESITO (26/10): OK.

-- ------------------------------------------------------------
-- NEGATIVO 4 — promemoria nel piano: respinto.
-- ATTESO: ESITO 045 NEG4: OK, 22023 -> ... voce <uuid> promemoria
-- ------------------------------------------------------------
-- DO $$
-- DECLARE v_old date; v_plan jsonb; v_prom uuid;
-- BEGIN
--   SELECT delivery_date INTO v_old FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';
--   SELECT mi.id INTO v_prom FROM public.maintenance_items mi JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--    WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b'
--      AND coalesce(mi.completion_mode, mt.completion_mode) = 'promemoria'
--    ORDER BY mi.id LIMIT 1;
--   SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', mi.id, 'nuova_data', '2027-11-02')), '[]'::jsonb) INTO v_plan
--     FROM public.maintenance_items mi JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--    WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b' AND mi.activation_status = 'inclusa'
--      AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--      AND NOT EXISTS (SELECT 1 FROM public.completions c WHERE c.item_id = mi.id);
--   v_plan := v_plan || jsonb_build_array(jsonb_build_object('item_id', v_prom, 'nuova_data', '2027-11-02'));
--   PERFORM set_config('request.jwt.claims', '{"sub":"99b90ec5-6a80-4ec3-8884-377163c5510b","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   BEGIN
--     PERFORM public.czero_register_delivery('4818141d-242c-4351-8dcd-005337afeb2b', v_old,
--       coalesce(v_old + 1, '2026-11-02'::date), v_plan);
--   EXCEPTION WHEN invalid_parameter_value THEN
--     IF SQLERRM LIKE '%' || v_prom::text || ' promemoria' THEN
--       RAISE EXCEPTION 'ESITO 045 NEG4: OK, 22023 -> %', SQLERRM;
--     END IF;
--     RAISE EXCEPTION 'ESITO 045 NEG4: INATTESO -> %', SQLERRM;
--   END;
--   RAISE EXCEPTION 'ESITO 045 NEG4: FALLITO, promemoria accettata (annullato)';
-- END $$;
-- ESITO (26/10): OK.

-- ------------------------------------------------------------
-- NEGATIVO 5 — voce di un'altra unita nel piano: respinta. La voce e presa
-- da un'altra unita di Portello.
-- ATTESO: ESITO 045 NEG5: OK, 22023 -> ... voce <uuid> non appartiene all unita
-- ------------------------------------------------------------
-- DO $$
-- DECLARE v_old date; v_plan jsonb; v_other uuid;
-- BEGIN
--   SELECT delivery_date INTO v_old FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';
--   SELECT mi.id INTO v_other FROM public.maintenance_items mi
--    WHERE mi.residence_id = 'adf97f32-859a-493e-b145-915979f1ae09'
--      AND mi.unit_id IS NOT NULL AND mi.unit_id <> '4818141d-242c-4351-8dcd-005337afeb2b'
--    ORDER BY mi.id LIMIT 1;
--   SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', mi.id, 'nuova_data', '2027-11-02')), '[]'::jsonb) INTO v_plan
--     FROM public.maintenance_items mi JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--    WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b' AND mi.activation_status = 'inclusa'
--      AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--      AND NOT EXISTS (SELECT 1 FROM public.completions c WHERE c.item_id = mi.id);
--   v_plan := v_plan || jsonb_build_array(jsonb_build_object('item_id', v_other, 'nuova_data', '2027-11-02'));
--   PERFORM set_config('request.jwt.claims', '{"sub":"99b90ec5-6a80-4ec3-8884-377163c5510b","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   BEGIN
--     PERFORM public.czero_register_delivery('4818141d-242c-4351-8dcd-005337afeb2b', v_old,
--       coalesce(v_old + 1, '2026-11-02'::date), v_plan);
--   EXCEPTION WHEN invalid_parameter_value THEN
--     IF SQLERRM LIKE '%' || v_other::text || ' non appartiene all unita' THEN
--       RAISE EXCEPTION 'ESITO 045 NEG5: OK, 22023 -> %', SQLERRM;
--     END IF;
--     RAISE EXCEPTION 'ESITO 045 NEG5: INATTESO -> %', SQLERRM;
--   END;
--   RAISE EXCEPTION 'ESITO 045 NEG5: FALLITO, voce di altra unita accettata (annullato)';
-- END $$;
-- ESITO (26/10): OK.

-- ------------------------------------------------------------
-- NEGATIVO 6 (aggiunta approvata il 26/10: controllo di completezza)
-- — piano a cui manca una voce ricalcolabile: respinto.
-- ATTESO: ESITO 045 NEG6: OK, 22023 -> ... ricalcolabile assente dal piano
-- ------------------------------------------------------------
-- DO $$
-- DECLARE v_old date; v_plan jsonb;
-- BEGIN
--   SELECT delivery_date INTO v_old FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';
--   SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', mi.id, 'nuova_data', '2027-11-02')), '[]'::jsonb) INTO v_plan
--     FROM public.maintenance_items mi JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--    WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b' AND mi.activation_status = 'inclusa'
--      AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--      AND NOT EXISTS (SELECT 1 FROM public.completions c WHERE c.item_id = mi.id);
--   v_plan := v_plan - 0;
--   PERFORM set_config('request.jwt.claims', '{"sub":"99b90ec5-6a80-4ec3-8884-377163c5510b","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   BEGIN
--     PERFORM public.czero_register_delivery('4818141d-242c-4351-8dcd-005337afeb2b', v_old,
--       coalesce(v_old + 1, '2026-11-02'::date), v_plan);
--   EXCEPTION WHEN invalid_parameter_value THEN
--     IF SQLERRM LIKE '%ricalcolabile assente dal piano' THEN
--       RAISE EXCEPTION 'ESITO 045 NEG6: OK, 22023 -> %', SQLERRM;
--     END IF;
--     RAISE EXCEPTION 'ESITO 045 NEG6: INATTESO -> %', SQLERRM;
--   END;
--   RAISE EXCEPTION 'ESITO 045 NEG6: FALLITO, piano incompleto accettato (annullato)';
-- END $$;
-- ESITO (26/10): OK.

-- ------------------------------------------------------------
-- POSITIVO — il super_admin registra la consegna di A1 con il piano
-- completo. Si rileggono le tre scritture: data di A1, voci con la nuova
-- scadenza, evento con il payload. Poi RAISE: tutto annullato.
-- ATTESO: ESITO 045 POS: OK, data <nuova>, voci <n> su <n>, evento {livello: unita, ...}
-- ------------------------------------------------------------
-- DO $$
-- DECLARE v_old date; v_new date; v_plan jsonb; v_n int; v_res jsonb;
--         v_after date; v_items int; v_payload jsonb; v_actor uuid;
-- BEGIN
--   SELECT delivery_date INTO v_old FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';
--   v_new := coalesce(v_old + 1, '2026-11-02'::date);
--   SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', mi.id, 'nuova_data', '2027-11-02')), '[]'::jsonb), count(*)
--     INTO v_plan, v_n
--     FROM public.maintenance_items mi JOIN public.maintenance_templates mt ON mt.id = mi.template_id
--    WHERE mi.unit_id = '4818141d-242c-4351-8dcd-005337afeb2b' AND mi.activation_status = 'inclusa'
--      AND coalesce(mi.completion_mode, mt.completion_mode) IS DISTINCT FROM 'promemoria'
--      AND NOT EXISTS (SELECT 1 FROM public.completions c WHERE c.item_id = mi.id);
--   PERFORM set_config('request.jwt.claims', '{"sub":"99b90ec5-6a80-4ec3-8884-377163c5510b","role":"authenticated"}', true);
--   PERFORM set_config('role', 'authenticated', true);
--   v_res := public.czero_register_delivery('4818141d-242c-4351-8dcd-005337afeb2b', v_old, v_new, v_plan);
--   SELECT delivery_date INTO v_after FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b';
--   SELECT count(*) INTO v_items FROM public.maintenance_items
--    WHERE unit_id = '4818141d-242c-4351-8dcd-005337afeb2b' AND next_due_date = '2027-11-02' AND status = 'in_attesa';
--   SELECT payload, actor_id INTO v_payload, v_actor FROM public.activity_events
--    WHERE id = (v_res->>'event_id')::uuid;
--   IF v_after = v_new AND v_items = v_n AND v_actor = '99b90ec5-6a80-4ec3-8884-377163c5510b'
--      AND v_payload->>'livello' = 'unita' AND (v_payload->>'ricalcolate')::int = v_n
--      AND v_payload->>'nuovo' = v_new::text
--      AND (v_payload->'vecchio' = 'null'::jsonb OR v_payload->>'vecchio' = v_old::text) THEN
--     RAISE EXCEPTION 'ESITO 045 POS: OK, data %, voci % su %, evento %', v_after, v_items, v_n, v_payload;
--   END IF;
--   RAISE EXCEPTION 'ESITO 045 POS: FALLITO, data %, voci % su %, attore %, payload %', v_after, v_items, v_n, v_actor, v_payload;
-- END $$;
-- ESITO (26/10): OK.

-- ------------------------------------------------------------
-- CONTROLLO RESIDUI — dopo tutti i test. ATTESO: data di A1 uguale al
-- blocco 0, 0 eventi data_consegna_modificata.
-- ------------------------------------------------------------
-- SELECT (SELECT delivery_date FROM public.units WHERE id = '4818141d-242c-4351-8dcd-005337afeb2b') AS data_a1,
--        (SELECT count(*) FROM public.activity_events WHERE event_type = 'data_consegna_modificata') AS eventi;
-- ESITO (26/10): data_a1 2026-06-01 (uguale al blocco 0), eventi 0.
--        Nessuna scrittura rimasta dai test, compresa quella del POS.
