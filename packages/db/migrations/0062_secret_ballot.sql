-- §718.128 secret ballot — remove every path from a cast vote to a voter.
--
-- ⚠️ THIS IS A CONTRACT (DESTRUCTIVE) MIGRATION AND IT IS IRREVERSIBLE.
--
-- `election_ballots` carried submission_id, unit_id, voter_hash, is_proxy_vote
-- and proxy_id. Each was a direct or one-join path from a vote to the unit and
-- the person who cast it, which means the ballot was never actually secret —
-- anyone with database access could read the election. Dropping them is the
-- fix, and it destroys that linkage permanently. That is the point, but it also
-- means a mis-timed apply cannot be undone by re-adding the columns: the data
-- is gone.
--
-- ── Apply order (expand-before-code does NOT apply here) ──
--
-- This is a CONTRACT migration: apply it only AFTER the code that stops reading
-- those columns is live, or every vote submission 500s in the window between.
--
-- ── Do not apply to production without attorney sign-off ──
--
-- E-voting is gated off everywhere (`electionsAttorneyReviewed`) and the audit
-- records that it needs attorney review before shipping. This migration makes
-- the schema defensible; it does not make the feature reviewed. Applying it
-- early destroys audit linkage for any election already recorded, in exchange
-- for a secrecy property nobody is relying on yet.
--
-- Integrity guarantees did not disappear, they moved:
--   * one ballot per unit  → uq_election_ballot_submissions_unit (already existed)
--   * duplicate-submission → election_ballot_submissions.selection_digest (added here)
--   * turnout / eligibility → the submission table, where per-unit facts belong
--
-- See docs/audits/2026-08-09-legal-risk-audit.md F-08.

ALTER TABLE "election_ballots" DROP CONSTRAINT "election_ballots_submission_id_election_ballot_submissions_id_fk";
--> statement-breakpoint
ALTER TABLE "election_ballots" DROP CONSTRAINT "election_ballots_unit_id_units_id_fk";
--> statement-breakpoint
DROP INDEX "idx_election_ballots_unit";--> statement-breakpoint
DROP INDEX "idx_election_ballots_submission";--> statement-breakpoint
DROP INDEX "uq_election_ballots_unit_candidate";--> statement-breakpoint
ALTER TABLE "election_ballot_submissions" ADD COLUMN "selection_digest" text;--> statement-breakpoint
CREATE INDEX "idx_election_ballots_candidate" ON "election_ballots" USING btree ("election_id","candidate_id");--> statement-breakpoint
ALTER TABLE "election_ballots" DROP COLUMN "submission_id";--> statement-breakpoint
ALTER TABLE "election_ballots" DROP COLUMN "unit_id";--> statement-breakpoint
ALTER TABLE "election_ballots" DROP COLUMN "voter_hash";--> statement-breakpoint
ALTER TABLE "election_ballots" DROP COLUMN "is_proxy_vote";--> statement-breakpoint
ALTER TABLE "election_ballots" DROP COLUMN "proxy_id";
