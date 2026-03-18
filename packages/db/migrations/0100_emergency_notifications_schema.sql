-- 0100: Emergency Notifications schema (Phase 1B).
--
-- Creates 2 tables:
--   emergency_broadcasts           - community-scoped emergency alert records
--   emergency_broadcast_recipients - per-recipient delivery tracking (SMS + email)
--
-- Extends 2 tables:
--   notification_preferences       - SMS consent columns (TCPA compliance)
--   users                          - phone_verified_at column
--
-- All new tables are tenant-scoped with RLS enabled + forced.

-- ---------------------------------------------------------------------------
-- 1. Extend notification_preferences with SMS consent columns
-- ---------------------------------------------------------------------------

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_emergency_only BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sms_consent_given_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_consent_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_consent_method TEXT;

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Extend users with phone verification timestamp
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. emergency_broadcasts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."emergency_broadcasts" (
  "id"                BIGSERIAL PRIMARY KEY,
  "community_id"      BIGINT NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "title"             TEXT NOT NULL,
  "body"              TEXT NOT NULL,
  "sms_body"          TEXT,
  "severity"          TEXT NOT NULL DEFAULT 'emergency',
  "template_key"      TEXT,
  "target_audience"   TEXT NOT NULL DEFAULT 'all',
  "channels"          TEXT NOT NULL DEFAULT 'sms,email',
  "recipient_count"   INTEGER NOT NULL DEFAULT 0,
  "sent_count"        INTEGER NOT NULL DEFAULT 0,
  "delivered_count"   INTEGER NOT NULL DEFAULT 0,
  "failed_count"      INTEGER NOT NULL DEFAULT 0,
  "initiated_by"      UUID NOT NULL REFERENCES "public"."users"("id") ON DELETE RESTRICT,
  "initiated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "completed_at"      TIMESTAMPTZ,
  "canceled_at"       TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"        TIMESTAMPTZ,
  CONSTRAINT emergency_broadcasts_severity_check CHECK (
    severity IN ('emergency', 'urgent', 'info')
  ),
  CONSTRAINT emergency_broadcasts_target_audience_check CHECK (
    target_audience IN ('all', 'owners_only')
  )
);

ALTER TABLE "public"."emergency_broadcasts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."emergency_broadcasts" FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_emergency_broadcasts_community_initiated"
  ON "public"."emergency_broadcasts" ("community_id", "initiated_at" DESC);

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. emergency_broadcast_recipients
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."emergency_broadcast_recipients" (
  "id"                  BIGSERIAL PRIMARY KEY,
  "community_id"        BIGINT NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "broadcast_id"        BIGINT NOT NULL REFERENCES "public"."emergency_broadcasts"("id") ON DELETE CASCADE,
  "user_id"             UUID NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "email"               TEXT,
  "phone"               TEXT,
  "sms_status"          TEXT NOT NULL DEFAULT 'pending',
  "sms_provider_sid"    TEXT,
  "sms_error_code"      TEXT,
  "sms_error_message"   TEXT,
  "sms_sent_at"         TIMESTAMPTZ,
  "sms_delivered_at"    TIMESTAMPTZ,
  "email_status"        TEXT NOT NULL DEFAULT 'pending',
  "email_provider_id"   TEXT,
  "email_sent_at"       TIMESTAMPTZ,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT emergency_broadcast_recipients_sms_status_check CHECK (
    sms_status IN ('pending', 'queued', 'sent', 'delivered', 'failed', 'undelivered', 'skipped')
  ),
  CONSTRAINT emergency_broadcast_recipients_email_status_check CHECK (
    email_status IN ('pending', 'sent', 'failed', 'skipped')
  ),
  CONSTRAINT emergency_broadcast_recipients_broadcast_user_unique
    UNIQUE ("broadcast_id", "user_id")
);

ALTER TABLE "public"."emergency_broadcast_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."emergency_broadcast_recipients" FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_ebr_broadcast_sms_status"
  ON "public"."emergency_broadcast_recipients" ("broadcast_id", "sms_status");

CREATE INDEX IF NOT EXISTS "idx_ebr_broadcast_email_status"
  ON "public"."emergency_broadcast_recipients" ("broadcast_id", "email_status");

CREATE INDEX IF NOT EXISTS "idx_ebr_sms_provider_sid"
  ON "public"."emergency_broadcast_recipients" ("sms_provider_sid")
  WHERE "sms_provider_sid" IS NOT NULL;
