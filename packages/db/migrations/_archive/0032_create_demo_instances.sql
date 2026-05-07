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
  -- Encrypted payload format: enc:v1:<iv_b64url>:<ciphertext_b64url>:<tag_b64url>
  -- Plaintext secrets are rejected by this constraint.
  auth_token_secret text NOT NULL
    CONSTRAINT demo_instances_auth_token_secret_encrypted_ck
    CHECK (auth_token_secret LIKE 'enc:v1:%'),
  external_crm_url text,
  prospect_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE demo_instances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demo_instances FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON demo_instances TO service_role;

COMMENT ON TABLE demo_instances IS 'Demo instance tracking for sales demos. service_role only.';
COMMENT ON COLUMN demo_instances.auth_token_secret IS 'Encrypted HMAC secret ciphertext payload (enc:v1), never plaintext.';
