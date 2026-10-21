-- Drop the three cancellation-capture columns on `communities`.
--
-- WHAT THEY WERE
--
-- `cancellation_reason`, `cancellation_note` and `cancellation_captured_at`
-- recorded why a community cancelled. Their only writer was the in-app cancel
-- dialog, which was never rendered and was deleted in #1391; nothing reads
-- them. This is a CONTRACT migration: apply it only after the code without
-- these schema fields is live.
--
-- PRE-DROP CHECKS (production, read-only, 2026-10-20)
--
--   0 rows have any of the three set. No views, functions or indexes
--   reference them.

ALTER TABLE "communities" DROP COLUMN "cancellation_reason";--> statement-breakpoint
ALTER TABLE "communities" DROP COLUMN "cancellation_note";--> statement-breakpoint
ALTER TABLE "communities" DROP COLUMN "cancellation_captured_at";