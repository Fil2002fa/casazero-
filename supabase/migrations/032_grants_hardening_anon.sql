-- ============================================================
-- CasaZero — 032: hardening grants per il ruolo anon (gemella della 031)
-- ANTEPRIMA. Applica Filippo nel SQL Editor; poi esegue le query di
-- verifica in fondo e incolla l'output reale nel footer. SOLO grants:
-- nessun seed, nessuna RPC, nessun wizard, nessuna modifica a policy RLS.
-- ------------------------------------------------------------
-- CONCERN UNICO: togliere ad `anon` i privilegi che NON passano dalla RLS
-- (TRUNCATE, TRIGGER, REFERENCES), su TUTTE le tabelle public. La 031 ha
-- chiuso lo stesso buco per `authenticated`; la query C della 031 ha
-- rivelato che `anon` conserva ancora l'intero ALL di default Supabase.
--
-- `completions` e in cima e con enfasi: la chiave `anon` e PUBBLICA — sta
-- nel bundle client, chiunque la possiede. Un grant che scavalca la RLS su
-- questa tabella (il fascicolo legale immutabile, CLAUDE.md) e inaccettabile
-- A PRESCINDERE dalla raggiungibilita via PostgREST. E la superficie con la
-- posta in gioco piu alta di tutta l'app.
--
-- COSA NON TOCCA questa migrazione:
--   • SELECT/INSERT/UPDATE/DELETE di anon: vanno verificati contro i flussi
--     che usano la chiave anonima (inviti, reset password, pagine pubbliche)
--     PRIMA di rimuoverli. In appendice: quali policy nominano esplicitamente
--     anon (report per capire cosa serve davvero).
--   • le policy RLS: invariate.
--
-- REVOKE esplicite tabella per tabella (non un DO block dinamico): il file
-- documenta per iscritto ogni tabella toccata. Stesso ordine della 031.
-- ============================================================

-- ------------------------------------------------------------
-- completions PER PRIMA — chiave anon pubblica + invariante immutabilita
-- ------------------------------------------------------------
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.completions FROM anon;

-- ------------------------------------------------------------
-- Tutte le altre tabelle public (ordine alfabetico)
-- ------------------------------------------------------------
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.admin_assignments            FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.attachments                  FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.builders                     FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.comments                     FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.document_checklist_template  FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.documents                    FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.invites                      FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.maintenance_items            FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.maintenance_templates        FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.notifications                FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.profiles                     FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.residence_checklist_exception FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.residences                   FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.suppliers                    FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.unit_members                 FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.units                        FROM anon;
-- residence_features: gia azzerata per anon dalla 030 (REVOKE ALL ... FROM anon).
-- Ripetuta per idempotenza e per completare il registro. No-op.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.residence_features           FROM anon;

-- ------------------------------------------------------------
-- DEFAULT PRIVILEGES per anon — coerente con la 031 (che l'ha fatto per
-- authenticated). Senza questo, la prossima tabella creata da postgres
-- rinasce con ALL (incluso TRUNCATE) anche per anon. pg_default_acl mostra
-- l'entry anon 'arwdDxtm' concessa sia da postgres sia da supabase_admin;
-- le tabelle dei nostri cicli sono postgres-owned -> correggiamo postgres.
-- ------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon;

-- supabase_admin: come nella 031, richiede appartenenza a quel ruolo
-- (postgres non e superuser in Supabase) -> lasciata COMMENTATA per non far
-- fallire la migrazione. Le tabelle nuove dei nostri cicli sono postgres-owned.
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
--   REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon;

