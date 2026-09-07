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
-- ⚠️ THAT CONDITION IS NOW MET, AND THE ORDERING HAS INVERTED (2026-09-07).
--
-- The post-migration code is live in production, so this is no longer "safe to
-- defer" — it is now a PRECONDITION for turning e-voting on. `castBallot`
-- (apps/web/src/lib/services/elections-service.ts) writes
-- `election_ballot_submissions.selection_digest`, which production does not have
-- (42703 undefined_column), and inserts into `election_ballots` without
-- `submission_id` / `unit_id` / `voter_hash`, which are NOT NULL there with no
-- default (23502 not_null_violation).
--
-- So: setting `electionsAttorneyReviewed` on any community WITHOUT applying this
-- first means the very first ballot cast 500s. The only reason that is invisible
-- today is that the flag is absent on all 9 production communities. Whoever
-- flips it owns applying this migration first.
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

-- ⚠️ The FK names below differ between database lineages. Do not "tidy" this
-- back to a single bare DROP CONSTRAINT — that is what made this migration
-- unappliable to production, and it fails on the FIRST statement.
--
-- Production's elections tables were created by the hand-written
-- `_archive/0102_elections_schema.sql`, whose inline REFERENCES clauses took
-- Postgres' default `<table>_<column>_fkey` names. The squash baseline
-- `0000_nappy_guardian.sql` declares the same FKs under drizzle's generated
-- `<table>_<col>_<reftable>_<refcol>_fk` names, which is what a freshly migrated
-- local or CI database has. Neither spelling exists in both places.
--
-- Measured against production 2026-09-07: `election_ballots` carries
-- `election_ballots_submission_id_fkey` and `election_ballots_unit_id_fkey`, and
-- NEITHER drizzle-style name is present — while 73 `_fk`-style FK names do exist
-- on other tables, so this divergence is specific to the elections tables, not
-- a database-wide convention.
--
-- One wrinkle if you are reading an error message: the drizzle-style submission
-- name is 64 characters, one over Postgres' 63-byte identifier limit, so it is
-- stored (and matched) TRUNCATED as
-- `election_ballots_submission_id_election_ballot_submissions_id_f` — no
-- trailing "k". That is why a failure here names a constraint that looks
-- subtly misspelled. Truncation applies to the DROP statement too, so writing
-- the full name is still correct.
--
-- Dropping both spellings IF EXISTS applies cleanly to either lineage. These
-- statements are strictly redundant — DROP COLUMN below removes a column's own
-- constraints and indexes with it — but naming them keeps the migration
-- self-describing about exactly which linkage is being destroyed.
ALTER TABLE "election_ballots" DROP CONSTRAINT IF EXISTS "election_ballots_submission_id_election_ballot_submissions_id_fk";
--> statement-breakpoint
ALTER TABLE "election_ballots" DROP CONSTRAINT IF EXISTS "election_ballots_submission_id_fkey";
--> statement-breakpoint
ALTER TABLE "election_ballots" DROP CONSTRAINT IF EXISTS "election_ballots_unit_id_units_id_fk";
--> statement-breakpoint
ALTER TABLE "election_ballots" DROP CONSTRAINT IF EXISTS "election_ballots_unit_id_fkey";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_election_ballots_unit";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_election_ballots_submission";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_election_ballots_unit_candidate";--> statement-breakpoint
ALTER TABLE "election_ballot_submissions" ADD COLUMN "selection_digest" text;--> statement-breakpoint
CREATE INDEX "idx_election_ballots_candidate" ON "election_ballots" USING btree ("election_id","candidate_id");--> statement-breakpoint
ALTER TABLE "election_ballots" DROP COLUMN "submission_id";--> statement-breakpoint
ALTER TABLE "election_ballots" DROP COLUMN "unit_id";--> statement-breakpoint
ALTER TABLE "election_ballots" DROP COLUMN "voter_hash";--> statement-breakpoint
ALTER TABLE "election_ballots" DROP COLUMN "is_proxy_vote";--> statement-breakpoint
ALTER TABLE "election_ballots" DROP COLUMN "proxy_id";
