-- M4: Allow all authenticated users to read their own builder (white-label)
DROP POLICY IF EXISTS "builders: members can read own" ON builders;
CREATE POLICY "builders: members can read own"
  ON builders FOR SELECT
  USING (id = public.czero_user_builder_id());

-- RLS for invites: super_admin manages invites; anyone with the token can read (service role used in welcome page)
DROP POLICY IF EXISTS "invites: super_admin full" ON invites;
CREATE POLICY "invites: super_admin full"
  ON invites FOR ALL
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM residences r
      WHERE r.builder_id = public.czero_user_builder_id()
        AND (
          invites.residence_id = r.id
          OR EXISTS (SELECT 1 FROM units u WHERE u.id = invites.unit_id AND u.residence_id = r.id)
        )
    )
  );

-- Allow admin to create invites for their assigned residences
DROP POLICY IF EXISTS "invites: admin can insert for assigned" ON invites;
CREATE POLICY "invites: admin can insert for assigned"
  ON invites FOR INSERT
  WITH CHECK (
    public.czero_user_role() = 'admin'
    AND public.czero_can_access_residence(invites.residence_id)
  );

-- Allow admin to read invites for their residences
DROP POLICY IF EXISTS "invites: admin can read assigned" ON invites;
CREATE POLICY "invites: admin can read assigned"
  ON invites FOR SELECT
  USING (
    public.czero_user_role() = 'admin'
    AND public.czero_can_access_residence(invites.residence_id)
  );

-- Allow admin to delete (revoke) invites they can access
DROP POLICY IF EXISTS "invites: admin can delete" ON invites;
CREATE POLICY "invites: admin can delete"
  ON invites FOR DELETE
  USING (
    public.czero_user_role() IN ('admin', 'super_admin')
    AND public.czero_can_access_residence(invites.residence_id)
  );
