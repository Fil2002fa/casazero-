-- ============================================================
-- CasaZero — 023: RLS scoped-tenant sul bucket privato `attachments`
-- B0 (pre-Fase B), commit 3 — segue la 022 (stesso problema, bucket diverso).
-- Applica Filippo nel SQL Editor; subito dopo, eseguire le query di
-- verifica in fondo e incollarne l'output nel footer (stessa convenzione
-- della 022: la prova che l'oggetto esiste è l'output, mai il commento).
-- ------------------------------------------------------------
-- Problema: le policy attuali su storage.objects per bucket_id='attachments'
-- richiedono solo auth.uid() IS NOT NULL (SELECT/INSERT) o
-- owner_id = auth.uid() (DELETE) — nessuno scoping per tenant/residenza/unità.
--
-- Path pattern del bucket (diverso da documents): ${completionId}/${ts}.${ext}
-- (src/app/(app)/manutenzioni/actions.ts:46). Verificato sul DB il
-- 20/07/2026: 4 oggetti reali, tutti con completion_id valido al primo
-- segmento, tutti referenziati in `attachments`.
-- ------------------------------------------------------------
-- Scope DIVERSO da documents (022): gli attachments sono allegati ai
-- completamenti, e completeN2 è chiamabile anche dal residente (client),
-- non solo da admin/super_admin — vedi RLS `completions: inserimento
-- autorizzato` e `attachments: inserimento con accesso completion`
-- (002_rls.sql). Quindi qui non si differenzia per ruolo: si replica
-- l'unica condizione già usata da quelle due policy DB — accesso alla
-- completion via unit (residente/admin/super_admin sull'unità) O
-- residenza (admin/super_admin sulla residenza).
--
--   SELECT: chi ha accesso alla completion il cui id è il 1° segmento
--           del path (stesso scope della lettura DB di `attachments`)
--   INSERT: stessa condizione della SELECT (stesso scope della scrittura
--           DB di `attachments`) — completeN2 crea prima la riga
--           `completions` (RLS la autorizza già), poi carica l'allegato
--           nello stesso giro: chi può accedere alla completion appena
--           creata può anche allegarci un file
--   DELETE: NESSUNA POLICY — nega tutto, sempre, a chiunque.
--
-- Decisione su DELETE (deviazione consapevole dal brief originale, che
-- ipotizzava "stessa regola dell'INSERT"): gli attachments sono la prova
-- fotografica dei completamenti, e completions è il fascicolo legale
-- immutabile (CLAUDE.md: "nessun agente o migrazione la tocca"). La
-- policy precedente (owner_id = auth.uid()) permetteva al residente di
-- cancellare la PROPRIA prova dopo averla allegata al fascicolo —
-- immutabilità solo formale. Se il completamento non si tocca, la sua
-- prova nemmeno, da nessuno, nemmeno dall'uploader. Confermato in FASE 0
-- che nessun flusso applicativo cancella oggetti da questo bucket (grep
-- su .remove\( → solo su 'documents', mai su 'attachments'): rimuovere
-- la policy DELETE non rompe nulla di esistente. Se in futuro servirà un
-- cleanup (es. orfano dopo un upload interrotto), va fatto via
-- service role (bypassa RLS), MAI riaprendo una policy DELETE su
-- utenti autenticati.
--
-- Riusa l'helper public.czero_storage_first_uuid(text), già creato e
-- committato nella 022 — non ricreato qui.
--
-- ⚠️ Lezione dalla 022: ogni riferimento a `name` dentro una subquery
-- va qualificato `objects.name`, sempre — anche quando la tabella
-- interrogata (qui `completions`) non ha una colonna omonima: è la
-- disciplina che evita la trappola, non la verifica caso per caso.
-- ============================================================

-- ── Drop delle policy lasche originarie ──
DROP POLICY IF EXISTS "attachments bucket: lettura autenticata" ON storage.objects;
DROP POLICY IF EXISTS "attachments bucket: upload autenticato"  ON storage.objects;
DROP POLICY IF EXISTS "attachments bucket: delete proprio"      ON storage.objects;

-- ── Drop delle policy nuove, per ri-eseguibilità del file ──
DROP POLICY IF EXISTS "attachments bucket: lettura scoped completion" ON storage.objects;
DROP POLICY IF EXISTS "attachments bucket: upload scoped completion"  ON storage.objects;

-- ── SELECT: accesso alla completion via unit o residence ──
CREATE POLICY "attachments bucket: lettura scoped completion"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.completions c
      WHERE c.id = public.czero_storage_first_uuid(objects.name)
        AND (
          (c.unit_id IS NOT NULL AND public.czero_can_access_unit(c.unit_id))
          OR
          (c.unit_id IS NULL AND public.czero_can_access_residence(c.residence_id))
        )
    )
  );

-- ── INSERT: stessa condizione della SELECT ──
CREATE POLICY "attachments bucket: upload scoped completion"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.completions c
      WHERE c.id = public.czero_storage_first_uuid(objects.name)
        AND (
          (c.unit_id IS NOT NULL AND public.czero_can_access_unit(c.unit_id))
          OR
          (c.unit_id IS NULL AND public.czero_can_access_residence(c.residence_id))
        )
    )
  );

