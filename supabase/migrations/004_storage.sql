-- ============================================================
-- CasaZero — Storage bucket per allegati
-- Applica DOPO 003_m2.sql
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Lettura: qualsiasi utente autenticato (l'accesso reale è controllato dall'RLS su attachments)
CREATE POLICY "attachments bucket: lettura autenticata"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);

-- Upload: qualsiasi utente autenticato
CREATE POLICY "attachments bucket: upload autenticato"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);

-- Delete: solo chi ha caricato il file
CREATE POLICY "attachments bucket: delete proprio"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'attachments' AND owner_id = auth.uid()::TEXT);
