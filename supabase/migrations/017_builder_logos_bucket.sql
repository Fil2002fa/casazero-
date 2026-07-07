-- ============================================================
-- CasaZero — Bucket Storage PUBBLICO per i loghi dei builder
-- Applica DOPO 016_builders_admin_select_policy.sql
--
-- Il logo builder è branding pubblico (mostrato nell'header shell e nelle
-- card admin), non un documento del condominio: va in un bucket dedicato,
-- pubblico, distinto da 'documents' (privato, contiene i documenti dei
-- condomini e NON va reso pubblico). Stesso ragionamento e stessa forma
-- di 014_residence_photos_bucket.sql + 015_residence_photos_update_policy.sql,
-- applicati qui al logo invece che alla foto residenza.
-- I bucket privati esistenti (documents, attachments) NON vengono toccati.
--
-- Idempotente: bucket con ON CONFLICT DO NOTHING, policy con DROP IF EXISTS.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'builder-logos',
  'builder-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Lettura PUBBLICA: il flag public = true già serve il public URL senza auth.
-- Replichiamo comunque una SELECT policy esplicita per coerenza col pattern dei
-- bucket esistenti, ma SENZA la clausola auth.uid() IS NOT NULL: la lettura è
-- volutamente aperta anche all'utente anonimo, coerente con public = true.
DROP POLICY IF EXISTS "builder-logos bucket: lettura pubblica" ON storage.objects;
CREATE POLICY "builder-logos bucket: lettura pubblica"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'builder-logos');

-- Upload: ristretto al super_admin (difesa in profondità che rispecchia il gate
-- della server action). Stessa forma di controllo ruolo usata nell'RLS del progetto.
DROP POLICY IF EXISTS "builder-logos bucket: upload super_admin" ON storage.objects;
CREATE POLICY "builder-logos bucket: upload super_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'builder-logos'
    AND public.czero_user_role() = 'super_admin'
  );

-- Update: upsert:true su path deterministico (${builder_id}/logo.<ext>) richiede
-- anche UPDATE, non solo INSERT (stesso motivo di 015 per residence-photos).
DROP POLICY IF EXISTS "builder-logos bucket: update super_admin" ON storage.objects;
CREATE POLICY "builder-logos bucket: update super_admin"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'builder-logos'
    AND public.czero_user_role() = 'super_admin'
  )
  WITH CHECK (
    bucket_id = 'builder-logos'
    AND public.czero_user_role() = 'super_admin'
  );

-- Delete: solo chi ha caricato il file, come i bucket esistenti.
DROP POLICY IF EXISTS "builder-logos bucket: delete proprio" ON storage.objects;
CREATE POLICY "builder-logos bucket: delete proprio"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'builder-logos' AND owner_id = auth.uid()::TEXT);