-- PostgREST: ricarica la schema-cache dopo modifiche ai privilegi.
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- AUTO-VERIFICA IN CODA — SELECT, non DDL. Il SQL Editor restituisce il
-- risultato dell'ULTIMA istruzione dello script: mettendola qui, l'esito
-- della migrazione e' visibile SENZA lanciare query separate.
--
-- Il SQL Editor esegue l'intero script in UNA transazione: se una qualunque
-- istruzione fallisce, TUTTO viene annullato. Questa SELECT gira dentro la
-- stessa transazione, quindi:
--   • esce 0 / 'arwdm' -> lo script sta per COMMITTARE: applicata. OK.
--   • non compare alcun risultato, o esce 51 / 'arwdDxtm' -> lo script e'
--     stato annullato o non e' stato eseguito: NON applicata. Guarda il
--     banner di errore dell'editor e riportane il testo esatto.
--
-- PERCHE' ESISTE: al primo tentativo (2026-07-31) l'ultima istruzione era
-- NOTIFY, che non restituisce nulla. L'editor non mostrava alcun esito e il
-- mancato apply e' passato inosservato — scoperto solo dalle query di
-- verifica lanciate a parte. Vedi il registro TENTATIVI qui sotto.
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND grantee = 'anon'
       AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES'))
    AS residui_anon_atteso_0,
  (SELECT count(*) FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'completions' AND grantee = 'anon'
       AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES'))
    AS residui_completions_atteso_0,
  (SELECT d.defaclacl::text FROM pg_default_acl d
     JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
      AND pg_get_userbyid(d.defaclrole) = 'postgres')
    AS default_acl_postgres_atteso_anon_arwdm;

-- ============================================================
-- VERIFICA POST-APPLY (eseguire dopo l'apply; incollare l'output reale nel
-- footer ESITO REALE, che resta vuoto: Claude non applica DDL).
-- ============================================================
-- 1. Nessun residuo di TRUNCATE/TRIGGER/REFERENCES per anon su NESSUNA
--    tabella public (atteso: 0 righe):
-- SELECT table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND grantee = 'anon'
--   AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')
-- ORDER BY table_name, privilege_type;
--
-- 2. Privilegi residui di anon, tabella per tabella (atteso: mai
--    TRUNCATE/TRIGGER/REFERENCES; SELECT/INSERT/UPDATE/DELETE ancora
--    presenti, intoccati da questa migrazione):
-- SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS anon_privs
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND grantee = 'anon'
-- GROUP BY table_name
-- ORDER BY table_name;
--
-- 3. Controllo campione su completions (atteso: anon senza
--    TRUNCATE/TRIGGER/REFERENCES; authenticated invariato dalla 031):
-- SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name = 'completions'
--   AND grantee IN ('anon', 'authenticated')
-- GROUP BY grantee ORDER BY grantee;
--
-- 4. Default privileges: l'entry anon di postgres non ha piu D/x/t su TABLES:
-- SELECT pg_get_userbyid(defaclrole) AS granting_role, d.defaclacl
-- FROM pg_default_acl d
-- JOIN pg_namespace n ON n.oid = d.defaclnamespace
-- WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'
-- ORDER BY granting_role;
-- ============================================================
--
-- -- REGISTRO TENTATIVI --
--
-- TENTATIVO 1 — 2026-07-31: NESSUN EFFETTO. La migrazione NON risulta
-- applicata. Verificato live via MCP (sola lettura) dopo l'apply dichiarato:
--   • pg_class.relacl su completions:
--       anon=arwdDxtm/postgres        (D/x/t tutti ancora presenti)
--       authenticated=arwdm/postgres  (D/x/t rimossi -> la 031 ha funzionato)
--   • residui TRUNCATE/TRIGGER/REFERENCES per anon su public: 51 righe
--     = 17 tabelle x 3 privilegi, cioe' l'insieme COMPLETO, intatto.
--   • pg_default_acl (ruolo concedente postgres): anon=arwdDxtm invariato,
--     authenticated=arwdm modificato -> nemmeno l'ALTER DEFAULT PRIVILEGES
--     di questo file ha avuto effetto.
--   -> zero istruzioni su zero hanno lasciato traccia: non un apply
--      parziale, ma uno script mai arrivato al commit.
--
-- CAUSA ESCLUSA: permessi/grantor. Concedente = postgres, owner = postgres,
-- sessione = postgres; la 031, struttura identica su authenticated, e'
-- passata. Nessuna istruzione di questo file poteva fallire per privilegi.
-- CAUSA RESIDUA: script non eseguito, o annullato da un errore dell'editor
-- non rilevato — invisibile perche' l'ultima istruzione era NOTIFY, che non
-- restituisce output. Chiuso aggiungendo l'AUTO-VERIFICA IN CODA sopra.
--
-- TENTATIVO 2 — 2026-08-01: APPLICATA SOLO IN PARTE (1 istruzione su 18).
-- Dichiarata applicata, ma la verifica live via MCP (sola lettura) mostra che
-- ha avuto effetto SOLO la prima REVOKE, quella su completions:
--   • pg_class.relacl su completions: anon=arwdm/postgres
--     -> D/x/t rimossi. Questa riga e' a posto, e coincide con l'unico output
--        incollato (anon | DELETE, INSERT, SELECT, UPDATE).
--   • residui TRUNCATE/TRIGGER/REFERENCES per anon su public: 48 righe
--     = 16 tabelle x 3 privilegi. Erano 51 prima; 51 - 48 = 3, esattamente
--     e solo completions. Tutte le altre 16 REVOKE non hanno lasciato traccia:
--     admin_assignments, attachments, builders, comments,
--     document_checklist_template, documents, invites, maintenance_items,
--     maintenance_templates, notifications, profiles,
--     residence_checklist_exception, residences, suppliers, unit_members, units.
--   • pg_default_acl (concedente postgres): anon=arwdDxtm INVARIATO
--     -> nemmeno l'ALTER DEFAULT PRIVILEGES ha avuto effetto.
--
-- LETTURA: un pattern "solo la prima istruzione" non e' compatibile con un
-- rollback (che azzererebbe anche completions) ne' con un errore di privilegi.
-- E' compatibile con l'esecuzione di una SELEZIONE PARZIALE del file: il SQL
-- Editor di Supabase esegue solo il testo evidenziato, se c'e' una selezione.
--
-- L'AUTO-VERIFICA IN CODA avrebbe intercettato tutto questo: eseguita, avrebbe
-- restituito 48 invece di 0. Nell'output incollato non compare, il che conferma
-- che la coda del file non e' stata eseguita.
--
-- COSA FARE: riaprire il file, NON selezionare nulla (click a vuoto nell'editor
-- per deselezionare), eseguire tutto, e incollare l'output dell'ultima riga.
--
-- -- ESITO REALE (da compilare dopo un apply COMPLETO) --
-- Resta VUOTO: al 2026-08-01 la migrazione non e' applicata per intero e
-- l'hardening di anon NON e' chiuso. 16 tabelle su 17 conservano TRUNCATE.
-- 0. Output dell'AUTO-VERIFICA IN CODA (atteso: 0 | 0 | ...anon=arwdm...):
-- 1. ...
-- 2. ...
-- 3. ...
-- 4. ...
-- ============================================================
--
-- ============================================================
-- APPENDICE (SOLO REPORT, nessuna azione qui) — policy RLS che nominano
-- ESPLICITAMENTE il ruolo anon. Query eseguita il 2026-07-28:
--   SELECT tablename, policyname, cmd, roles FROM pg_policies
--   WHERE schemaname='public' AND 'anon' = ANY(roles);
-- RISULTATO: 0 righe. NESSUNA policy in public nomina esplicitamente anon.
--
-- LETTURA: tutte le policy si applicano al ruolo `public` (che include anon)
-- ma il loro USING/WITH CHECK gate su auth.uid() / czero_user_role(), che
-- per una sessione anon sono NULL -> ramo sempre-falso, anon negato di fatto
-- a livello di policy. Quindi nessuna policy RLS fa affidamento sui grant
-- SELECT/INSERT/UPDATE/DELETE di anon. I flussi con chiave anonima di questo
-- repo (inviti/token, ecc.) passano dal service role via API route (bypassa
-- RLS), non da una sessione anon diretta. Indizio forte che anche
-- SELECT/INSERT/UPDATE/DELETE di anon siano rimuovibili in un ciclo separato
-- — MA la conferma va fatta contro i flussi reali (login, reset password,
-- pagine pubbliche), non solo contro le policy. Fuori scope qui: nessuna
-- rimozione di SELECT/INSERT/UPDATE/DELETE in questa migrazione.
-- ============================================================
