-- Phase 11c — per-page block ordering. The CONTRACT half of the pair 11a opened.
--
-- Gate G3, and G3 was a DEPLOY WAIT rather than an apply: this can only run once
-- BOTH the 11b code that always writes a `page_id` and the 11c-0 client that
-- copes with slots repeating across pages are LIVE in production. Both are
-- (`dc477813` and `178413d8`), which is what unblocks this file.
--
-- Two things change, and the second is the one with blast radius:
--
--   1. `site_blocks.page_id` becomes NOT NULL. The composite FK
--      `(community_id, page_id)` is MATCH SIMPLE, so it was inert while the
--      column was NULL; it becomes an unconditional guarantee here.
--
--   2. The 3-column ordering index `(community_id, block_order, is_draft)` is
--      DROPPED. From this point a `block_order` identifies a block only WITHIN
--      A PAGE — two pages may hold slot 2. Everything that assumed otherwise was
--      re-keyed in 11c-0 (#888): per-page validation and diffing, page-qualified
--      change keys, and `{pageId, slot}` through "Fix this". The guards that
--      enforced the old invariant are deleted in the same PR as this migration,
--      because after the drop they refuse writes that are now legal.
--
-- REVERSIBLE, deliberately: `ALTER COLUMN … DROP NOT NULL` and a re-CREATE of
-- the index both restore the previous shape. Nothing here drops a column or
-- destroys a row.
--
-- No RLS change and no RLS_EXPECTED_TENANT_TABLE_COUNT bump: this alters a
-- column and an index on an existing tenant table, not a table. Precedent for a
-- non-table migration leaving the count alone: 0047, 0044, 0045.

-- BACKFILL (DML), BEFORE the constraint -----------------------------------------
--
-- `SET NOT NULL` validates EVERY row, so every NULL must be gone first — and
-- "traffic has healed them" is NOT safe to assume. 11b-3 made `listSitePages` a
-- lock-free read, whose fast path returns before `ensureHomePageInTransaction`,
-- so `adoptPagelessBlocks` now runs on WRITE paths only. A community that has a
-- home page and page-less blocks is repaired only when someone writes a block.
-- See the paragraph in `site-pages-service.ts` ending "do not delete this
-- paragraph without adding it" — §3b hand-off obligation 1, which asked for
-- exactly this backfill.
--
-- Both halves are lifted from 0046 unchanged. The INSERT is not redundant with
-- it: 0046 created a home page only for communities that had `site_blocks` rows
-- AT APPLY TIME. A community created after 0046 but before 11b-1 shipped could
-- have had its starter pack write blocks with a NULL `page_id` and no home row,
-- and lazy home creation lives only in application code — SQL cannot call it.
--
-- Grouped over ALL blocks including soft-deleted ones, on purpose: `SET NOT
-- NULL` sees tombstoned rows too, so leaving one NULL only defers the failure.
-- The is_draft / published_at aggregates are FILTERed back to LIVE rows so a
-- tombstoned row cannot decide whether the page counts as published.
--
-- Idempotent: NOT EXISTS makes a re-apply a no-op (manual applies get retried).
INSERT INTO "site_pages" (
  "community_id", "name", "slug", "in_nav", "sort_order", "is_home", "is_draft", "published_at"
)
SELECT
  b."community_id",
  'Home',
  '',
  true,
  0,
  true,
  COALESCE(bool_and(b."is_draft") FILTER (WHERE b."deleted_at" IS NULL), true),
  max(b."published_at") FILTER (WHERE b."deleted_at" IS NULL AND b."is_draft" = false)
FROM "site_blocks" b
WHERE NOT EXISTS (
  SELECT 1 FROM "site_pages" p
  WHERE p."community_id" = b."community_id"
    AND p."is_home"
    AND p."deleted_at" IS NULL
)
GROUP BY b."community_id";--> statement-breakpoint

-- Joined on community_id, and `site_pages_community_home_partial` guarantees at
-- most one candidate page per community — so this cannot attach a block to
-- another tenant's page even before the composite FK refuses to store one.
--
-- Deliberately NOT filtered on `b."deleted_at"`: see above.
UPDATE "site_blocks" b
SET "page_id" = p."id"
FROM "site_pages" p
WHERE p."community_id" = b."community_id"
  AND p."is_home"
  AND p."deleted_at" IS NULL
  AND b."page_id" IS NULL;--> statement-breakpoint

-- THE CONTRACT ------------------------------------------------------------------
--
-- Order matters: this must follow the backfill above, or it trips over the very
-- rows the backfill exists to fix.
ALTER TABLE "site_blocks" ALTER COLUMN "page_id" SET NOT NULL;--> statement-breakpoint

-- And the index whose removal is the point of the phase. Slots are per-page from
-- here on.
DROP INDEX "site_blocks_community_order_draft_partial";
