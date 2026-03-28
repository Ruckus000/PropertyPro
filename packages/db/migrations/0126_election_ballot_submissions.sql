-- Phase 5 elections submission model:
-- - create logical ballot submissions table (one row per unit/election)
-- - attach election_ballots rows to a required submission header
-- - preserve append-only + tenant isolation guarantees with RLS

CREATE TABLE IF NOT EXISTS "public"."election_ballot_submissions" (
  "id" BIGSERIAL PRIMARY KEY,
  "community_id" BIGINT NOT NULL REFERENCES "public"."communities"("id") ON DELETE CASCADE,
  "election_id" BIGINT NOT NULL REFERENCES "public"."elections"("id") ON DELETE CASCADE,
  "unit_id" BIGINT NOT NULL REFERENCES "public"."units"("id") ON DELETE CASCADE,
  "submitted_by_user_id" UUID NOT NULL REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "submission_fingerprint" TEXT NOT NULL,
  "voter_hash" TEXT NOT NULL,
  "is_abstention" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_proxy_vote" BOOLEAN NOT NULL DEFAULT FALSE,
  "proxy_id" BIGINT,
  "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "public"."election_ballot_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."election_ballot_submissions" FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS "idx_election_ballot_submissions_election"
  ON "public"."election_ballot_submissions" ("election_id", "submitted_at");

CREATE INDEX IF NOT EXISTS "idx_election_ballot_submissions_unit"
  ON "public"."election_ballot_submissions" ("election_id", "unit_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_election_ballot_submissions_unit"
  ON "public"."election_ballot_submissions" ("election_id", "unit_id");

CREATE POLICY "pp_tenant_select" ON "public"."election_ballot_submissions"
  FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"));

CREATE POLICY "pp_election_ballot_submissions_insert" ON "public"."election_ballot_submissions"
  FOR INSERT WITH CHECK (
    "public"."pp_rls_can_access_community"("community_id")
  );

ALTER TABLE "public"."election_ballot_submissions"
  ADD CONSTRAINT "election_ballot_submissions_proxy_id_fkey"
  FOREIGN KEY ("proxy_id") REFERENCES "public"."election_proxies"("id") ON DELETE SET NULL;

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public"."election_ballot_submissions";
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT ON "public"."election_ballot_submissions"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

--> statement-breakpoint

ALTER TABLE "public"."election_ballots"
  ADD COLUMN IF NOT EXISTS "submission_id" BIGINT;

WITH grouped_ballots AS (
  SELECT DISTINCT ON ("election_id", "unit_id")
    "community_id",
    "election_id",
    "unit_id",
    "proxy_id",
    "voter_hash",
    "is_abstention",
    "is_proxy_vote",
    "cast_at",
    COALESCE(
      (
        SELECT "created_by_user_id"
        FROM "public"."elections"
        WHERE "public"."elections"."id" = "public"."election_ballots"."election_id"
      ),
      '00000000-0000-0000-0000-000000000000'::uuid
    ) AS "submitted_by_user_id",
    md5(
      concat_ws(
        ':',
        "election_id"::text,
        "unit_id"::text,
        COALESCE("proxy_id"::text, ''),
        "voter_hash",
        "cast_at"::text
      )
    ) AS "submission_fingerprint"
  FROM "public"."election_ballots"
  ORDER BY "election_id", "unit_id", "cast_at"
)
INSERT INTO "public"."election_ballot_submissions" (
  "community_id",
  "election_id",
  "unit_id",
  "submitted_by_user_id",
  "submission_fingerprint",
  "voter_hash",
  "is_abstention",
  "is_proxy_vote",
  "proxy_id",
  "submitted_at"
)
SELECT
  "community_id",
  "election_id",
  "unit_id",
  "submitted_by_user_id",
  "submission_fingerprint",
  "voter_hash",
  "is_abstention",
  "is_proxy_vote",
  "proxy_id",
  "cast_at"
FROM grouped_ballots
ON CONFLICT ("election_id", "unit_id") DO NOTHING;

UPDATE "public"."election_ballots" AS ballots
SET "submission_id" = submissions."id"
FROM "public"."election_ballot_submissions" AS submissions
WHERE submissions."election_id" = ballots."election_id"
  AND submissions."unit_id" = ballots."unit_id"
  AND ballots."submission_id" IS NULL;

ALTER TABLE "public"."election_ballots"
  ALTER COLUMN "submission_id" SET NOT NULL;

ALTER TABLE "public"."election_ballots"
  ADD CONSTRAINT "election_ballots_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "public"."election_ballot_submissions"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_election_ballots_submission"
  ON "public"."election_ballots" ("submission_id");
