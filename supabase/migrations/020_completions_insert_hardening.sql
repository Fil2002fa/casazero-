-- ============================================================
-- CasaZero — 020: hardening INSERT su completions (performed_by + scope)
-- Applicata a mano nel SQL Editor il 2026-07-13, verificata da Filippo
-- (test negativi: spoofing performed_by_profile_id e residence_id
-- incoerente entrambi respinti da RLS; test positivi: completamento
-- client su unità propria e completamento admin su item condominiale
-- unit_id NULL entrambi passati, eseguiti in transazione con ROLLBACK
-- per non sporcare il fascicolo immutabile).
-- ------------------------------------------------------------
-- Motivo: la policy INSERT precedente (008_rls_completions_hardening.sql)
-- verificava solo l'accesso a unit_id (client) o residence_id (admin),
-- non che performed_by_profile_id fosse davvero il chiamante né che
-- residence_id corrispondesse alla vera residenza di unit_id. Un client
-- poteva attribuire il completamento a un altro profilo o forzare un
-- residence_id di una residenza diversa dalla propria unità — dati
-- falsi permanenti nel fascicolo legale (completions è immutabile,
-- nessuna policy UPDATE/DELETE esiste).
--
-- Verifica dei flussi legittimi (completeN2 e completeN3), prima
-- dell'apply: performed_by_profile_id è sempre auth.uid() in entrambi;
-- unit_id è NULL solo per completeN3 (item a scope condominio) — da qui
-- la clausola (unit_id IS NULL OR residence_id = vera residenza di
-- unit_id), altrimenti i completamenti condominiali legittimi si
-- sarebbero bloccati.
-- ============================================================

DROP POLICY IF EXISTS "completions: inserimento autorizzato" ON public.completions;

CREATE POLICY "completions: inserimento autorizzato"
  ON public.completions FOR INSERT
  WITH CHECK (
    (
      (czero_user_role() = 'client' AND unit_id IS NOT NULL AND czero_can_access_unit(unit_id))
      OR (czero_user_role() = 'admin' AND czero_can_access_residence(residence_id))
    )
    AND performed_by_profile_id = auth.uid()
    AND (unit_id IS NULL OR residence_id = (SELECT residence_id FROM units WHERE id = unit_id))
  );

-- ============================================================
-- VERIFICA POST-APPLY (footer standard, eseguita il 2026-07-13):
-- with_check confermato in pg_policies con le due clausole aggiuntive.
-- ============================================================
-- SELECT policyname, cmd, with_check
-- FROM pg_policies
-- WHERE tablename = 'completions' AND policyname = 'completions: inserimento autorizzato';

-- ============================================================
-- TEST NEGATIVO A (client attribuisce il completamento a un altro
-- profilo) — respinto da RLS.
-- ============================================================
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"e4535056-d48a-4cf6-b632-de563e442f01"}';
-- INSERT INTO public.completions (item_id, unit_id, residence_id, completed_at, performed_by_profile_id)
-- VALUES ('3fbe8fbf-5315-4b18-8f28-84d3dafa2aab', '2a36ab36-c17e-4648-a5c0-dbdbde61c593', '45196dac-bd81-4368-9452-1c066652e464', CURRENT_DATE, '99b90ec5-6a80-4ec3-8884-377163c5510b');
-- RESET ROLE;

-- ============================================================
-- TEST NEGATIVO B (client forza residence_id diverso dalla vera
-- residenza dell'unità) — respinto da RLS.
-- ============================================================
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"e4535056-d48a-4cf6-b632-de563e442f01"}';
-- INSERT INTO public.completions (item_id, unit_id, residence_id, completed_at, performed_by_profile_id)
-- VALUES ('3fbe8fbf-5315-4b18-8f28-84d3dafa2aab', '2a36ab36-c17e-4648-a5c0-dbdbde61c593', '3bdf4d00-85ae-4707-9def-80cd1cd4b0e4', CURRENT_DATE, 'e4535056-d48a-4cf6-b632-de563e442f01');
-- RESET ROLE;

-- ============================================================
-- TEST POSITIVO A (client completa la propria unità, dati corretti) —
-- eseguito in transazione con ROLLBACK, nessun dato lasciato sul DB.
-- ============================================================
-- BEGIN;
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"e4535056-d48a-4cf6-b632-de563e442f01"}';
-- INSERT INTO public.completions (item_id, unit_id, residence_id, completed_at, performed_by_profile_id)
-- VALUES ('3fbe8fbf-5315-4b18-8f28-84d3dafa2aab', '2a36ab36-c17e-4648-a5c0-dbdbde61c593', '45196dac-bd81-4368-9452-1c066652e464', CURRENT_DATE, 'e4535056-d48a-4cf6-b632-de563e442f01')
-- RETURNING id;
-- RESET ROLE;
-- ROLLBACK;

-- ============================================================
-- TEST POSITIVO B (admin completa item condominiale, unit_id NULL) —
-- eseguito in transazione con ROLLBACK.
-- ============================================================
-- BEGIN;
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"7a210c85-7816-4d5f-b802-176505947469"}';
-- INSERT INTO public.completions (item_id, residence_id, completed_at, performed_by_profile_id, performed_by_name)
-- VALUES ('e001527e-db55-4113-9cee-56e8915cf9e5', '0bef3332-9302-4515-94a6-04d6a8a7d7a8', CURRENT_DATE, '7a210c85-7816-4d5f-b802-176505947469', 'Test verbale')
-- RETURNING id;
-- RESET ROLE;
-- ROLLBACK;
