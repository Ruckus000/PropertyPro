CREATE TABLE demo_instances (
  id bigserial PRIMARY KEY,
  template_type community_type NOT NULL,
  prospect_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  theme jsonb NOT NULL,
  seeded_community_id bigint REFERENCES communities ON DELETE SET NULL,
  demo_resident_user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  demo_board_user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  demo_resident_email text NOT NULL,
  demo_board_email text NOT NULL,
  -- NOTE: auth_token_secret is stored plaintext. Acceptable for ephemeral demo
  -- instances (short-lived, non-production data). For production secrets, migrate
  -- to Supabase Vault (pgsodium) when available.
  auth_token_secret text NOT NULL,
  external_crm_url text,
  prospect_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE demo_instances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demo_instances FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON demo_instances TO service_role;

COMMENT ON TABLE demo_instances IS 'Demo instance tracking for sales demos. service_role only.';
