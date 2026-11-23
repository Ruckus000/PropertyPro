-- Emergency alert scheduling (spec 2026-11-23). Expand-only: four nullable
-- columns, one CHECK and one partial index on emergency_broadcasts. No default,
-- no backfill. Apply to production BEFORE the code that reads the columns.
--
-- scheduled_for:       set means "send later at this time"; NULL = immediate.
-- send_claimed_at:     set by the scheduled-emergency-broadcasts cron's atomic
--                      claim. A claimed alert cannot be canceled or re-claimed.
-- send_outcome:        NULL, 'missed' or 'failed'.
-- send_outcome_reason: 'late', 'community_deleted' or an error class name.
--                      Never a message body or an address.
--
-- The partial index serves the cron's cross-tenant scan for due alerts.
-- Every existing row has NULL in all four columns, so the CHECK validates
-- immediately. Fail fast instead of queueing behind a long read.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "emergency_broadcasts" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emergency_broadcasts" ADD COLUMN "send_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emergency_broadcasts" ADD COLUMN "send_outcome" text;--> statement-breakpoint
ALTER TABLE "emergency_broadcasts" ADD COLUMN "send_outcome_reason" text;--> statement-breakpoint
CREATE INDEX "emergency_broadcasts_scheduled_due_idx" ON "emergency_broadcasts" USING btree ("scheduled_for") WHERE "emergency_broadcasts"."scheduled_for" IS NOT NULL AND "emergency_broadcasts"."send_claimed_at" IS NULL AND "emergency_broadcasts"."canceled_at" IS NULL AND "emergency_broadcasts"."send_outcome" IS NULL;--> statement-breakpoint
ALTER TABLE "emergency_broadcasts" ADD CONSTRAINT "emergency_broadcasts_send_outcome_check" CHECK ("emergency_broadcasts"."send_outcome" IS NULL OR "emergency_broadcasts"."send_outcome" IN ('missed', 'failed'));
