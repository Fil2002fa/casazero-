-- ============================================================
-- CasaZero — Migration 009
-- Aggiunge policy RLS: super_admin legge i profili dei clienti
-- che sono membri di unità nelle residenze del proprio builder.
--
-- Problema: i profili cliente hanno builder_id = NULL, quindi
-- la policy esistente "super_admin legge i profili del builder"
-- (che filtra builder_id = czero_user_builder_id()) non li trova.
-- Questa policy copre il caso mancante con lo stesso pattern
-- della policy analoga per il ruolo 'admin'.
--
-- Scope: SELECT-only su profiles. Non tocca altre tabelle.
-- ============================================================

DROP POLICY IF EXISTS "profiles: super_admin legge i clienti delle proprie residenze" ON profiles;

CREATE POLICY "profiles: super_admin legge i clienti delle proprie residenze"
  ON profiles FOR SELECT
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM unit_members um
      JOIN units u ON u.id = um.unit_id
      JOIN residences r ON r.id = u.residence_id
      WHERE um.profile_id = profiles.id
        AND r.builder_id = public.czero_user_builder_id()
    )
  );
