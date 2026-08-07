-- Make `marketing_leads.email_normalized` UNIQUE, so lead dedupe is enforced by
-- the database rather than by a read-then-write in application code.
--
-- 0053 shipped `marketing_leads_email_idx` as a PLAIN btree, and
-- `captureMarketingLead` deduped by SELECT-then-INSERT/UPDATE against it. Two
-- concurrent submissions of the same address can both miss the SELECT and both
-- INSERT, which is precisely the duplicate-free guarantee the column exists to
-- provide. A unique index closes the window and, just as importantly, gives
-- `ON CONFLICT (email_normalized)` an inference target — Postgres refuses that
-- clause outright unless a unique index on exactly that column exists.
--
-- APPLY THIS BEFORE the code that upserts. Expand-before-code is not optional
-- here: the new service issues `ON CONFLICT (email_normalized)`, which errors
-- with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" against the old schema. The reverse order (old code, new
-- index) is safe — a losing racer gets a unique violation instead of silently
-- creating a duplicate.
--
-- No RLS change and no RLS_EXPECTED_TENANT_TABLE_COUNT bump: this swaps an index
-- on an existing table. marketing_leads stays in RLS_GLOBAL_TABLE_EXCLUSIONS.
--
-- REVERSIBLE: drop the unique index and re-create the plain one.

-- DEDUPE (DML), BEFORE the constraint -------------------------------------------
--
-- `CREATE UNIQUE INDEX` validates every existing row, so any duplicate already
-- present would abort the migration. Production held zero rows when this was
-- written, so in practice both statements below are no-ops there — but "the
-- table is empty right now" is not a property a migration should depend on, and
-- any environment that ran the racy code could carry duplicates.
--
-- Duplicates are MERGED into the earliest row rather than simply deleted: each
-- one is a real inbound prospect, and the later row may be the richer one (a
-- checker lead followed by a portfolio inquiry is exactly the case the source
-- ranking exists to surface). Losing the second submission's association name or
-- message would be a silent data loss inside a migration billed as a constraint.
--
-- The merge mirrors the service's own precedence rules, so a row collapsed here
-- looks identical to one that had been upserted correctly all along:
--   * scalar fields   — earliest non-null wins (COALESCE in id order)
--   * message         — earliest NON-EMPTY wins
--   * source          — pm_inquiry outranks compliance_checker, never downgrades
--   * status / notes  — keeper's own values, never touched (sales-owned)
UPDATE "marketing_leads" AS keeper
SET
  "association_name"    = COALESCE(keeper."association_name", m."association_name"),
  "contact_name"        = COALESCE(keeper."contact_name", m."contact_name"),
  "association_type"    = COALESCE(keeper."association_type", m."association_type"),
  "unit_count"          = COALESCE(keeper."unit_count", m."unit_count"),
  "community_count"     = COALESCE(keeper."community_count", m."community_count"),
  "message"             = COALESCE(NULLIF(keeper."message", ''), m."message"),
  "obligation_required" = COALESCE(keeper."obligation_required", m."obligation_required"),
  "source"              = CASE
                            WHEN m."has_pm_inquiry" THEN 'pm_inquiry'
                            ELSE keeper."source"
                          END,
  "updated_at"          = now()
FROM (
  SELECT
    "email_normalized",
    min("id") AS keep_id,
    (array_agg("association_name" ORDER BY "id") FILTER (WHERE "association_name" IS NOT NULL))[1] AS "association_name",
    (array_agg("contact_name"     ORDER BY "id") FILTER (WHERE "contact_name"     IS NOT NULL))[1] AS "contact_name",
    (array_agg("association_type" ORDER BY "id") FILTER (WHERE "association_type" IS NOT NULL))[1] AS "association_type",
    (array_agg("unit_count"       ORDER BY "id") FILTER (WHERE "unit_count"       IS NOT NULL))[1] AS "unit_count",
    (array_agg("community_count"  ORDER BY "id") FILTER (WHERE "community_count"  IS NOT NULL))[1] AS "community_count",
    (array_agg("message"          ORDER BY "id") FILTER (WHERE "message" IS NOT NULL AND "message" <> ''))[1] AS "message",
    (array_agg("obligation_required" ORDER BY "id") FILTER (WHERE "obligation_required" IS NOT NULL))[1] AS "obligation_required",
    bool_or("source" = 'pm_inquiry') AS "has_pm_inquiry"
  FROM "marketing_leads"
  GROUP BY "email_normalized"
  HAVING count(*) > 1
) AS m
WHERE keeper."id" = m."keep_id";--> statement-breakpoint

-- Now drop the rows that were merged away. Ordered after the UPDATE on purpose:
-- deleting first would discard the very values the merge reads.
DELETE FROM "marketing_leads" AS dup
USING (
  SELECT "email_normalized", min("id") AS keep_id
  FROM "marketing_leads"
  GROUP BY "email_normalized"
) AS k
WHERE dup."email_normalized" = k."email_normalized"
  AND dup."id" <> k."keep_id";--> statement-breakpoint

-- THE CONSTRAINT ----------------------------------------------------------------
--
-- The plain index is redundant once a unique index covers the same single column
-- — it would just be a second btree to maintain on every write.
DROP INDEX "marketing_leads_email_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_leads_email_normalized_key" ON "marketing_leads" USING btree ("email_normalized");
