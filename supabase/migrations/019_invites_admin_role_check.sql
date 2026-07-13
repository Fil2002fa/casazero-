-- ============================================================
-- CasaZero — 019: WITH CHECK su invites per l'admin (role='client')
-- Applicata a mano nel SQL Editor il 2026-07-13.
-- ------------------------------------------------------------
-- Motivo: "invites: admin can insert for assigned" (002_rls.sql)
-- verificava solo czero_user_role()='admin' AND czero_can_access_residence
-- (residence_id), senza vincolare la colonna role dell'invito creato. Un
-- admin di residenza poteva inserire un invito con role='super_admin' per
-- la propria residenza; welcome/[token]/accept/page.tsx (service role)
-- applica invite.role as-is al profilo che accetta → escalation a
-- super_admin builder-wide, non solo sulla residenza dell'admin.
--
-- Verifica dei flussi legittimi (grep .from('invites').insert in src/),
-- prima dell'apply: TUTTI i 4 call site (createAdminInvite,
-- createInvite, createBulkInvites, createFamilyInvite) usano il service
-- role (createServiceClient), che bypassa questa policy a prescindere.
-- Nessun flusso applicativo passa mai dalla RLS "authenticated" su
-- invites — il vincolo aggiunto chiude solo l'accesso diretto all'API
-- Supabase bypassando i server action, senza toccare l'app.
-- ============================================================

DROP POLICY IF EXISTS "invites: admin can insert for assigned" ON public.invites;

CREATE POLICY "invites: admin can insert for assigned"
  ON public.invites FOR INSERT
  WITH CHECK (
    czero_user_role() = 'admin'
    AND role = 'client'
    AND czero_can_access_residence(residence_id)
  );

-- ============================================================
-- VERIFICA POST-APPLY (footer standard, eseguito il 2026-07-13):
-- with_check confermato in pg_policies con role = 'client'.
-- ============================================================
-- SELECT policyname, cmd, with_check
-- FROM pg_policies
-- WHERE tablename = 'invites' AND policyname = 'invites: admin can insert for assigned';

-- ============================================================
-- TEST NEGATIVO (eseguito il 2026-07-13): violazione RLS — admin
-- (filippoloro02) non può più creare un invito role='super_admin'
-- sulla propria residenza.
-- ============================================================
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"7a210c85-7816-4d5f-b802-176505947469"}';
-- INSERT INTO public.invites (residence_id, role, expires_at)
-- VALUES ('0bef3332-9302-4515-94a6-04d6a8a7d7a8', 'super_admin', now() + interval '30 days');
-- RESET ROLE;

-- ============================================================
-- TEST POSITIVO (eseguito il 2026-07-13): INSERT ok, cleanup fatto —
-- lo stesso admin può ancora creare un invito role='client' sulla
-- propria residenza.
-- ============================================================
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"7a210c85-7816-4d5f-b802-176505947469"}';
-- INSERT INTO public.invites (residence_id, role, expires_at)
-- VALUES ('0bef3332-9302-4515-94a6-04d6a8a7d7a8', 'client', now() + interval '30 days')
-- RETURNING id;
-- RESET ROLE;
-- -- DELETE FROM public.invites WHERE id = '<id restituito>';
