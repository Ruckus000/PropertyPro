CREATE TABLE "site_publish_schedules" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"requested_by" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"notify_summary" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "site_publish_schedules" ADD CONSTRAINT "site_publish_schedules_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_publish_schedules" ADD CONSTRAINT "site_publish_schedules_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_publish_schedules_due_idx" ON "site_publish_schedules" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "site_publish_schedules_community_idx" ON "site_publish_schedules" USING btree ("community_id","status");--> statement-breakpoint

-- ===========================================================================
-- WHY
--
-- Launch blocker #7 / gap audit G-07. Meeting materials that must appear a
-- fixed number of days before a meeting depended on somebody remembering to
-- press Publish at the right moment — a §718 clock resting on a human calendar.
--
-- SAFETY: pure EXPAND — one new table, nothing existing is touched. Safe to
-- apply before the code that uses it.
--
-- Idempotent: IF NOT EXISTS / IF EXISTS / DROP-then-CREATE throughout.
-- ===========================================================================

-- Status vocabulary. text + CHECK rather than a pgEnum so the set can evolve
-- without an enum rebuild (same rationale as 0032 storm_damage_reports and
-- 0058 community_export_jobs).
--
-- 'nothing_to_publish' is a distinct TERMINAL state, not an error: the schedule
-- fired correctly and there were no drafts to promote. Folding it into 'failed'
-- would tell a PM their scheduled notice broke when it simply had nothing to do.
--
-- 'running' exists so the cron can CLAIM a row atomically. Without an
-- intermediate state there is no instant at which a row is spoken for but not
-- yet finished, and two overlapping ticks would both publish. The claim is a
-- conditional UPDATE off 'pending', so only one tick can win.
ALTER TABLE "site_publish_schedules" DROP CONSTRAINT IF EXISTS "site_publish_schedules_status_check";--> statement-breakpoint
ALTER TABLE "site_publish_schedules" ADD CONSTRAINT "site_publish_schedules_status_check"
  CHECK ("status" IN ('pending', 'running', 'published', 'nothing_to_publish', 'canceled', 'failed'));--> statement-breakpoint

-- What makes "the next scheduled publish" singular. A publish is atomic and
-- community-wide, so two live schedules for one community have no coherent
-- meaning — the second would silently republish whatever the first left behind.
-- Partial, so completed/canceled schedules do not block scheduling the next one.
-- Drizzle cannot express a partial unique index, hence hand-authored here.
--
-- Covers 'running' as well as 'pending' deliberately: a CLAIMED row is still a
-- live schedule. Were this 'pending'-only, a PM could arm a second schedule
-- while the first was mid-publish, and both would publish and email — the exact
-- double-send this index exists to prevent. That path is reachable only because
-- a lapsed lease makes 'running' rows claimable again, so the two must ship
-- together.
CREATE UNIQUE INDEX IF NOT EXISTS "site_publish_schedules_one_active_idx"
  ON "site_publish_schedules" ("community_id")
  WHERE "status" IN ('pending', 'running') AND "deleted_at" IS NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS
--
-- Read is the MANAGER bar, not the ordinary member bar. An earlier draft used
-- the member bar on the grounds that "the site updates at 3pm" is harmless
-- operational metadata — true of scheduled_for, but not of error_message, which
-- carries why a publish failed and is rendered back to the PM. The sibling
-- community_export_jobs (0058) gates the same class of field the same way. The
-- only reader is the PM editor's GET, which already requires a manager role, so
-- matching it costs nothing.
--
-- Write is the MANAGER bar (pp_rls_can_read_audit_log is granted on the manager
-- row only), because scheduling a publish is the same authority as publishing.
-- The app layer already enforces PM_MANAGER_ROLES; this is defence in depth for
-- the case where it does not.
--
-- The cron connects as service_role and short-circuits via pp_rls_is_privileged().
--
-- Deliberately NOT copying site_blocks' policies: those predate the helper
-- family and read the legacy `app.community_id` GUC, which is documented drift
-- (repaired by 0021/0023). The canonical GUC is app.current_community_id, which
-- is what pp_rls_can_access_community() consults.
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS "public"."site_publish_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."site_publish_schedules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TRIGGER IF EXISTS pp_rls_enforce_tenant_scope ON public."site_publish_schedules";--> statement-breakpoint
CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.site_publish_schedules FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id();--> statement-breakpoint

DROP POLICY IF EXISTS "pp_site_publish_schedules_select" ON public."site_publish_schedules";--> statement-breakpoint
CREATE POLICY "pp_site_publish_schedules_select" ON public."site_publish_schedules" AS PERMISSIVE FOR SELECT TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_site_publish_schedules_insert" ON public."site_publish_schedules";--> statement-breakpoint
CREATE POLICY "pp_site_publish_schedules_insert" ON public."site_publish_schedules" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_site_publish_schedules_update" ON public."site_publish_schedules";--> statement-breakpoint
CREATE POLICY "pp_site_publish_schedules_update" ON public."site_publish_schedules" AS PERMISSIVE FOR UPDATE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))))
  WITH CHECK ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));--> statement-breakpoint
DROP POLICY IF EXISTS "pp_site_publish_schedules_delete" ON public."site_publish_schedules";--> statement-breakpoint
CREATE POLICY "pp_site_publish_schedules_delete" ON public."site_publish_schedules" AS PERMISSIVE FOR DELETE TO public
  USING ((pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))));--> statement-breakpoint

COMMENT ON TABLE "site_publish_schedules" IS
  'Scheduled community-site publishes. At most one live (pending or running) row per community (site_publish_schedules_one_active_idx). Fired by the scheduled-site-publish cron; a lapsed lease_expires_at makes a claimed row re-claimable.';
