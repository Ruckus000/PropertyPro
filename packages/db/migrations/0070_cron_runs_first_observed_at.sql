-- ===========================================================================
-- WHY
--
-- `/api/v1/internal/cron-health` reported 503 for a job that was not broken,
-- and would have gone on doing so for a month.
--
-- The probe treats "no row" as stale, which is right for a job that stopped
-- running and wrong for one that has not had a chance to start. `cron_runs`
-- shipped 2026-09-06; `generate-assessments` runs `0 5 1 * *`, so its last real
-- run (2026-09-01) predated the table and its next (2026-10-01) was 24 days
-- out. Sixteen of seventeen jobs were green and the endpoint was red.
--
-- That is not a cosmetic complaint. The uptime monitor this endpoint exists for
-- (docs/LAUNCH-BLOCKERS.md item 5) cannot be pointed at a probe that is red by
-- construction, and a probe left red for a month is one nobody looks at when it
-- goes red for a reason. It also RECURS: any job added later whose interval
-- exceeds the age of its row has the same problem.
--
-- So the table records when it first became aware of a job, and the probe asks
-- whether that job's own window has elapsed since — the same tolerance every
-- other job already gets, applied from the right starting point.
--
-- SAFETY: pure EXPAND. One added column with a default, and one constraint
-- RELAXED. Nothing is dropped and nothing existing is rewritten, so the live
-- code that predates this migration keeps working against the new shape:
-- `recordCronRun` always supplies `last_started_at`, and `first_observed_at`
-- defaults. Apply BEFORE the code ships, per .claude/rules/migration-safety.md.
-- ===========================================================================

-- Null until the job actually runs. It was NOT NULL DEFAULT now() when only a
-- run could create a row; a registered-but-never-run row under that shape would
-- have had to claim a start that never happened.
ALTER TABLE "cron_runs" ALTER COLUMN "last_started_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cron_runs" ALTER COLUMN "last_started_at" DROP NOT NULL;--> statement-breakpoint

-- Deliberately not `registered_at`: "registration is not evidence" is the whole
-- lesson of the 2026-08 outage, where `vercel crons ls` listed seventeen dead
-- jobs as healthy for months. Reusing that word on the column that GRANTS grace
-- would invite precisely the wrong reading of it.
--
-- Backfilling existing rows to now() is correct rather than merely convenient:
-- every row that exists today was created BY A RUN, so its grace window is
-- irrelevant — the probe reads `last_succeeded_at` for those and never consults
-- this column.
ALTER TABLE "cron_runs" ADD COLUMN "first_observed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

COMMENT ON COLUMN "cron_runs"."first_observed_at" IS
  'When the heartbeat first knew about this job — NOT when it first ran. A job with no run yet is only stale once its own maxAgeMinutes has elapsed since this moment; before that it is awaiting a first run, not missing.';
