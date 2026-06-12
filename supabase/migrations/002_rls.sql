-- ============================================================
-- CasaZero — Row Level Security v1
-- Applica DOPO 001_schema.sql
-- Sicuro da rieseguire: funzioni con OR REPLACE, policy con DROP IF EXISTS
-- ============================================================

-- ============================================================
-- Funzioni helper in public (auth schema non accessibile in Supabase)
-- SECURITY DEFINER evita RLS ricorsiva
-- search_path fisso previene search_path injection
-- ============================================================

CREATE OR REPLACE FUNCTION public.czero_user_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.czero_user_builder_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT builder_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.czero_can_access_residence(p_residence_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND (
      (p.role = 'super_admin'
        AND p.builder_id = (SELECT builder_id FROM public.residences WHERE id = p_residence_id))
      OR
      (p.role = 'admin'
        AND EXISTS (SELECT 1 FROM public.admin_assignments
                    WHERE profile_id = auth.uid() AND residence_id = p_residence_id))
      OR
      (p.role = 'client'
        AND EXISTS (
          SELECT 1 FROM public.unit_members um
          JOIN public.units u ON u.id = um.unit_id
          WHERE um.profile_id = auth.uid()
            AND u.residence_id = p_residence_id
            AND um.ended_at IS NULL
        ))
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.czero_can_access_unit(p_unit_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND (
      (p.role = 'super_admin'
        AND p.builder_id = (
          SELECT r.builder_id FROM public.units u
          JOIN public.residences r ON r.id = u.residence_id
          WHERE u.id = p_unit_id
        ))
      OR
      (p.role = 'admin'
        AND EXISTS (
          SELECT 1 FROM public.admin_assignments aa
          JOIN public.units u ON u.residence_id = aa.residence_id
          WHERE aa.profile_id = auth.uid() AND u.id = p_unit_id
        ))
      OR
      (p.role = 'client'
        AND EXISTS (
          SELECT 1 FROM public.unit_members
          WHERE profile_id = auth.uid()
            AND unit_id = p_unit_id
            AND ended_at IS NULL
        ))
    )
  )
$$;

-- ============================================================
-- Abilita RLS su tutte le tabelle (idempotente)
-- ============================================================
ALTER TABLE builders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE residences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE units                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE completions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites               ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- builders
-- ============================================================
DROP POLICY IF EXISTS "builders: super_admin legge il proprio"   ON builders;
DROP POLICY IF EXISTS "builders: super_admin aggiorna il proprio" ON builders;

CREATE POLICY "builders: super_admin legge il proprio"
  ON builders FOR SELECT
  USING (id = public.czero_user_builder_id() AND public.czero_user_role() = 'super_admin');

CREATE POLICY "builders: super_admin aggiorna il proprio"
  ON builders FOR UPDATE
  USING (id = public.czero_user_builder_id() AND public.czero_user_role() = 'super_admin');

-- ============================================================
-- residences
-- ============================================================
DROP POLICY IF EXISTS "residences: lettura se si ha accesso" ON residences;
DROP POLICY IF EXISTS "residences: super_admin inserisce"    ON residences;
DROP POLICY IF EXISTS "residences: super_admin aggiorna"     ON residences;

CREATE POLICY "residences: lettura se si ha accesso"
  ON residences FOR SELECT
  USING (public.czero_can_access_residence(id));

CREATE POLICY "residences: super_admin inserisce"
  ON residences FOR INSERT
  WITH CHECK (
    public.czero_user_role() = 'super_admin'
    AND builder_id = public.czero_user_builder_id()
  );

CREATE POLICY "residences: super_admin aggiorna"
  ON residences FOR UPDATE
  USING (
    public.czero_user_role() = 'super_admin'
    AND builder_id = public.czero_user_builder_id()
  );

-- ============================================================
-- units
-- ============================================================
DROP POLICY IF EXISTS "units: lettura se si ha accesso" ON units;
DROP POLICY IF EXISTS "units: super_admin inserisce"    ON units;
DROP POLICY IF EXISTS "units: super_admin aggiorna"     ON units;

CREATE POLICY "units: lettura se si ha accesso"
  ON units FOR SELECT
  USING (public.czero_can_access_unit(id));

CREATE POLICY "units: super_admin inserisce"
  ON units FOR INSERT
  WITH CHECK (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM residences
      WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
    )
  );

CREATE POLICY "units: super_admin aggiorna"
  ON units FOR UPDATE
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM residences
      WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
    )
  );

-- ============================================================
-- profiles
-- ============================================================
DROP POLICY IF EXISTS "profiles: legge il proprio"                          ON profiles;
DROP POLICY IF EXISTS "profiles: aggiorna il proprio"                       ON profiles;
DROP POLICY IF EXISTS "profiles: super_admin legge i profili del builder"   ON profiles;
DROP POLICY IF EXISTS "profiles: admin legge i clienti delle proprie residenze" ON profiles;
DROP POLICY IF EXISTS "profiles: super_admin inserisce profili nel proprio builder" ON profiles;

