CREATE TABLE "cron_runs" (
	"job_slug" text PRIMARY KEY NOT NULL,
	"last_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_succeeded_at" timestamp with time zone,
	"last_status" text,
	"last_duration_ms" integer,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ===========================================================================
-- WHY
--
-- Failure alerting cannot see a job that STOPS RUNNING. In 2026-08 all
-- seventeen crons returned 401 for months behind a green Vercel dashboard, and
-- that produced ZERO Sentry events: requireCronSecret throws UnauthorizedError,
-- an AppError, and withErrorHandler returns before Sentry capture for those.
-- Registration is not evidence — `vercel crons ls` listed every job as healthy
-- the entire time it was dead.
--
-- So "did it run?" needs a durable record of its own. One row per job, upserted
-- by withCronJob, read by /api/v1/internal/cron-health. Bounded at seventeen
-- rows forever, so there is no retention concern and no history to prune.
--
-- SAFETY: pure EXPAND — one new table, nothing existing is touched. Safe to
-- apply before the code that uses it, which is the required order.
-- ===========================================================================

-- Platform-scoped, so there is no community_id and no tenant policy: the only
-- writer is the cron itself and the only reader is the health probe, both
-- running as service_role, which short-circuits via pp_rls_is_privileged().
--
-- RLS is still ENABLED rather than left off. `scripts/verify-scoped-db-access.ts`
-- fails a new table with no RLS, and allowlisting it would be the wrong fix:
-- "nothing tenant-scoped lives here" is a reason for no POLICY, not a reason to
-- leave the table readable by any role that reaches it. With RLS enabled and no
-- policy, non-privileged roles see nothing — which is exactly right.
ALTER TABLE "cron_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cron_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

COMMENT ON TABLE "cron_runs" IS
  'One row per scheduled job: when it last started, last SUCCEEDED, and how it went. Written by withCronJob, read by /api/v1/internal/cron-health. Freshness of last_succeeded_at is the only signal that catches a job which stopped running entirely.';