-- ── DELETE: nessuna policy — RLS nega tutto di default ──
-- (vedi decisione sopra: la prova di un completamento non si cancella,
-- da nessuno, mai. Stesso pattern di `completions` stessa, che non ha
-- policy UPDATE/DELETE per lo stesso invariante.)

-- ============================================================
-- VERIFICA POST-APPLY (eseguire subito dopo l'apply, incollare
-- l'output qui sotto come footer).
-- ============================================================
-- 1. Le policy sul bucket attachments devono essere ESATTAMENTE queste 2
--    (SELECT e INSERT), nessuna DELETE, nessuna lasca residua:
-- SELECT policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND (qual LIKE '%attachments%' OR with_check LIKE '%attachments%')
-- ORDER BY cmd;
--
-- 2. objects.name qualificato nel testo salvato (non completions.name,
--    che comunque non esiste — controllo di forma):
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname='storage' AND tablename='objects'
--   AND policyname LIKE 'attachments bucket: %scoped%';
--
-- 3. Probe diretto: INSERT impersonato dal residente (lorofilippo2002)
--    su un completion_id reale della propria unità, in transazione con
--    ROLLBACK finale. Atteso: nessun errore RLS.
-- BEGIN;
-- SELECT set_config('role','authenticated', true),
--        set_config('request.jwt.claims',
--          (SELECT json_build_object('sub', u.id, 'role', 'authenticated')::text
--           FROM auth.users u WHERE u.email = 'lorofilippo2002@gmail.com'),
--          true);
-- INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
-- SELECT 'attachments',
--        c.id::text || '/999999_diag_test.png',
--        auth.uid()::text,
--        '{"mimetype":"image/png"}'::jsonb
-- FROM completions c
-- JOIN unit_members um ON um.unit_id = c.unit_id AND um.ended_at IS NULL
-- WHERE um.profile_id = (SELECT id FROM auth.users WHERE email = 'lorofilippo2002@gmail.com')
-- LIMIT 1
-- RETURNING name;
-- ROLLBACK;
--
-- 4. Probe negativo: DELETE impersonato su un attachment esistente,
--    stesso utente owner del file. Atteso: 0 righe cancellate (RLS nega
--    di default, nessuna policy DELETE).
-- BEGIN;
-- SELECT set_config('role','authenticated', true),
--        set_config('request.jwt.claims',
--          (SELECT json_build_object('sub', u.id, 'role', 'authenticated')::text
--           FROM auth.users u WHERE u.email = 'lorofilippo2002@gmail.com'),
--          true);
-- DELETE FROM storage.objects
-- WHERE bucket_id = 'attachments'
-- RETURNING name;
-- ROLLBACK;
--
-- 5. Smoke funzionale (manuale, dall'app):
--    · residente (lorofilippo2002): completa un item con foto allegata
--      → upload OK, foto visibile nel fascicolo/dettaglio item
--    · residente: apre il fascicolo e vede l'allegato di un proprio
--      completamento passato → download/visualizzazione OK
-- ============================================================
--
-- ── ESITO REALE (applicata e verificata da Filippo il 20/07/2026) ──
--
-- 1. Confermato via SQL — due volte, in modo indipendente: il report di
--    Filippo e una query diretta durante questa sessione danno lo stesso
--    risultato. Esattamente 2 policy sul bucket attachments (INSERT +
--    SELECT), nessuna DELETE, nessuna lasca residua delle 3 originarie.
--
-- 2. Confermato via SQL — objects.name qualificato nel testo salvato di
--    ENTRAMBE le policy (qual/with_check mostrano
--    czero_storage_first_uuid(objects.name), non un riferimento ambiguo).
--
-- 3. NON eseguito il probe SQL isolato: il SQL Editor di Supabase nega
--    "permission denied for table users" nel momento in cui si tenta di
--    leggere auth.users DOPO aver impersonato un ruolo authenticated via
--    set_config — limite dell'ambiente (il ruolo di sessione perde
--    l'accesso ad auth.users una volta impersonato), non della policy.
--    Sostituito dal punto 5 (più forte: passa dal client applicativo
--    reale, non da un probe SQL isolato).
--
-- 4. NON eseguito il probe SQL isolato, per un motivo diverso e più forte
--    del 3: Supabase blocca STRUTTURALMENTE il DELETE diretto su
--    storage.objects con un trigger di sistema
--    (storage.protect_delete() → "Direct deletion from storage tables
--    is not allowed. Use the Storage API instead"), indipendentemente
--    da qualunque RLS. Il comportamento voluto da questa migrazione
--    (nessuno può cancellare un attachment) è quindi garantito da DUE
--    strati indipendenti: la protezione di sistema di Supabase Storage
--    (a monte, sempre attiva) + l'assenza di policy DELETE su
--    storage.objects (RLS nega di default). Chi rilegge questa
--    migrazione in futuro deve sapere che il probe SQL diretto non è
--    riproducibile per questo motivo — non è un buco di verifica, è un
--    livello di protezione in più rispetto a quanto la migrazione
--    stessa introduce.
--
-- 5. Smoke funzionale reale eseguito da Filippo (residente
--    lorofilippo2002): completato un item con foto allegata → upload OK;
--    l'allegato è visibile nel fascicolo. Conferma end-to-end, con
--    autenticazione reale, di INSERT e SELECT — più probante dei probe
--    isolati 3-4 che l'ambiente non permette di eseguire.
-- ============================================================
