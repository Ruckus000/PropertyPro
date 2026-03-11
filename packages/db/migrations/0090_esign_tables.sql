-- 0090: E-signature tables for DocuSeal integration.
--
-- Creates 5 tables:
--   esign_templates   - community-scoped DocuSeal template references
--   esign_submissions - signing request envelopes
--   esign_signers     - individual signer records within a submission
--   esign_events      - append-only audit trail (webhook idempotency, etc.)
--   esign_consent     - UETA/ESIGN Act consent records per user
--
-- All tables are tenant-scoped with RLS enabled + forced.

-- ---------------------------------------------------------------------------
-- 1. esign_templates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."esign_templates" (
  "id"                     bigserial PRIMARY KEY,
  "community_id"           bigint NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "docuseal_template_id"   integer NOT NULL,
  "external_id"            text NOT NULL UNIQUE,
  "name"                   text NOT NULL,
  "description"            text,
  "source_document_path"   text,
  "template_type"          text,
  "fields_schema"          jsonb,
  "status"                 text NOT NULL DEFAULT 'active',
  "created_by"             uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE RESTRICT,
  "created_at"             timestamptz NOT NULL DEFAULT now(),
  "updated_at"             timestamptz NOT NULL DEFAULT now(),
  "deleted_at"             timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_esign_templates_community"
  ON "public"."esign_templates" ("community_id");

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. esign_submissions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."esign_submissions" (
  "id"                       bigserial PRIMARY KEY,
  "community_id"             bigint NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "template_id"              bigint NOT NULL REFERENCES "public"."esign_templates"("id") ON DELETE RESTRICT,
  "docuseal_submission_id"   integer,
  "external_id"              text NOT NULL UNIQUE,
  "status"                   text NOT NULL DEFAULT 'pending',
  "send_email"               boolean NOT NULL DEFAULT false,
  "expires_at"               timestamptz,
  "completed_at"             timestamptz,
  "signed_document_path"     text,
  "audit_certificate_path"   text,
  "linked_document_id"       bigint REFERENCES "public"."documents"("id") ON DELETE SET NULL,
  "message_subject"          text,
  "message_body"             text,
  "created_by"               uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE RESTRICT,
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now(),
  "deleted_at"               timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_esign_submissions_community"
  ON "public"."esign_submissions" ("community_id");

CREATE INDEX IF NOT EXISTS "idx_esign_submissions_status"
  ON "public"."esign_submissions" ("community_id", "status");

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. esign_signers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."esign_signers" (
  "id"                      bigserial PRIMARY KEY,
  "community_id"            bigint NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "submission_id"           bigint NOT NULL REFERENCES "public"."esign_submissions"("id") ON DELETE CASCADE,
  "docuseal_submitter_id"   integer,
  "external_id"             text NOT NULL UNIQUE,
  "user_id"                 uuid REFERENCES "auth"."users"("id") ON DELETE SET NULL,
  "email"                   text NOT NULL,
  "name"                    text,
  "role"                    text NOT NULL,
  "slug"                    text,
  "status"                  text NOT NULL DEFAULT 'pending',
  "opened_at"               timestamptz,
  "completed_at"            timestamptz,
  "signed_values"           jsonb,
  "prefilled_fields"        jsonb,
  "last_reminder_at"        timestamptz,
  "reminder_count"          integer NOT NULL DEFAULT 0,
  "created_at"              timestamptz NOT NULL DEFAULT now(),
  "updated_at"              timestamptz NOT NULL DEFAULT now(),
  "deleted_at"              timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_esign_signers_submission"
  ON "public"."esign_signers" ("submission_id");

CREATE INDEX IF NOT EXISTS "idx_esign_signers_user"
  ON "public"."esign_signers" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_esign_signers_email"
  ON "public"."esign_signers" ("email");

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. esign_events (append-only audit trail)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."esign_events" (
  "id"                bigserial PRIMARY KEY,
  "community_id"      bigint NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "submission_id"     bigint NOT NULL REFERENCES "public"."esign_submissions"("id") ON DELETE CASCADE,
  "signer_id"         bigint REFERENCES "public"."esign_signers"("id") ON DELETE SET NULL,
  "event_type"        text NOT NULL,
  "event_data"        jsonb,
  "ip_address"        text,
  "user_agent"        text,
  "webhook_event_id"  text,
  "created_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_esign_events_submission"
  ON "public"."esign_events" ("submission_id");

CREATE INDEX IF NOT EXISTS "idx_esign_events_webhook"
  ON "public"."esign_events" ("webhook_event_id");

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. esign_consent
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."esign_consent" (
  "id"              bigserial PRIMARY KEY,
  "community_id"    bigint NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "user_id"         uuid NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "consent_given"   boolean NOT NULL DEFAULT true,
  "consent_text"    text NOT NULL,
  "ip_address"      text,
  "user_agent"      text,
  "given_at"        timestamptz NOT NULL DEFAULT now(),
  "revoked_at"      timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_esign_consent_active"
  ON "public"."esign_consent" ("community_id", "user_id")
  WHERE "revoked_at" IS NULL;

--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6. RLS: Enable + Force + Policies for all 5 esign tables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  -- Standard tenant-scoped tables (templates, submissions, signers, events, consent)
  FOR t IN
    SELECT unnest(ARRAY[
      'esign_templates',
      'esign_submissions',
      'esign_signers',
      'esign_events',
      'esign_consent'
    ]::text[])
  LOOP
    EXECUTE format('ALTER TABLE "public".%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE "public".%I FORCE ROW LEVEL SECURITY', t);

    -- Drop existing policies (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_select" ON "public".%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_insert" ON "public".%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_update" ON "public".%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_delete" ON "public".%I', t);

    -- Standard tenant SELECT/INSERT/UPDATE/DELETE policies
    EXECUTE format(
      'CREATE POLICY "pp_tenant_select" ON "public".%I FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"))',
      t
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_insert" ON "public".%I FOR INSERT WITH CHECK ("public"."pp_rls_can_access_community"("community_id"))',
      t
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_update" ON "public".%I FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id")) WITH CHECK ("public"."pp_rls_can_access_community"("community_id"))',
      t
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_delete" ON "public".%I FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"))',
      t
    );

    -- Tenant scope enforcement trigger
    EXECUTE format('DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public".%I', t);
    EXECUTE format(
      'CREATE TRIGGER "pp_rls_enforce_tenant_scope" BEFORE INSERT OR UPDATE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"()',
      t
    );
  END LOOP;
END $$;
