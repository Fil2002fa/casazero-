-- ============================================================
-- CasaZero — 031: hardening grants (privilegi che scavalcano la RLS)
-- ANTEPRIMA. Applica Filippo nel SQL Editor; poi esegue le query di
-- verifica in fondo e incolla l'output reale nel footer. SOLO grants:
-- nessun seed, nessuna RPC, nessun wizard, nessuna modifica a policy RLS.
-- ------------------------------------------------------------
-- CONCERN UNICO: togliere ad `authenticated` i privilegi che NON passano
-- dalla RLS, su TUTTE le tabelle public. Emerso dall'audit della 030:
-- col GRANT ALL di default di Supabase, authenticated aveva su ogni
-- tabella anche TRUNCATE, TRIGGER, REFERENCES. La RLS non li filtra:
--   • TRUNCATE  -> svuota l'intera tabella scavalcando le policy;
--   • TRIGGER   -> creazione trigger sulla tabella;
--   • REFERENCES-> creazione FK verso la tabella.
--
-- `completions` e in cima: e il fascicolo legale, dichiarato IMMUTABILE in
-- CLAUDE.md (nessuna policy UPDATE/DELETE -> scritture bloccate). Ma
-- TRUNCATE, non passando dalla RLS, permetteva di azzerarlo: contraddizione
-- diretta dell'invariante, e argomento commerciale del prodotto. Va chiuso.
--
-- NOTA DI ACCURATEZZA (agli atti): TRUNCATE/TRIGGER/REFERENCES non sono
-- raggiungibili via l'API PostgREST (che espone solo SELECT/INSERT/UPDATE/
-- DELETE/RPC). Il rischio e a livello di privilegio SQL, non un endpoint
-- sfruttabile dal client SDK. Si chiude comunque: difesa in profondita e
-- allineamento all'invariante di immutabilita.
--
-- COSA NON TOCCA questa migrazione:
--   • INSERT/UPDATE/DELETE: sono gated dalla RLS; rimuoverli richiede
--     verificare policy per policy quali scritture legittime passano da
--     client autenticato. Le tabelle dove sono concessi ma nessuna policy
--     li usa sono elencate in coda (commento) per valutazione separata.
--   • anon: stesso concern (ha i medesimi grant di default), ma qui lo
--     scope e authenticated. Il parallelo per anon e annotato in coda.
--   • le policy RLS: invariate.
--
-- REVOKE esplicite tabella per tabella (non un DO block dinamico): il file
-- deve documentare per iscritto ogni tabella toccata.
-- ============================================================

-- ------------------------------------------------------------
-- completions PER PRIMA — invariante "fascicolo immutabile" (CLAUDE.md)
-- ------------------------------------------------------------
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.completions FROM authenticated;

-- ------------------------------------------------------------
-- Tutte le altre tabelle public (ordine alfabetico)
-- ------------------------------------------------------------
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.admin_assignments            FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.attachments                  FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.builders                     FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.comments                     FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.document_checklist_template  FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.documents                    FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.invites                      FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.maintenance_items            FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.maintenance_templates        FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.notifications                FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.profiles                     FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.residence_checklist_exception FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.residences                   FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.suppliers                    FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.unit_members                 FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.units                        FROM authenticated;
-- residence_features: gia ridotta a SELECT dalla 030 (revoca inclusa li).
-- Ripetuta qui per idempotenza e per rendere il file un registro completo
-- di "ogni tabella public e hardened". No-op se la 030 e gia applicata.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.residence_features           FROM authenticated;

-- ------------------------------------------------------------
-- DEFAULT PRIVILEGES — altrimenti la PROSSIMA tabella creata rinasce con
-- ALL (incluso TRUNCATE) per authenticated, riaprendo il buco. pg_default_acl
-- mostra due ruoli concedenti: postgres e supabase_admin (entrambi 'arwdDxtm').
-- Le future tabelle create via SQL Editor/migrazioni sono di proprieta di
-- `postgres`: e quello il default che conta, e lo correggiamo attivamente.
-- ------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;

-- supabase_admin: secondo ruolo concedente storico. `ALTER DEFAULT
-- PRIVILEGES FOR ROLE supabase_admin` richiede l'appartenenza a quel ruolo
-- (postgres in Supabase NON e superuser): probabile "permission denied".
-- Lasciata COMMENTATA per non far fallire la migrazione; le tabelle nuove
-- dei nostri cicli sono postgres-owned, quindi la riga sopra basta. Esegui
-- questa solo se hai un ruolo con privilegi sufficienti.
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--   REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;

