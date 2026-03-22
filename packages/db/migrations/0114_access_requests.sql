-- 0114_access_requests.sql
-- Self-service resident signup: access request table with OTP verification

CREATE TABLE IF NOT EXISTS "access_requests" (
  "id" bigserial PRIMARY KEY,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "full_name" varchar(255) NOT NULL,
  "phone" varchar(50),
  "unit_id" bigint REFERENCES "units"("id") ON DELETE SET NULL,
  "claimed_unit_number" varchar(100),
  "role_requested" varchar(20) NOT NULL DEFAULT 'resident',
  "is_unit_owner" boolean NOT NULL DEFAULT false,
  "status" varchar(20) NOT NULL DEFAULT 'pending_verification',
  "otp_hash" varchar(255),
  "otp_expires_at" timestamp with time zone,
  "otp_attempts" integer NOT NULL DEFAULT 0,
  "email_verified_at" timestamp with time zone,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp with time zone,
  "denial_reason" text,
  "ref_code" varchar(50),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

-- Partial indexes (soft-delete aware)
CREATE INDEX idx_access_requests_community_status
  ON access_requests(community_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_access_requests_email
  ON access_requests(email) WHERE deleted_at IS NULL;

-- Prevent duplicate pending requests per email per community
CREATE UNIQUE INDEX idx_access_requests_unique_pending
  ON access_requests(community_id, email)
  WHERE status IN ('pending_verification', 'pending') AND deleted_at IS NULL;

-- RLS
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY "access_requests_tenant_insert"
  ON access_requests FOR INSERT
  WITH CHECK (community_id = current_setting('app.community_id', true)::bigint);

CREATE POLICY "access_requests_tenant_select"
  ON access_requests FOR SELECT
  USING (community_id = current_setting('app.community_id', true)::bigint);

CREATE POLICY "access_requests_tenant_update"
  ON access_requests FOR UPDATE
  USING (community_id = current_setting('app.community_id', true)::bigint);

-- Write-scope trigger (standard tenant isolation)
CREATE TRIGGER enforce_community_scope
  BEFORE INSERT OR UPDATE ON access_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_community_write_scope();
