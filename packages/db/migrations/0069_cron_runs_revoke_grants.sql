-- ===========================================================================
-- WHY
--
-- 0067 created `cron_runs` and enabled + forced RLS with zero policies, then
-- reasoned: "with RLS enabled and no policy, non-privileged roles see nothing —
-- which is exactly right." That is true, and it is not the whole posture.
--
-- Under Supabase's open grant baseline the table still carried table-level
-- GRANTS. Measured in production 2026-09-06:
--
--     anon           SELECT
--     authenticated  SELECT, INSERT, UPDATE, DELETE
--
-- Not exploitable today — RLS with zero policies denies every non-privileged
-- caller regardless of grants. But it leaves the table one permissive policy
-- away from letting any logged-in resident DELETE the monitoring signal, and it
-- diverges from every sibling platform table: revenue_snapshots (0035) and
-- user_search_index (0037) each pair the RLS lockdown with REVOKE ALL.
--
-- This is the same reasoning gap `rls-config.ts` already records for three
-- other tables, where "not tenant-scoped" was mistaken for "needs no further
-- lockdown" and left them anon-readable for years. Closing it here rather than
-- leaving it as accepted exposure.
--
-- SAFETY: revoking from anon/authenticated only. `service_role` keeps CRUD, and
-- the privileged Drizzle connection holds rolbypassrls, so neither writer is
-- affected: withCronJob writes over the unscoped client and
-- /api/v1/internal/cron-health reads over the same. Nothing else touches the
-- table.
--
-- Idempotent: REVOKE on an absent privilege is a no-op.
-- ===========================================================================

REVOKE ALL ON TABLE "public"."cron_runs" FROM anon;--> statement-breakpoint
REVOKE ALL ON TABLE "public"."cron_runs" FROM authenticated;--> statement-breakpoint

-- Stated explicitly rather than relied upon from the baseline, so the intended
-- end state is readable in one place.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."cron_runs" TO service_role;
