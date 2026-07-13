-- ============================================================
-- CasaZero — 018: privilegi per colonna su profiles (authenticated)
-- Applicata a mano nel SQL Editor il 2026-07-13.
-- ------------------------------------------------------------
-- Motivo: la RLS "profiles: aggiorna il proprio" (002_rls.sql) verifica
-- solo id = auth.uid(), senza WITH CHECK sulle colonne. Con i GRANT di
-- default di Supabase (UPDATE concesso su tutte le colonne ad
-- authenticated), qualunque utente autenticato poteva scrivere
-- direttamente role/builder_id sul proprio profilo (UPDATE profiles SET
-- role='super_admin', builder_id=<qualsiasi> WHERE id=auth.uid()) e
-- auto-promuoversi, bypassando il gate applicativo del callback OTP.
--
-- Verifica dei flussi legittimi (grep .from('profiles').update in src/),
-- prima dell'apply: solo tre colonne sono scritte dal client autenticato:
--   - full_name          (admin/settings/actions.ts: updateAccountProfile)
--   - notification_prefs (app/profilo/actions.ts: updateNotificationPrefs;
--                          admin/settings/actions.ts: updateAdminNotificationPrefs)
--   - updated_at         (accompagna sempre le due sopra)
-- L'unica scrittura di role/builder_id è welcome/[token]/accept/page.tsx,
-- che usa il service role (bypassa RLS/GRANT, non tocca questo blocco).
-- ============================================================

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, notification_prefs, updated_at) ON public.profiles TO authenticated;

-- ============================================================
-- VERIFICA POST-APPLY (footer standard, eseguito il 2026-07-13):
-- risultato confermato — solo full_name, notification_prefs, updated_at
-- concesse in UPDATE ad authenticated.
-- ============================================================
-- SELECT column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE grantee = 'authenticated' AND table_schema = 'public'
--   AND table_name = 'profiles' AND privilege_type = 'UPDATE'
-- ORDER BY column_name;

-- ============================================================
-- TEST NEGATIVO (eseguito il 2026-07-13): ERROR permission denied for
-- column role — admin (filippoloro02) non può più auto-promuoversi.
-- ============================================================
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"7a210c85-7816-4d5f-b802-176505947469"}';
-- UPDATE public.profiles
-- SET role = 'super_admin', builder_id = '9923adbe-cfb4-47d3-b939-747bb30bcfe2'
-- WHERE id = '7a210c85-7816-4d5f-b802-176505947469';
-- RESET ROLE;

-- ============================================================
-- TEST POSITIVO (eseguito il 2026-07-13): UPDATE 1, nessun errore —
-- il flusso legittimo (residente aggiorna notification_prefs) continua
-- a funzionare.
-- ============================================================
-- SET ROLE authenticated;
-- SET request.jwt.claims = '{"sub":"e4535056-d48a-4cf6-b632-de563e442f01"}';
-- UPDATE public.profiles
-- SET notification_prefs = notification_prefs, updated_at = now()
-- WHERE id = 'e4535056-d48a-4cf6-b632-de563e442f01';
-- RESET ROLE;
