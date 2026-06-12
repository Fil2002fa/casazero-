-- ============================================================
-- CasaZero — Schema v1
-- Applica in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Enum types
CREATE TYPE user_role          AS ENUM ('client', 'admin', 'super_admin');
CREATE TYPE maintenance_priority AS ENUM ('N1', 'N2', 'N3');
CREATE TYPE maintenance_scope  AS ENUM ('unit', 'condominium');
CREATE TYPE maintenance_status AS ENUM ('in_attesa', 'scaduta', 'in_corso', 'completata');
CREATE TYPE document_category  AS ENUM ('proprieta', 'tecnici', 'energetici', 'conformita', 'amministrativi');
CREATE TYPE notification_channel AS ENUM ('push', 'email');
CREATE TYPE notification_status  AS ENUM ('pending', 'sent', 'failed');

-- ============================================================
-- builders — tenant del costruttore
-- ============================================================
CREATE TABLE builders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  logo_url      TEXT,
  primary_color TEXT NOT NULL DEFAULT '#04342C',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- residences — residenze del costruttore
-- ============================================================
CREATE TABLE residences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  builder_id    UUID NOT NULL REFERENCES builders(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address       TEXT,
  energy_class  TEXT,
  photo_url     TEXT,
  delivery_date DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_residences_builder ON residences(builder_id);

-- ============================================================
-- units — unità immobiliari
-- ============================================================
CREATE TABLE units (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  residence_id UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,  -- es. "Unità 7"
  floor        INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_units_residence ON units(residence_id);

-- ============================================================
-- profiles — estende auth.users
-- ============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  builder_id  UUID REFERENCES builders(id),
  role        user_role NOT NULL DEFAULT 'client',
  full_name   TEXT,
  phone       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_builder ON profiles(builder_id);

-- ============================================================
-- unit_members — relazione utente↔unità (storicizzata)
-- ============================================================
CREATE TABLE unit_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  ended_at    DATE,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_unit_members_unit    ON unit_members(unit_id);
CREATE INDEX idx_unit_members_profile ON unit_members(profile_id);

-- ============================================================
-- admin_assignments — relazione amministratore↔residenza
-- ============================================================
CREATE TABLE admin_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  residence_id UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, residence_id)
);

CREATE INDEX idx_admin_assignments_profile   ON admin_assignments(profile_id);
CREATE INDEX idx_admin_assignments_residence ON admin_assignments(residence_id);

-- ============================================================
-- suppliers — fornitori per residenza
-- ============================================================
CREATE TABLE suppliers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  residence_id UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  categories   TEXT[],
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_residence ON suppliers(residence_id);

-- ============================================================
-- maintenance_templates — catalogo 27 voci
-- ============================================================
CREATE TABLE maintenance_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  category         TEXT NOT NULL,
  description      TEXT,
  frequency_months INTEGER NOT NULL,
  priority         maintenance_priority NOT NULL,
  scope            maintenance_scope NOT NULL,
  sort_order       INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- maintenance_items — istanza per residenza/unità
-- ============================================================
CREATE TABLE maintenance_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      UUID NOT NULL REFERENCES maintenance_templates(id),
  residence_id     UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
  unit_id          UUID REFERENCES units(id) ON DELETE CASCADE, -- NULL → scope condominio
  frequency_months INTEGER,                 -- override template
  priority         maintenance_priority,    -- override template
  warranty_info    TEXT,
  supplier_id      UUID REFERENCES suppliers(id),
  next_due_date    DATE,
  status           maintenance_status NOT NULL DEFAULT 'in_attesa',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_items_residence ON maintenance_items(residence_id);
CREATE INDEX idx_items_unit      ON maintenance_items(unit_id);
CREATE INDEX idx_items_status    ON maintenance_items(status);

-- ============================================================
-- completions — registro immutabile (il fascicolo)
-- ============================================================
CREATE TABLE completions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                  UUID NOT NULL REFERENCES maintenance_items(id),
  unit_id                  UUID REFERENCES units(id),
  residence_id             UUID NOT NULL REFERENCES residences(id),
  completed_at             DATE NOT NULL,
  performed_by_profile_id  UUID REFERENCES profiles(id),
  performed_by_name        TEXT,  -- testo libero per fornitore esterno
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Nessun updated_at — record immutabile
);

CREATE INDEX idx_completions_item      ON completions(item_id);
CREATE INDEX idx_completions_unit      ON completions(unit_id);
CREATE INDEX idx_completions_residence ON completions(residence_id);

-- ============================================================
-- documents — archivio documenti
-- ============================================================
CREATE TABLE documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  residence_id UUID NOT NULL REFERENCES residences(id) ON DELETE CASCADE,
  unit_id      UUID REFERENCES units(id) ON DELETE CASCADE, -- NULL → documento di residenza
  category     document_category NOT NULL,
  title        TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_date    DATE,
  uploaded_by  UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_residence ON documents(residence_id);
CREATE INDEX idx_documents_unit      ON documents(unit_id);

-- ============================================================
-- attachments — file allegati a completions o documents
-- ============================================================
CREATE TABLE attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id UUID REFERENCES completions(id) ON DELETE CASCADE,
  document_id   UUID REFERENCES documents(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  file_size     INTEGER,
  mime_type     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (completion_id IS NOT NULL AND document_id IS NULL)
    OR
    (completion_id IS NULL AND document_id IS NOT NULL)
  )
);

CREATE INDEX idx_attachments_completion ON attachments(completion_id);
CREATE INDEX idx_attachments_document   ON attachments(document_id);

-- ============================================================
-- notifications — coda notifiche
-- ============================================================
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,  -- 'maintenance_due' | 'maintenance_overdue' | 'n3_status_changed' | ecc.
  payload    JSONB,
  channel    notification_channel NOT NULL DEFAULT 'email',
  status     notification_status NOT NULL DEFAULT 'pending',
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_profile ON notifications(profile_id);
CREATE INDEX idx_notifications_status  ON notifications(status);

-- ============================================================
-- comments — thread per maintenance_item
-- ============================================================
CREATE TABLE comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID NOT NULL REFERENCES maintenance_items(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_item ON comments(item_id);

-- ============================================================
-- invites — token di invito (QR o email)
-- ============================================================
CREATE TABLE invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  unit_id      UUID REFERENCES units(id) ON DELETE CASCADE,
  residence_id UUID REFERENCES residences(id) ON DELETE CASCADE,
  role         user_role NOT NULL DEFAULT 'client',
  email        TEXT,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  used_at      TIMESTAMPTZ,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (unit_id IS NOT NULL OR residence_id IS NOT NULL)
);

CREATE INDEX idx_invites_token ON invites(token);
CREATE UNIQUE INDEX idx_invites_token_unique ON invites(token);

-- ============================================================
-- Trigger: crea profilo automaticamente al signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger: aggiorna updated_at su profiles
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER maintenance_items_updated_at
  BEFORE UPDATE ON maintenance_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
