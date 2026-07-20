-- ============================================================
-- CasaZero — 022: RLS scoped per tenant sul bucket privato `documents`
-- B0 (pre-Fase B), commit 1. Applica Filippo nel SQL Editor; subito dopo,
-- eseguire le query di verifica in fondo e incollarne l'output nel
-- footer (convenzione post-013: la prova che l'oggetto esiste è
-- l'output, mai il commento).
-- ------------------------------------------------------------
-- ⚠️ CORREZIONE (19/07/2026): la prima apply di questo file (18/07/2026)
-- era rotta. Nei rami super_admin di INSERT/DELETE, `name` dentro la
-- subquery `EXISTS (SELECT ... FROM residences r WHERE r.id =
-- czero_storage_first_uuid(name) ...)` veniva risolto da Postgres su
-- `residences.name` (il nome della residenza) invece che su
-- `storage.objects.name` (il path del file) — residences ha una
-- colonna `name`, quindi il riferimento non qualificato si legava lì
-- silenziosamente, senza errore di parsing. Risultato: il ramo
-- super_admin era SEMPRE falso (l'unico ramo che allora esisteva per
-- l'INSERT), da cui "new row violates row-level security policy" su
-- ogni upload da dashboard. Diagnosticato con un INSERT reale
-- impersonando il super_admin (stesso errore) e con il testo della
-- policy in pg_proc/pg_policies (mostrava `czero_storage_first_uuid(r.name)`
-- invece di `czero_storage_first_uuid(objects.name)`). Fix: ogni
-- riferimento a `name` dentro una subquery ora è qualificato
-- `objects.name`; qualificato anche nella SELECT per uniformità
-- difensiva, anche se lì non c'era ambiguità (nessuna subquery).
-- Bug class per l'handoff: nelle policy storage con subquery, ogni
-- colonna di storage.objects (name, owner_id, ...) va sempre
-- qualificata — una tabella con colonna omonima nella subquery cattura
-- il riferimento in silenzio e la policy diventa sempre-falsa o
-- sempre-vera.
-- ------------------------------------------------------------
-- Problema (diagnosi FASE 0 Fase B, punto 2 + rischio 1):
-- le policy attuali su storage.objects per bucket_id='documents'
-- richiedono solo auth.uid() IS NOT NULL. Qualsiasi utente autenticato
-- di QUALSIASI tenant può leggere (signed URL comprese, via
-- /api/download) e scrivere qualunque path del bucket. L'unica
-- barriera reale è l'oscurità del path.
--
-- Path pattern del bucket: ${residenceId}/${category}/${ts}_${titolo}.${ext}
-- Verificato sul DB il 18/07/2026: tutti gli oggetti conformi dopo
-- l'eliminazione manuale dei 2 logo orfani (path ${builderId}/logo.*).
-- ------------------------------------------------------------
-- Regole nuove (residenza estratta dal 1° segmento del path):
--   SELECT: chiunque abbia accesso alla residenza secondo l'helper
--           esistente czero_can_access_residence (super_admin del
--           builder proprietario · admin assegnato via
--           admin_assignments · residente con unità attiva)
--   INSERT: super_admin del builder proprietario della residenza,
--           O admin assegnato alla residenza via admin_assignments
--           (l'upload admin dalla PWA è funzionalità esistente —
--           (app)/documenti/actions.ts blocca solo 'client' — e B0
--           non deve introdurre regressioni funzionali)
--   DELETE: stessa regola dell'INSERT, simmetrica, così il cleanup
--           dell'upload fallito funziona anche per l'admin
--           (prima: owner_id = uploader)
--
-- Guardia sul cast: il segmento path→uuid passa da un helper con
-- regex; un path malformato produce NULL (→ accesso negato), mai un
-- errore di cast che farebbe esplodere la policy.
--
-- Il service role bypassa RLS: eventuali flussi con createServiceClient
-- non sono toccati (a oggi nessun flusso server tocca questo bucket
-- col service client: entrambe le action di upload usano il client
-- scoped-utente).
-- ============================================================

-- Helper: primo segmento del path come uuid, NULL se non è un uuid.
-- Riusabile per il bucket attachments (commit 3: 1° segmento = completion_id).
-- IMMUTABLE, nessun accesso a tabelle → SECURITY INVOKER (default).
-- search_path vuoto + riferimenti qualificati: niente warning linter.
CREATE OR REPLACE FUNCTION public.czero_storage_first_uuid(p_name text)
RETURNS uuid
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (storage.foldername(p_name))[1]::uuid
    ELSE NULL
  END
$$;

-- ── Drop delle policy lasche originarie (nomi da pg_policies, 18/07/2026) ──
DROP POLICY IF EXISTS "documents bucket: lettura autenticata" ON storage.objects;
DROP POLICY IF EXISTS "documents bucket: upload autenticato"  ON storage.objects;
DROP POLICY IF EXISTS "documents bucket: delete proprio"      ON storage.objects;

-- ── Drop delle 3 policy della prima apply (rotta) — file ri-eseguibile
--    tale quale sul DB che ha già la versione con il bug di binding. ──
DROP POLICY IF EXISTS "documents bucket: lettura scoped residenza" ON storage.objects;
DROP POLICY IF EXISTS "documents bucket: upload scoped residenza"  ON storage.objects;
DROP POLICY IF EXISTS "documents bucket: delete scoped residenza"  ON storage.objects;

-- ── SELECT: scope residenza via helper condiviso ──
-- czero_can_access_residence(NULL) → false (EXISTS su confronti NULL),
-- quindi path malformato = accesso negato, senza errore.
-- objects.name qualificato per uniformità difensiva (qui non c'era
-- ambiguità reale: nessuna subquery con colonna omonima).
CREATE POLICY "documents bucket: lettura scoped residenza"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND public.czero_can_access_residence(public.czero_storage_first_uuid(objects.name))
  );

-- ── INSERT: super_admin del builder proprietario O admin assegnato ──
-- Copre entrambe le superfici di upload esistenti col client scoped-utente:
-- uploadDocumentiAdmin (dashboard, solo super_admin) e uploadDocument
-- (PWA (app)/documenti, super_admin + admin).
-- objects.name qualificato in ENTRAMBI i rami: residences e
-- admin_assignments hanno colonne che altrimenti catturerebbero il
-- riferimento non qualificato (vedi nota di correzione in testa al file).
CREATE POLICY "documents bucket: upload scoped residenza"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      (public.czero_user_role() = 'super_admin'
        AND EXISTS (
          SELECT 1 FROM public.residences r
          WHERE r.id = public.czero_storage_first_uuid(objects.name)
            AND r.builder_id = public.czero_user_builder_id()
        ))
      OR
      (public.czero_user_role() = 'admin'
        AND EXISTS (
          SELECT 1 FROM public.admin_assignments aa
          WHERE aa.profile_id = auth.uid()
            AND aa.residence_id = public.czero_storage_first_uuid(objects.name)
        ))
    )
  );

