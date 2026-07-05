-- ============================================================
-- CasaZero — Bucket Storage PUBBLICO per le foto delle residenze
-- Applica DOPO 013_add_unit_atomic.sql
--
-- Le foto delle residenze sono facciate: asset NON sensibili. A differenza
-- di 'documents' e 'attachments' (privati), questo bucket è public = true,
-- così storage.getPublicUrl() produce un URL che carica in un <img> senza
-- autenticazione (l'hero nella home del residente).
-- I bucket privati esistenti NON vengono toccati e restano privati.
--
-- Idempotente: bucket con ON CONFLICT DO NOTHING, policy con DROP IF EXISTS.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'residence-photos',
  'residence-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Lettura PUBBLICA: il flag public = true già serve il public URL senza auth.
-- Replichiamo comunque una SELECT policy esplicita per coerenza col pattern dei
-- bucket esistenti, ma SENZA la clausola auth.uid() IS NOT NULL: la lettura è
-- volutamente aperta anche all'utente anonimo, coerente con public = true.
DROP POLICY IF EXISTS "residence-photos bucket: lettura pubblica" ON storage.objects;
CREATE POLICY "residence-photos bucket: lettura pubblica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'residence-photos');

-- Upload: ristretto al super_admin (difesa in profondità che rispecchia il gate
-- della server action). Stessa forma di controllo ruolo usata nell'RLS del progetto.
DROP POLICY IF EXISTS "residence-photos bucket: upload super_admin" ON storage.objects;
CREATE POLICY "residence-photos bucket: upload super_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'residence-photos'
    AND public.czero_user_role() = 'super_admin'
  );

-- Delete: solo chi ha caricato il file, come i bucket esistenti.
DROP POLICY IF EXISTS "residence-photos bucket: delete proprio" ON storage.objects;
CREATE POLICY "residence-photos bucket: delete proprio"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'residence-photos' AND owner_id = auth.uid()::TEXT);
