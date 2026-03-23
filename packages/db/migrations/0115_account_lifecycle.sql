-- 0115_account_lifecycle.sql
-- Account lifecycle: free access plans + deletion workflows

-- 1. access_plans (platform-level, NOT tenant-scoped)
CREATE TABLE IF NOT EXISTS "access_plans" (
  "id" bigserial PRIMARY KEY,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "grace_ends_at" timestamp with time zone NOT NULL,
  "duration_months" integer NOT NULL,
  "grace_period_days" integer NOT NULL DEFAULT 30,
  "stripe_coupon_id" text,
  "granted_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "notes" text,
  "converted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "email_14d_sent_at" timestamp with time zone,
  "email_7d_sent_at" timestamp with time zone,
  "email_expired_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_access_plans_community ON access_plans(community_id);
CREATE INDEX idx_access_plans_expires ON access_plans(expires_at) WHERE revoked_at IS NULL AND converted_at IS NULL;

-- No RLS on access_plans — platform-level table, service_role access only
REVOKE ALL ON access_plans FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON access_plans TO service_role;

-- 2. account_deletion_requests (platform-level, NOT tenant-scoped)
CREATE TABLE IF NOT EXISTS "account_deletion_requests" (
  "id" bigserial PRIMARY KEY,
  "request_type" text NOT NULL CHECK (request_type IN ('user', 'community')),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "community_id" bigint REFERENCES "communities"("id") ON DELETE SET NULL,
  "status" text NOT NULL CHECK (status IN ('cooling', 'soft_deleted', 'purged', 'cancelled', 'recovered')),
  "cooling_ends_at" timestamp with time zone NOT NULL,
  "scheduled_purge_at" timestamp with time zone,
  "purged_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "cancelled_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "recovered_at" timestamp with time zone,
  "platform_admin_notified_at" timestamp with time zone,
  "intervention_notes" text,
  "confirmation_email_sent_at" timestamp with time zone,
  "execution_email_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_deletion_requests_user_status ON account_deletion_requests(user_id, status);
CREATE INDEX idx_deletion_requests_community_status ON account_deletion_requests(community_id, status);
CREATE INDEX idx_deletion_requests_cooling ON account_deletion_requests(status, cooling_ends_at) WHERE status = 'cooling';
CREATE INDEX idx_deletion_requests_purge ON account_deletion_requests(status, scheduled_purge_at) WHERE status = 'soft_deleted';

-- No RLS — platform-level table
REVOKE ALL ON account_deletion_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON account_deletion_requests TO service_role;

-- 3. Add free_access_expires_at to communities
ALTER TABLE "communities" ADD COLUMN IF NOT EXISTS "free_access_expires_at" timestamp with time zone;