-- ── DELETE: stessa regola dell'INSERT (simmetrica) ──
-- Copre il cleanup del file orfano quando l'insert su `documents` fallisce
-- (uploadDocumentiAdmin riga 95 e uploadDocument riga 61, client scoped-utente),
-- per entrambi i ruoli che possono caricare. objects.name qualificato,
-- stessa ragione dell'INSERT.
CREATE POLICY "documents bucket: delete scoped residenza"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND (
      (public.czero_user_role() = 'super_admin'
        AND EXISTS (
          SELECT 1 FROM public.residences r
          WHERE r.id = public.czero_storage_first_uuid(objects.name)
            AND r.builder_id = public.czero_user_builder_id()
        ))
      OR
      (public.czero_user_role() = 'admin'
        AND EXISTS (
          SELECT 1 FROM public.admin_assignments aa
          WHERE aa.profile_id = auth.uid()
            AND aa.residence_id = public.czero_storage_first_uuid(objects.name)
        ))
    )
  );

-- ============================================================
-- VERIFICA POST-APPLY (eseguire subito dopo l'apply, incollare
-- l'output qui sotto come footer — vedi convenzione 013).
-- ============================================================
-- 1. Le policy sul bucket documents devono essere ESATTAMENTE queste 3
--    (nessuna "lettura autenticata"/"upload autenticato"/"delete proprio" residua):
-- SELECT policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND (qual LIKE '%documents%' OR with_check LIKE '%documents%')
-- ORDER BY cmd;
--
-- 2. L'helper esiste con la firma attesa:
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--        p.provolatile
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'czero_storage_first_uuid';
--
-- 3. Guardia cast: path malformato → NULL, path valido → uuid:
-- SELECT public.czero_storage_first_uuid('non-un-uuid/file.pdf')  AS atteso_null,
--        public.czero_storage_first_uuid('21393fd2-b85c-4854-b488-a30f8790c04a/tecnici/x.pdf') AS atteso_uuid;
--
-- 3b. Verifica diretta del bug corretto — stesso metodo che lo ha trovato:
--     INSERT reale impersonando pippoloro02 (super_admin), dentro una
--     transazione con ROLLBACK finale (non sporca nulla). Atteso: 1 riga
--     ritornata da RETURNING, nessun errore RLS.
-- BEGIN;
-- SELECT set_config('role','authenticated', true),
--        set_config('request.jwt.claims',
--          (SELECT json_build_object('sub', u.id, 'role', 'authenticated')::text
--           FROM auth.users u WHERE u.email = 'pippoloro02@gmail.com'),
--          true);
-- INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
-- VALUES ('documents',
--         '45196dac-bd81-4368-9452-1c066652e464/proprieta/999999_diag_test.pdf',
--         auth.uid()::text,
--         '{"mimetype":"application/pdf"}'::jsonb)
-- RETURNING name;
-- ROLLBACK;
--
-- 4. Smoke funzionale (manuale, dall'app):
--    · residente (lorofilippo2002): apre un documento da /documenti → download OK
--    · super_admin (pippoloro02): upload da dashboard documenti residenza → OK
--    · super_admin: download dello stesso documento → OK
--    · admin (filippoloro02): upload dalla PWA /documenti su una residenza
--      assegnata → OK (funzionalità esistente preservata, opzione 2 di B0)
-- ============================================================
--
-- ── ESITO REALE (applicata da Filippo il 19/07/2026, riverificata 20/07/2026) ──
--
-- 1. Le 3 policy attese, nessuna lasca residua:
--    documents bucket: lettura scoped residenza | SELECT
--    documents bucket: upload scoped residenza  | INSERT
--    documents bucket: delete scoped residenza  | DELETE
--    INSERT/DELETE confermano objects.name qualificato nel testo salvato
--    (czero_storage_first_uuid(objects.name), non più residences.name).
--
-- 2. Helper presente: czero_storage_first_uuid(p_name text).
--
-- 3. Guardia cast: 'non-un-uuid/file.pdf' → NULL; path reale → uuid corretto.
--
-- 3b. Eseguito: INSERT impersonato (pippoloro02, super_admin) in
--     transazione con ROLLBACK finale → nessun errore RLS. Conferma
--     diretta, con lo stesso metodo che aveva trovato il bug, che il
--     ramo super_admin ora lega objects.name e non più residences.name.
--
-- 4. Smoke funzionale reale eseguito da Filippo:
--    · upload PDF veri di Cavaccio da super_admin → OK (prova end-to-end
--      che il ramo super_admin della policy scrive davvero)
--    · download → il file SCARICA invece di aprirsi nel tab, conferma
--      { download: true } (commit 77e9ad8)
--    · upload PWA come admin (filippoloro02) → NON eseguito: bloccato da
--      un bug pre-esistente e indipendente (le card residenze nella
--      dashboard admin non sono cliccabili) — annotato a backlog, non
--      una regressione di questa migrazione
--    Verificato a query dopo l'uso reale: 0 righe demo residue, 7 righe in
--    `documents`, 8 oggetti nel bucket — lo scarto di 1 è
--    45196dac-.../proprieta/1781300312305_Certeficato_enegertico.pdf, un
--    orfano PREESISTENTE (già presente nell'inventario del check
--    preliminare di questa sessione, prima di qualsiasi modifica): mai
--    stato referenziato da una riga `documents`, fuori scope B0.
-- ============================================================