-- PostgREST: ricarica la schema-cache dopo modifiche ai privilegi.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICA POST-APPLY (eseguire dopo l'apply; incollare l'output reale nel
-- footer ESITO REALE, che resta vuoto: Claude non applica DDL).
-- ============================================================
-- 1. Nessun residuo di TRUNCATE/TRIGGER/REFERENCES per authenticated su
--    NESSUNA tabella public (atteso: 0 righe):
-- SELECT table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND grantee = 'authenticated'
--   AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')
-- ORDER BY table_name, privilege_type;
--
-- 2. Privilegi residui di authenticated, tabella per tabella (atteso: solo
--    SELECT e/o INSERT/UPDATE/DELETE, mai TRUNCATE/TRIGGER/REFERENCES):
-- SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS authenticated_privs
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND grantee = 'authenticated'
-- GROUP BY table_name
-- ORDER BY table_name;
--
-- 3. Default privileges corretti: l'entry authenticated di postgres non ha
--    piu D (TRUNCATE) / x (REFERENCES) / t (TRIGGER) su TABLES:
-- SELECT pg_get_userbyid(defaclrole) AS granting_role, d.defaclacl
-- FROM pg_default_acl d
-- JOIN pg_namespace n ON n.oid = d.defaclnamespace
-- WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
-- ORDER BY granting_role;
-- ============================================================
--
-- -- ESITO REALE (applicata da Filippo il 2026-07-28) --
-- A) Residui TRUNCATE/TRIGGER/REFERENCES per authenticated: ZERO righe. OK.
-- B) Privilegi residui di authenticated, tabella per tabella — nessuna ha
--    piu TRUNCATE/TRIGGER/REFERENCES, al massimo DELETE/INSERT/SELECT/UPDATE:
--      admin_assignments             | DELETE, INSERT, SELECT, UPDATE
--      attachments                   | DELETE, INSERT, SELECT, UPDATE
--      builders                      | DELETE, INSERT, SELECT, UPDATE
--      comments                      | DELETE, INSERT, SELECT, UPDATE
--      completions                   | DELETE, INSERT, SELECT, UPDATE
--      document_checklist_template   | DELETE, INSERT, SELECT, UPDATE
--      documents                     | DELETE, INSERT, SELECT, UPDATE
--      invites                       | DELETE, INSERT, SELECT, UPDATE
--      maintenance_items             | DELETE, INSERT, SELECT, UPDATE
--      maintenance_templates         | DELETE, INSERT, SELECT, UPDATE
--      notifications                 | DELETE, INSERT, SELECT, UPDATE
--      profiles                      | DELETE, INSERT, SELECT           (UPDATE gia ristretta, 018)
--      residence_checklist_exception | DELETE, INSERT, SELECT, UPDATE
--      residence_features            | SELECT                           (ridotta dalla 030)
--      residences                    | DELETE, INSERT, SELECT, UPDATE
--      suppliers                     | DELETE, INSERT, SELECT, UPDATE
--      unit_members                  | DELETE, INSERT, SELECT, UPDATE
--      units                         | DELETE, INSERT, SELECT, UPDATE
-- C) Controllo campione su completions: authenticated ripulito
--      (DELETE, INSERT, SELECT, UPDATE), MA anon ancora con l'intero ALL:
--      anon | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--    -> la query C ha rivelato che il PARALLELO anon e ancora APERTO
--       (anon conserva TRUNCATE/TRIGGER/REFERENCES su completions e sulle
--       altre tabelle). Chiuso dalla migrazione 032 (gemella per anon).
--
-- CONCLUSIONE: hardening authenticated completo (zero residui RLS-bypass in
-- tutto public). Il buco simmetrico su anon resta e viene chiuso dalla 032.
-- ============================================================
--
-- ============================================================
-- APPENDICE (SOLO REPORT, nessuna azione qui) — privilegi INSERT/UPDATE/
-- DELETE concessi ad authenticated ma NON usati da alcuna policy RLS di
-- quel comando (bloccati solo dal default-deny della RLS). Ricavati
-- incrociando information_schema.role_table_grants con pg_policies il
-- 2026-07-28. Da valutare in un ciclo separato (revoca mirata dove la
-- scrittura non passa mai dal client autenticato):
--   • completions                 -> UPDATE, DELETE   [immutabilita: candidati forti]
--   • attachments                 -> UPDATE, DELETE
--   • builders                    -> INSERT, DELETE
--   • comments                    -> UPDATE
--   • document_checklist_template -> INSERT, UPDATE, DELETE
--   • maintenance_templates       -> INSERT, UPDATE, DELETE
--   • notifications               -> INSERT, UPDATE, DELETE
--   • profiles                    -> DELETE
--   • residences                  -> DELETE
--   • units                       -> DELETE
-- (Le tabelle con policy FOR ALL — admin_assignments, documents, invites,
--  maintenance_items, residence_checklist_exception, suppliers, unit_members
--  — usano legittimamente INSERT/UPDATE/DELETE: NON in lista.)
--
-- PARALLELO anon: pg_default_acl e i grant esistenti mostrano che `anon` ha
-- gli stessi privilegi (incluso TRUNCATE) su tutte le tabelle. Fuori scope
-- qui (concern = authenticated). Se vuoi chiuderlo, e una migrazione gemella
-- di questa con FROM anon + ALTER DEFAULT PRIVILEGES ... FROM anon.
-- ============================================================