CREATE POLICY "profiles: legge il proprio"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles: aggiorna il proprio"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "profiles: super_admin legge i profili del builder"
  ON profiles FOR SELECT
  USING (
    public.czero_user_role() = 'super_admin'
    AND builder_id = public.czero_user_builder_id()
  );

CREATE POLICY "profiles: admin legge i clienti delle proprie residenze"
  ON profiles FOR SELECT
  USING (
    public.czero_user_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM unit_members um
      JOIN units u ON u.id = um.unit_id
      JOIN admin_assignments aa ON aa.residence_id = u.residence_id
      WHERE um.profile_id = profiles.id AND aa.profile_id = auth.uid()
    )
  );

CREATE POLICY "profiles: super_admin inserisce profili nel proprio builder"
  ON profiles FOR INSERT
  WITH CHECK (
    public.czero_user_role() = 'super_admin'
    AND builder_id = public.czero_user_builder_id()
  );

-- ============================================================
-- unit_members
-- ============================================================
DROP POLICY IF EXISTS "unit_members: il membro legge i propri"  ON unit_members;
DROP POLICY IF EXISTS "unit_members: super_admin gestisce tutto" ON unit_members;

CREATE POLICY "unit_members: il membro legge i propri"
  ON unit_members FOR SELECT
  USING (profile_id = auth.uid() OR public.czero_can_access_unit(unit_id));

CREATE POLICY "unit_members: super_admin gestisce tutto"
  ON unit_members FOR ALL
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM units u
      JOIN residences r ON r.id = u.residence_id
      WHERE u.id = unit_id AND r.builder_id = public.czero_user_builder_id()
    )
  );

-- ============================================================
-- admin_assignments
-- ============================================================
DROP POLICY IF EXISTS "admin_assignments: admin legge le proprie"     ON admin_assignments;
DROP POLICY IF EXISTS "admin_assignments: super_admin gestisce tutto" ON admin_assignments;

CREATE POLICY "admin_assignments: admin legge le proprie"
  ON admin_assignments FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "admin_assignments: super_admin gestisce tutto"
  ON admin_assignments FOR ALL
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM residences
      WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
    )
  );

-- ============================================================
-- maintenance_templates (catalogo globale)
-- ============================================================
DROP POLICY IF EXISTS "templates: tutti gli autenticati leggono" ON maintenance_templates;

CREATE POLICY "templates: tutti gli autenticati leggono"
  ON maintenance_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- maintenance_items
-- ============================================================
DROP POLICY IF EXISTS "items: lettura se si ha accesso"  ON maintenance_items;
DROP POLICY IF EXISTS "items: super_admin gestisce tutto" ON maintenance_items;
DROP POLICY IF EXISTS "items: admin aggiorna stato"       ON maintenance_items;

CREATE POLICY "items: lettura se si ha accesso"
  ON maintenance_items FOR SELECT
  USING (
    (unit_id IS NULL AND public.czero_can_access_residence(residence_id))
    OR
    (unit_id IS NOT NULL AND public.czero_can_access_unit(unit_id))
  );

CREATE POLICY "items: super_admin gestisce tutto"
  ON maintenance_items FOR ALL
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM residences
      WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
    )
  );

CREATE POLICY "items: admin aggiorna stato"
  ON maintenance_items FOR UPDATE
  USING (
    public.czero_user_role() = 'admin'
    AND public.czero_can_access_residence(residence_id)
  );

-- ============================================================
-- completions — IMMUTABILE: solo INSERT
-- UPDATE e DELETE bloccati (nessuna policy → denied)
-- ============================================================
DROP POLICY IF EXISTS "completions: lettura se si ha accesso" ON completions;
DROP POLICY IF EXISTS "completions: inserimento autorizzato"  ON completions;

CREATE POLICY "completions: lettura se si ha accesso"
  ON completions FOR SELECT
  USING (
    (unit_id IS NOT NULL AND public.czero_can_access_unit(unit_id))
    OR
    (unit_id IS NULL AND public.czero_can_access_residence(residence_id))
  );

CREATE POLICY "completions: inserimento autorizzato"
  ON completions FOR INSERT
  WITH CHECK (
    (public.czero_user_role() = 'client'
      AND unit_id IS NOT NULL
      AND public.czero_can_access_unit(unit_id))
    OR
    (public.czero_user_role() = 'admin'
      AND public.czero_can_access_residence(residence_id))
    OR
    (public.czero_user_role() = 'super_admin'
      AND EXISTS (
        SELECT 1 FROM residences
        WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
      ))
  );
-- Nessuna policy UPDATE/DELETE → bloccate a livello RLS

-- ============================================================
-- documents
-- ============================================================
DROP POLICY IF EXISTS "documents: lettura se si ha accesso"      ON documents;
DROP POLICY IF EXISTS "documents: admin e super_admin gestiscono" ON documents;

