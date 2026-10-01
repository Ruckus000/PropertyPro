-- 0081_unit_count
--
-- EXPAND migration (order: apply BEFORE the code that reads the column ships;
-- the code treats NULL as "unknown", so applying it early is harmless).
--
-- Florida's website rules only reach associations above a size threshold —
-- §718.111(12)(g) condos of 25+ units, §720.303 HOAs of 100+ parcels — and the
-- site builder (v4 Phase 2) had no way to tell. Signup (`pending_signups
-- .unit_count`, NOT NULL) and "Add community" both collected the number and
-- dropped it before inserting the community. This stores it.
--
-- NULL means UNKNOWN, never zero; the app treats unknown as covered and asks.
ALTER TABLE "communities" ADD COLUMN "unit_count" integer;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_unit_count_range" CHECK ("communities"."unit_count" IS NULL OR ("communities"."unit_count" >= 1 AND "communities"."unit_count" <= 100000));--> statement-breakpoint
-- Backfill what can be recovered exactly: a community provisioned from a
-- self-serve signup is linked to it by provisioning_jobs (community_id ↔
-- signup_request_id, one job per signup). Slug matching is deliberately NOT
-- used — pending_signups.candidate_slug is only unique among non-completed
-- rows, so a reused slug could hand one association another's count.
-- Communities from "Add community" have no such record and stay NULL.
--
-- ONE statement writes each value AND its compliance_audit_log row (the
-- migration-safety rule for out-of-band row changes: the change cannot land
-- without its record). System actor, so user_id is NULL. Only the column this
-- migration owns is logged — no signup PII, just the opaque signup id that
-- traces where the number came from.
--
-- Idempotent: only NULLs are written, so a re-run updates nothing and, because
-- the audit rows come from the UPDATE's RETURNING, logs nothing either. The
-- newest job wins if a community has two.
WITH src AS (
  SELECT DISTINCT ON (pj.community_id)
    pj.community_id, ps.unit_count, ps.signup_request_id
  FROM "provisioning_jobs" AS pj
  JOIN "pending_signups" AS ps ON ps.signup_request_id = pj.signup_request_id
  WHERE pj.community_id IS NOT NULL
    AND ps.unit_count BETWEEN 1 AND 100000
  ORDER BY pj.community_id, pj.id DESC
), backfilled AS (
  UPDATE "communities" AS c
  SET "unit_count" = src.unit_count
  FROM src
  WHERE c.id = src.community_id
    AND c.unit_count IS NULL
  RETURNING c.id, c.unit_count, src.signup_request_id
)
INSERT INTO "compliance_audit_log"
  ("user_id", "community_id", "action", "resource_type", "resource_id",
   "old_values", "new_values", "metadata")
SELECT
  NULL,
  b.id,
  'data_repair',
  'community',
  b.id::text,
  jsonb_build_object('unitCount', NULL),
  jsonb_build_object('unitCount', b.unit_count),
  jsonb_build_object(
    'reason', 'Backfill communities.unit_count from the count declared at signup; it decides whether Florida website rules (718.111(12)(g) / 720.303) apply',
    'applied_via', 'migration 0081_unit_count',
    'source', 'pending_signups.unit_count via provisioning_jobs',
    'signup_request_id', b.signup_request_id,
    'reference', 'PR #1257'
  )
FROM backfilled AS b;
