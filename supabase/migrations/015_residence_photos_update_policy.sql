-- ============================================================
-- CasaZero — Policy UPDATE per il bucket PUBBLICO residence-photos
-- Applica DOPO 014_residence_photos_bucket.sql
--
-- La 014 ha policy INSERT/SELECT/DELETE ma NON UPDATE. updateResidencePhoto usa
-- upsert:true su path deterministico (${residence_id}/facade.<ext>): il primo
-- salvataggio è un INSERT (ok), il secondo — stesso path, oggetto già esistente —
-- è un UPDATE su storage.objects, negato dall'RLS ("new row violates row-level
-- security policy"). Questa policy aggiunge il comando UPDATE mancante.
--
-- Specchia la forma della INSERT di 014 (public.czero_user_role() = 'super_admin').
-- Una UPDATE-policy richiede SIA USING (riga esistente) SIA WITH CHECK (riga nuova).
-- NON tocca le policy INSERT/SELECT/DELETE esistenti né altri bucket.
--
-- Idempotente: DROP POLICY IF EXISTS prima del CREATE.
-- ============================================================

DROP POLICY IF EXISTS "residence-photos bucket: update super_admin" ON storage.objects;
CREATE POLICY "residence-photos bucket: update super_admin"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'residence-photos'
    AND public.czero_user_role() = 'super_admin'
  )
  WITH CHECK (
    bucket_id = 'residence-photos'
    AND public.czero_user_role() = 'super_admin'
  );
