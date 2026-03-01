CREATE TYPE platform_admin_role AS ENUM ('super_admin');

CREATE TABLE platform_admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role platform_admin_role NOT NULL DEFAULT 'super_admin',
  invited_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_admin_users FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_admin_users TO service_role;

COMMENT ON TABLE platform_admin_users IS 'Platform admin authorization. service_role only. Checked by apps/admin middleware.';