CREATE POLICY "documents: lettura se si ha accesso"
  ON documents FOR SELECT
  USING (
    (unit_id IS NOT NULL AND public.czero_can_access_unit(unit_id))
    OR
    (unit_id IS NULL AND public.czero_can_access_residence(residence_id))
  );

CREATE POLICY "documents: admin e super_admin gestiscono"
  ON documents FOR ALL
  USING (
    (public.czero_user_role() = 'admin' AND public.czero_can_access_residence(residence_id))
    OR
    (public.czero_user_role() = 'super_admin'
      AND EXISTS (
        SELECT 1 FROM residences
        WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
      ))
  );

-- ============================================================
-- attachments
-- ============================================================
DROP POLICY IF EXISTS "attachments: lettura via completion"            ON attachments;
DROP POLICY IF EXISTS "attachments: inserimento con accesso completion" ON attachments;

CREATE POLICY "attachments: lettura via completion"
  ON attachments FOR SELECT
  USING (
    (completion_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM completions c
      WHERE c.id = completion_id AND (
        (c.unit_id IS NOT NULL AND public.czero_can_access_unit(c.unit_id))
        OR
        (c.unit_id IS NULL AND public.czero_can_access_residence(c.residence_id))
      )
    ))
    OR
    (document_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_id AND (
        (d.unit_id IS NOT NULL AND public.czero_can_access_unit(d.unit_id))
        OR
        (d.unit_id IS NULL AND public.czero_can_access_residence(d.residence_id))
      )
    ))
  );

CREATE POLICY "attachments: inserimento con accesso completion"
  ON attachments FOR INSERT
  WITH CHECK (
    (completion_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM completions c
      WHERE c.id = completion_id AND (
        (c.unit_id IS NOT NULL AND public.czero_can_access_unit(c.unit_id))
        OR public.czero_can_access_residence(c.residence_id)
      )
    ))
    OR
    (document_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_id AND public.czero_can_access_residence(d.residence_id)
    ))
  );

-- ============================================================
-- suppliers
-- ============================================================
DROP POLICY IF EXISTS "suppliers: lettura se si ha accesso alla residenza" ON suppliers;
DROP POLICY IF EXISTS "suppliers: super_admin gestisce"                    ON suppliers;

CREATE POLICY "suppliers: lettura se si ha accesso alla residenza"
  ON suppliers FOR SELECT
  USING (public.czero_can_access_residence(residence_id));

CREATE POLICY "suppliers: super_admin gestisce"
  ON suppliers FOR ALL
  USING (
    public.czero_user_role() = 'super_admin'
    AND EXISTS (
      SELECT 1 FROM residences
      WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
    )
  );

-- ============================================================
-- notifications
-- ============================================================
DROP POLICY IF EXISTS "notifications: solo le proprie" ON notifications;

CREATE POLICY "notifications: solo le proprie"
  ON notifications FOR SELECT
  USING (profile_id = auth.uid());

-- INSERT gestito dal backend con service_role (bypassa RLS)

-- ============================================================
-- comments
-- ============================================================
DROP POLICY IF EXISTS "comments: lettura se l'item è accessibile"       ON comments;
DROP POLICY IF EXISTS "comments: inserimento se si ha accesso all'item" ON comments;
DROP POLICY IF EXISTS "comments: elimina solo i propri"                 ON comments;

CREATE POLICY "comments: lettura se l'item è accessibile"
  ON comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM maintenance_items mi
      WHERE mi.id = item_id AND (
        (mi.unit_id IS NULL AND public.czero_can_access_residence(mi.residence_id))
        OR
        (mi.unit_id IS NOT NULL AND public.czero_can_access_unit(mi.unit_id))
      )
    )
  );

CREATE POLICY "comments: inserimento se si ha accesso all'item"
  ON comments FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM maintenance_items mi
      WHERE mi.id = item_id AND (
        (mi.unit_id IS NULL AND public.czero_can_access_residence(mi.residence_id))
        OR
        (mi.unit_id IS NOT NULL AND public.czero_can_access_unit(mi.unit_id))
      )
    )
  );

CREATE POLICY "comments: elimina solo i propri"
  ON comments FOR DELETE
  USING (profile_id = auth.uid());

-- ============================================================
-- invites
-- ============================================================
DROP POLICY IF EXISTS "invites: super_admin gestisce" ON invites;

CREATE POLICY "invites: super_admin gestisce"
  ON invites FOR ALL
  USING (
    public.czero_user_role() = 'super_admin'
    AND (
      (unit_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM units u
        JOIN residences r ON r.id = u.residence_id
        WHERE u.id = unit_id AND r.builder_id = public.czero_user_builder_id()
      ))
      OR
      (residence_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM residences
        WHERE id = residence_id AND builder_id = public.czero_user_builder_id()
      ))
    )
  );

-- Token pubblico: lettura tramite API route con service_role
-- (il token viene verificato lato server prima di esporre l'invite)
