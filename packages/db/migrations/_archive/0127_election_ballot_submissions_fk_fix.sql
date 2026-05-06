-- Phase 5 elections submission FK cleanup.
--
-- 0126 introduced election_ballot_submissions as an immutable append-only
-- header table, but the submitted_by_user_id foreign key still used ON DELETE
-- SET NULL while the column remained NOT NULL. That makes hard deletes of user
-- rows fail unexpectedly and conflicts with the non-null data contract used by
-- the election service.
--
-- Keep the ballot submission actor reference strict and preserve the append-only
-- audit trail by switching the foreign key to ON DELETE RESTRICT.

ALTER TABLE "public"."election_ballot_submissions"
  DROP CONSTRAINT IF EXISTS "election_ballot_submissions_submitted_by_user_id_fkey";

ALTER TABLE "public"."election_ballot_submissions"
  ADD CONSTRAINT "election_ballot_submissions_submitted_by_user_id_fkey"
  FOREIGN KEY ("submitted_by_user_id")
  REFERENCES "public"."users"("id")
  ON DELETE RESTRICT;

