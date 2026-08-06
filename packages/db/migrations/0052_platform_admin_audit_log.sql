-- ============================================================================
-- 0052 — platform_admin_audit_log
--
-- An append-only audit trail for PLATFORM-level operator actions taken in
-- apps/admin.
--
-- WHY A NEW TABLE
--
-- Neither existing audit table can represent a platform-level action:
-- compliance_audit_log.community_id and support_access_log.community_id are
-- BOTH NOT NULL. Granting or revoking platform-admin access has no community
-- at all, so those actions were simply never recorded anywhere. Today there is
-- no record of who granted admin, who deleted a tenant, or who un-deleted one.
--
-- compliance_audit_log also answers a different question: it is the statutory,
-- tenant-visible record required by §718.111(12). Cross-tenant operator
-- activity does not belong in a tenant's compliance trail.
--
-- NULLABLE community_id, ON DELETE SET NULL
--
-- Nullable because platform actions have no community. SET NULL rather than
-- CASCADE because the demo hard-delete destroys the very community it is being
-- audited for — with CASCADE, deleting a tenant would delete the evidence that
-- it was deleted, which is precisely backwards for an audit log.
--
-- NO FOREIGN KEY ON admin_user_id
--
-- Mirrors support_access_log. Platform admins live in platform_admin_users,
-- which does not require a public.users row; compliance_audit_log.user_id
-- carries an ON DELETE RESTRICT FK to users.id that would reject such an actor
-- outright. admin_email is denormalized alongside it so the trail stays
-- readable after the acting account is gone.
--
-- APPEND-ONLY
--
-- Enforced twice, deliberately:
--   1. service_role is granted SELECT and INSERT only — no UPDATE, no DELETE.
--      This is the control that matters, because every admin write goes
--      through the service-role PostgREST client.
--   2. A BEFORE UPDATE OR DELETE trigger raises unconditionally. This catches
--      the privileged Drizzle/superuser connection, which holds rolbypassrls
--      and is not constrained by the grant above.
--
-- RLS POSTURE — ZERO POLICIES IS THE POINT
--
-- RLS enabled and FORCED with no policies at all is the deny-everyone default,
-- matching the platform-table posture set by 0035 / 0037 / 0038. The REVOKE is
-- defence in depth on top of it: if a policy is ever added here, it cannot
-- silently become anon-reachable the moment it lands.
--
-- This is a PLATFORM table, not a tenant table: it takes an entry in
-- RLS_GLOBAL_TABLE_EXCLUSIONS and must NOT bump
-- RLS_EXPECTED_TENANT_TABLE_COUNT.
--
-- SEQUENCING — EXPAND
--
-- Pure expand (new table only). Apply to production BEFORE the code that
-- writes to it ships. Nothing reads it yet.
--
-- Numbered 0052 rather than 0050: 0050 and 0051 are claimed by the unmerged
-- branch claude/go-to-market-plan-jlsgua (marketing_leads). The ordering guard
-- only rejects an idx already present on main, so it cannot catch that
-- collision until the other branch merges.
--
-- Idempotent throughout — safe to re-apply.
--
-- Keep in sync with scripts/sql/local-supabase-post-migrate.sql, which
-- re-asserts the revocation list on the test database after the stub's blanket
-- grant.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "public"."platform_admin_audit_log" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "admin_user_id" uuid NOT NULL,
  "admin_email" text,
  "action" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text,
  "community_id" bigint,
  "old_values" jsonb,
  "new_values" jsonb,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_admin_audit_log_community_id_communities_id_fk'
  ) THEN
    ALTER TABLE "public"."platform_admin_audit_log"
      ADD CONSTRAINT "platform_admin_audit_log_community_id_communities_id_fk"
      FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_platform_admin_audit_log_created_at"
  ON "public"."platform_admin_audit_log" USING btree ("created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_admin_audit_log_admin_user_id"
  ON "public"."platform_admin_audit_log" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_admin_audit_log_community_id"
  ON "public"."platform_admin_audit_log" USING btree ("community_id");--> statement-breakpoint

-- --------------------------------------------------------------------------
-- Append-only enforcement
-- --------------------------------------------------------------------------
-- SECURITY INVOKER (the default), not DEFINER: the function's only statement
-- is a RAISE, so it needs no elevated privilege, and DEFINER would widen its
-- surface for nothing.
CREATE OR REPLACE FUNCTION "public"."pp_platform_admin_audit_log_append_only"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION
    'platform_admin_audit_log is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS "pp_platform_admin_audit_log_append_only"
  ON "public"."platform_admin_audit_log";--> statement-breakpoint

CREATE TRIGGER "pp_platform_admin_audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "public"."platform_admin_audit_log"
  FOR EACH ROW EXECUTE FUNCTION "public"."pp_platform_admin_audit_log_append_only"();--> statement-breakpoint

-- TRUNCATE needs its OWN statement-level trigger.
--
-- A FOR EACH ROW trigger never fires for TRUNCATE — there are no rows to fire
-- per — so the UPDATE/DELETE trigger above provides no protection against it.
-- TRUNCATE is included in the ALL that Supabase's default privileges grant, so
-- without this (and without the REVOKE further down) a single statement could
-- erase the whole operator audit trail with neither control tripping.
DROP TRIGGER IF EXISTS "pp_platform_admin_audit_log_no_truncate"
  ON "public"."platform_admin_audit_log";--> statement-breakpoint

CREATE TRIGGER "pp_platform_admin_audit_log_no_truncate"
  BEFORE TRUNCATE ON "public"."platform_admin_audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."pp_platform_admin_audit_log_append_only"();--> statement-breakpoint

-- --------------------------------------------------------------------------
-- Lockdown: RLS enabled + forced, zero policies, service_role SELECT/INSERT only
-- --------------------------------------------------------------------------
ALTER TABLE IF EXISTS "public"."platform_admin_audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."platform_admin_audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- service_role is REVOKED before it is granted, and this order is load-bearing.
--
-- Supabase's bootstrap sets
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO
--     postgres, anon, authenticated, service_role;
-- so the CREATE TABLE above has ALREADY given service_role the full set —
-- verified against production, where a table created by our own migrations
-- shows service_role holding DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE.
--
-- GRANT is additive: it takes nothing away. Without the REVOKE below, the
-- narrow "SELECT, INSERT" grant is a no-op and the append-only property does
-- not exist at all. Every sibling platform table (0035/0037/0038) grants full
-- CRUD, so this has never mattered before; here it is the entire point.
REVOKE ALL ON TABLE "public"."platform_admin_audit_log" FROM anon, authenticated, service_role;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "public"."platform_admin_audit_log" TO service_role;--> statement-breakpoint

-- The bigserial's sequence needs its own grant for INSERT to work.
REVOKE ALL ON SEQUENCE "public"."platform_admin_audit_log_id_seq" FROM anon, authenticated, service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "public"."platform_admin_audit_log_id_seq" TO service_role;
