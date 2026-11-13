-- ============================================================
-- CasaZero — 058: bucket `documents`, lettura del residente legata alla riga
-- Restrizione (nessun accesso viene allargato). Applicata via MCP Supabase
-- il 2026-11-13 con il sì esplicito di Filippo; verifica reale nel footer.
--
-- Numero 058 e non 057: 057_profiles_phone_grant.sql (origine sconosciuta)
-- non è su main e non va applicato; il numero resta libero per non
-- confondersi con quel file.
-- ------------------------------------------------------------
-- Problema (FASE 0 Documenti residente, punti D.3 e H):
-- la policy SELECT della 022 controlla solo la RESIDENZA, ricavata dal primo
-- segmento del path (`${residenceId}/${category}/${ts}_${nome}.${ext}`). Il
-- path non contiene l'unità, quindi un residente poteva leggere, elencare e
-- farsi firmare da /api/download i file delle ALTRE unità della sua residenza,
-- anche se la riga in `documents` non gli era visibile.
-- Prova prima della migrazione, residente di Santa Giustina
-- (39f4264d…, membro di "Appartamento furlan 1"): 5 righe `documents`
-- visibili, 6 oggetti del bucket visibili (1 era la polizza di "Unità 2").
--
-- Regola nuova (SELECT):
--   · accesso alla residenza del path, come prima (czero_can_access_residence);
--   · IN PIÙ, per chi non è admin o super_admin: deve esistere una riga di
--     `documents` con quello storage_path che l'utente può leggere. La
--     subquery gira con i permessi dell'utente, quindi vale la RLS di
--     `documents` (unità propria, oppure documento di residenza con
--     unit_id nullo). File e riga hanno così la stessa visibilità.
--   · admin e super_admin: invariati, restano sul solo path. Serve a
--     confirmDocument, che verifica l'oggetto con .list() PRIMA di scrivere
--     la riga, e alla lettura dei file orfani (api/reconcile-documents usa
--     comunque il service role).
-- INSERT e DELETE del bucket: non toccate.
--
-- objects.name è sempre qualificato (bug class della 022: `documents` non ha
-- una colonna `name`, ma la regola vale comunque).
--
-- Cosa NON cambia: documenti di residenza (unit_id nullo) restano leggibili
-- dal residente; i signed URL già emessi restano validi fino a scadenza
-- (1 ora) e non sono revocabili; il service role bypassa RLS.
-- ============================================================

-- La policy cerca la riga per storage_path a ogni lettura di oggetto.
CREATE INDEX IF NOT EXISTS documents_storage_path_idx
  ON public.documents (storage_path);

DROP POLICY IF EXISTS "documents bucket: lettura scoped residenza"        ON storage.objects;
DROP POLICY IF EXISTS "documents bucket: lettura per residenza e per riga" ON storage.objects;

CREATE POLICY "documents bucket: lettura per residenza e per riga"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND public.czero_can_access_residence(public.czero_storage_first_uuid(objects.name))
    AND (
      public.czero_user_role() IN ('admin', 'super_admin')
      OR EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.storage_path = objects.name
      )
    )
  );

-- ============================================================
-- ROLLBACK (non eseguire salvo necessità: riapre la lettura per sola
-- residenza, cioè il buco descritto sopra). Ripristina la policy della 022
-- tale quale; l'indice può restare, è innocuo.
--
--   DROP POLICY IF EXISTS "documents bucket: lettura per residenza e per riga" ON storage.objects;
--   CREATE POLICY "documents bucket: lettura scoped residenza"
--     ON storage.objects FOR SELECT
--     USING (
--       bucket_id = 'documents'
--       AND public.czero_can_access_residence(public.czero_storage_first_uuid(objects.name))
--     );
--   -- facoltativo:
--   -- DROP INDEX IF EXISTS public.documents_storage_path_idx;
-- ============================================================

-- ============================================================
-- VERIFICA
-- Simulazioni RLS: BEGIN; SET LOCAL ROLE authenticated;
-- set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
-- poi solo SELECT su storage.objects e public.documents.
--
-- (V1) policy SELECT del bucket: una sola, col testo nuovo
--   SELECT policyname, qual FROM pg_policies
--    WHERE schemaname='storage' AND tablename='objects' AND cmd='SELECT'
--      AND qual ILIKE '%''documents''%';
-- (V2) indice presente
--   SELECT indexdef FROM pg_indexes WHERE indexname='documents_storage_path_idx';
-- (V3) residente Santa Giustina: oggetti visibili = righe visibili, 0 oggetti
--      senza riga visibile, 0 righe senza oggetto leggibile
-- (V4) admin e super_admin: numero e impronta md5 dell'elenco oggetti
--      identici a prima
-- (V5) policy INSERT e DELETE del bucket invariate
--
-- ESITO REALE (2026-11-13, versione DB 20261113153815) — PASS
-- (V1) una sola policy SELECT sul bucket, "documents bucket: lettura per
--      residenza e per riga"; pg_policies mostra `d.storage_path = objects.name`
--      (riferimento legato a storage.objects, non a documents).
-- (V2) documents_storage_path_idx presente (btree su storage_path).
-- (V3) residente 39f4264d… (Santa Giustina, "Appartamento furlan 1"):
--        prima  oggetti visibili 6, senza riga visibile 1, righe 5
--        dopo   oggetti visibili 5, senza riga visibile 0, righe 5
--               (4 di residenza + 1 di unità, 3 gruppi file+tipo),
--               righe senza oggetto leggibile 0,
--               polizza di "Unità 2" (…/energetici/1792945164471_Polizza_…) 0.
-- (V4) admin 7a210c85… (assegnato a Santa Giustina e Portello):
--        prima e dopo 7 oggetti, 6 di Santa Giustina, md5 dell'elenco
--        da2d71b86563a98fcfa2dc6e27a967c3 in entrambi i casi.
--      super_admin 99b90ec5… (builder di Santa Giustina):
--        prima e dopo 11 oggetti, 6 di Santa Giustina, md5 dell'elenco
--        016e0253c4d0f991db491b46ba260064 in entrambi i casi
--        (11 oggetti contro 10 righe: un orfano resta leggibile, come voluto).
-- (V5) policy INSERT e DELETE del bucket: testo identico a prima.
-- Totali invariati: 63 oggetti nel bucket, 61 righe in documents.
-- NON provato: il flusso reale via API Storage (signed URL e .list() dal
-- browser); la simulazione interroga storage.objects con il ruolo
-- authenticated e le stesse policy che l'API applica.
-- Il testo applicato via MCP è quello di questo file senza i commenti.
-- ============================================================
