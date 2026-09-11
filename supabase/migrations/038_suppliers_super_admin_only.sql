-- ============================================================
-- CasaZero — 038: suppliers torna dato interno solo super_admin
-- ANTEPRIMA. Applica Filippo nel SQL Editor; incolla poi l'output
-- della SELECT finale nel footer (convenzione 027/030/031/033/034/035/036).
-- ------------------------------------------------------------
-- CONCERN UNICO: revocare a admin e client l'accesso a suppliers,
-- lasciando solo "suppliers: super_admin gestisce" (002_rls.sql:417-425,
-- invariata) come unica policy sulla tabella.
--
-- DECISIONE DI PRODOTTO CHE LA MOTIVA (inverte la 036): fornitore è il
-- subappaltatore del costruttore, dato interno visibile solo al
-- super_admin — non un dato che l'amministratore di condominio gestisce
-- né che il residente legge.
--
-- COSA TOGLIE:
--   • "suppliers: lettura se si ha accesso alla residenza" (002:413-415)
--     — SELECT aperta a super_admin, admin assegnato e client della residenza.
--   • "suppliers: admin gestisce quelli delle residenze assegnate" (036:107-116)
--     — ALL per admin sulle residenze assegnate.
--
-- COSA RESTA: "suppliers: super_admin gestisce" (002:417-425), FOR ALL,
-- già scoped al builder del super_admin. Copre da sola SELECT/INSERT/
-- UPDATE/DELETE per quel ruolo: nessuna nuova policy da scrivere.
--
-- GRANTS: invariati. authenticated ha già privilegio a livello di tabella
-- (031:138); il confinamento resta interamente nelle policy RLS.
--
-- completions: fuori scope, nessuna FK verso suppliers (036:79-84).
--
-- IDEMPOTENTE: DROP POLICY IF EXISTS.
-- ============================================================

DROP POLICY IF EXISTS "suppliers: lettura se si ha accesso alla residenza" ON suppliers;
DROP POLICY IF EXISTS "suppliers: admin gestisce quelli delle residenze assegnate" ON suppliers;

-- ============================================================
-- AUTO-VERIFICA (ultima istruzione: il suo output va nel footer)
--   Atteso: 1 sola riga — "suppliers: super_admin gestisce" | ALL | using valorizzato, with_check NULL
-- ============================================================
SELECT policyname, cmd, permissive, roles::text AS roles,
       qual AS using_expr, with_check AS with_check_expr
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'suppliers'
 ORDER BY policyname;

-- ============================================================
--
-- -- ESITO REALE (applicata da Filippo il __/__/2026) --
--
-- 1. Righe restituite dall'auto-verifica (atteso 1):
--
-- 2. Conferma che admin e client non compaiono più in nessuna policy su suppliers:
--
-- CONCLUSIONE:
-- ============================================================
