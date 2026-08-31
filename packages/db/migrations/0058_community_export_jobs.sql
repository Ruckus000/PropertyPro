CREATE TABLE "community_export_job_parts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"job_id" bigint NOT NULL,
	"part_index" integer NOT NULL,
	"storage_path" text NOT NULL,
	"byte_size" bigint DEFAULT 0 NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "community_export_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"requested_by" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"include_document_files" boolean DEFAULT true NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"claimed_by" text,
	"cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"download_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"total_bytes" bigint,
	"part_count" integer,
	"error_code" text,
	"error_message" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "community_export_job_parts" ADD CONSTRAINT "community_export_job_parts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_export_job_parts" ADD CONSTRAINT "community_export_job_parts_job_id_community_export_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."community_export_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_export_jobs" ADD CONSTRAINT "community_export_jobs_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_export_jobs" ADD CONSTRAINT "community_export_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_export_job_parts_job_index_idx" ON "community_export_job_parts" USING btree ("job_id","part_index");--> statement-breakpoint
CREATE INDEX "community_export_job_parts_community_idx" ON "community_export_job_parts" USING btree ("community_id");--> statement-breakpoint
CREATE INDEX "community_export_jobs_community_status_idx" ON "community_export_jobs" USING btree ("community_id","status");--> statement-breakpoint
CREATE INDEX "community_export_jobs_claim_idx" ON "community_export_jobs" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "community_export_jobs_expiry_idx" ON "community_export_jobs" USING btree ("expires_at");--> statement-breakpoint

-- ===========================================================================
-- WHY
--
-- Florida associations must retain official records for years
-- (§718.111(12)(b)), and the Terms now promise export "at any time, including
-- after your subscription has lapsed". The synchronous CSV export cannot honour
-- that: metadata only, 4 tables, capped at 10,000 rows each. These tables back
-- an asynchronous, resumable, full-record export.
-- See docs/audits/2026-08-09-legal-risk-audit.md F-07.
--
-- SAFETY: pure EXPAND — two new tables, nothing existing is touched. Safe to
-- apply before the code that uses them.
--
-- Idempotent: IF NOT EXISTS / IF EXISTS / DROP-then-CREATE throughout.
-- ===========================================================================

-- Status vocabulary. text + CHECK rather than a pgEnum so the set can evolve
-- without an enum rebuild (same rationale as storm_damage_reports 0032).
ALTER TABLE "community_export_jobs" DROP CONSTRAINT IF EXISTS "community_export_jobs_status_check";--> statement-breakpoint
ALTER TABLE "community_export_jobs" ADD CONSTRAINT "community_export_jobs_status_check"
  CHECK ("status" IN ('queued', 'running', 'ready', 'failed', 'expired', 'cancelled'));--> statement-breakpoint

-- THE request-side idempotency key. At most one in-flight export per community:
-- a double-click must return the existing job, not queue a second copy of the
-- entire association. Partial, so completed/failed jobs do not block a re-request.
-- Drizzle cannot express a partial unique index, hence hand-authored here.
CREATE UNIQUE INDEX IF NOT EXISTS "community_export_jobs_one_active_idx"
  ON "community_export_jobs" ("community_id")
  WHERE "status" IN ('queued', 'running') AND "deleted_at" IS NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS — tenant_admin_write family
--
-- An export archive is a copy of the WHOLE association including resident PII,
-- so these rows carry the audit-log read bar (pp_rls_can_read_audit_log), not
-- the ordinary member bar. The worker connects as service_role and short-circuits
-- via pp_rls_is_privileged().
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS "public"."community_export_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."community_export_jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."community_export_jobs";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.community_export_jobs FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint

DROP POLICY IF EXISTS "pp_community_export_jobs_select" ON public."community_export_jobs";--> statement-breakpoint
CREATE POLICY "pp_community_export_jobs_select" ON public."community_export_jobs" AS PERMISSIVE FOR SELECT TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_community_export_jobs_insert" ON public."community_export_jobs";--> statement-breakpoint
CREATE POLICY "pp_community_export_jobs_insert" ON public."community_export_jobs" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_community_export_jobs_update" ON public."community_export_jobs";--> statement-breakpoint
CREATE POLICY "pp_community_export_jobs_update" ON public."community_export_jobs" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))))
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_community_export_jobs_delete" ON public."community_export_jobs";--> statement-breakpoint
CREATE POLICY "pp_community_export_jobs_delete" ON public."community_export_jobs" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));--> statement-breakpoint

ALTER TABLE IF EXISTS "public"."community_export_job_parts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."community_export_job_parts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."community_export_job_parts";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.community_export_job_parts FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint

DROP POLICY IF EXISTS "pp_community_export_job_parts_select" ON public."community_export_job_parts";--> statement-breakpoint
CREATE POLICY "pp_community_export_job_parts_select" ON public."community_export_job_parts" AS PERMISSIVE FOR SELECT TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_community_export_job_parts_insert" ON public."community_export_job_parts";--> statement-breakpoint
CREATE POLICY "pp_community_export_job_parts_insert" ON public."community_export_job_parts" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_community_export_job_parts_update" ON public."community_export_job_parts";--> statement-breakpoint
CREATE POLICY "pp_community_export_job_parts_update" ON public."community_export_job_parts" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))))
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_community_export_job_parts_delete" ON public."community_export_job_parts";--> statement-breakpoint
CREATE POLICY "pp_community_export_job_parts_delete" ON public."community_export_job_parts" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));
