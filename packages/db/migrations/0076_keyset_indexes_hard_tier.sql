-- 0076_keyset_indexes_hard_tier
--
-- WHY: the B3 hard tier moved seven list endpoints off unbounded fetches onto
-- sort-preserving keyset pagination — each one ordering by something the user
-- sees (pinned-then-newest, curated order, alphabetical) rather than by `id`,
-- which is exactly what `.claude/rules/api-patterns.md` warns the plain
-- `paginate()` helper cannot express. The migration was the query shape. The
-- supporting indexes were designed alongside it — `docs/audits/
-- b3-hard-tier-pagination-design-2026-05-11.md:193-195` and `:213-220` carry
-- two of them as literal DDL — and neither of those two was ever applied, nor
-- were the five analogous ones the doc only named in prose. So all seven feeds
-- currently satisfy `WHERE community_id = ? AND deleted_at IS NULL ORDER BY
-- <non-id columns>` with a sequential scan plus an explicit sort. On the demo
-- and pre-launch row counts that is invisible; it is a cliff, not a slope, and
-- it arrives with the first community large enough to walk off it. PAG-01 in
-- `docs/audits/2026-09-22-refactor-audit-and-cleanup-roadmap.md` measured the
-- gap: 76 `CREATE INDEX` lines across the migration history, ZERO of them on a
-- keyset table.
--
-- Every column list below is derived from the SHIPPED `orderBy` of the service
-- that reads the table, not from the design doc's prose — the doc predates the
-- implementations and describes two of the seven. The source is cited per
-- statement. Each index is PARTIAL on `deleted_at IS NULL` because that is
-- precisely what `createScopedClient` injects (`packages/db/src/scoped-client.ts`
-- `buildScopeFilters`, alongside `community_id = ?`), so a plain index would
-- carry soft-deleted rows no query in the app can ever ask for. `community_id`
-- leads every one because the tenant predicate is always an equality.
--
-- SAFETY: EXPAND. Purely additive — no table, column, policy, trigger, grant or
-- row is touched, and no existing index is replaced or dropped, so there is
-- nothing to contract later and nothing for application code to have been
-- reading. Per `.claude/rules/migration-safety.md` an expand migration is
-- applied BEFORE the code that benefits from it ships; here the code already
-- shipped, which is the point of the exercise, so this is applied BEFORE the
-- next deploy taking feed traffic. Note for whoever applies it: these build in
-- the plain, non-concurrent form, because the apply runs inside a transaction
-- and Postgres refuses a concurrent build there — see the ledger runbook. A
-- plain build takes a SHARE lock on its table, blocking WRITES (not
-- reads) for the duration of that table's build, so apply it in a low-write
-- window. All seven tables are tenant data on a pre-launch database, so each
-- build is expected to be sub-second; if one is not, it is safe to kill the
-- statement and re-run — `IF NOT EXISTS` skips whatever completed.
--
-- Rollback, if it is ever wanted: `DROP INDEX IF EXISTS <name>` for any subset.
-- An index is not load-bearing for correctness here — removing one restores the
-- sequential-scan-plus-sort that is the state of the world today.
--
-- Idempotent: every statement below is guarded with IF NOT EXISTS, so a re-run
-- finds each name already present and no-ops. The names are globally unique in the
-- database (Postgres indexes live in `pg_class` per schema, not per table) and
-- collide with no existing index: the seven tables carried none at all before
-- this migration.

-- FAQs. Curated order, `id` as the tiebreaker.
--   apps/web/src/lib/services/faq-service.ts:161
--     .orderBy(asc(faqs.sortOrder), asc(faqs.id))
--   docs/audits/b3-hard-tier-pagination-design-2026-05-11.md:193-195 (verbatim).
CREATE INDEX IF NOT EXISTS "faqs_active_order_idx"
ON "public"."faqs" ("community_id", "sort_order" ASC, "id" ASC)
WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Announcements. The pinned-then-newest feed.
--   apps/web/src/lib/announcements/read-visibility.ts:338
--     .orderBy(desc(isPinned), desc(publishedAt), desc(id))
--   docs/audits/b3-hard-tier-pagination-design-2026-05-11.md:213-220 (verbatim).
--   `published_at`, not `created_at`: the feed orders by when a notice went out,
--   and the cursor encodes the same column, so an index on the wrong timestamp
--   would be silently unusable.
CREATE INDEX IF NOT EXISTS "announcements_active_feed_idx"
ON "public"."announcements" ("community_id", "is_pinned" DESC, "published_at" DESC, "id" DESC)
WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Vendors. Active directory entries first, then alphabetical.
--   apps/web/src/lib/services/work-orders-service.ts:431 and :456
--     .orderBy(desc(vendors.isActive), asc(vendors.name), asc(vendors.id))
--   The cursor at :294-298 walks the same three keys, comparing `isActive` with
--   `lt` while `name` and `id` use `gt` — so the mixed directions below are the
--   query's actual order, not a typo to be normalised.
CREATE INDEX IF NOT EXISTS "vendors_active_name_idx"
ON "public"."vendors" ("community_id", "is_active" DESC, "name" ASC, "id" ASC)
WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Assessments. Active billing rows first, newest first.
--   apps/web/src/lib/services/finance-service.ts:464
--     .orderBy(desc(assessments.isActive), desc(createdAt), desc(id))
CREATE INDEX IF NOT EXISTS "assessments_active_created_idx"
ON "public"."assessments" ("community_id", "is_active" DESC, "created_at" DESC, "id" DESC)
WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Visitor log. Most recent expected arrival first.
--   apps/web/src/lib/services/package-visitor-service.ts:612 and :658
--     .orderBy(desc(visitorLog.expectedArrival), desc(visitorLog.id))
--   The key is `expected_arrival`, the planned time the log is browsed by — not
--   `created_at`, which is when the entry was typed in.
CREATE INDEX IF NOT EXISTS "visitor_log_arrival_idx"
ON "public"."visitor_log" ("community_id", "expected_arrival" DESC, "id" DESC)
WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Forum threads. Pinned first, then newest.
--   apps/web/src/lib/services/polls-service.ts:530
--     .orderBy(desc(forumThreads.isPinned), desc(createdAt), desc(id))
CREATE INDEX IF NOT EXISTS "forum_threads_pinned_created_idx"
ON "public"."forum_threads" ("community_id", "is_pinned" DESC, "created_at" DESC, "id" DESC)
WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Amenities. Plain alphabetical. The seventh, and the one the roadmap's PAG-01
-- entry itself missed: its six-file list omitted `amenities.ts` while the same
-- document's §1 measured "0 of 7". Wired up at
-- apps/web/src/app/api/v1/amenities/route.ts since #349, ordered at
--   apps/web/src/lib/services/work-orders-service.ts:752
--     .orderBy(asc(amenities.name), asc(amenities.id))
-- Deliberately TWO columns where its siblings have three: `amenities` has no
-- `is_active` column (checked against packages/db/src/schema/amenities.ts), so
-- an active-first component here would name a column that does not exist.
CREATE INDEX IF NOT EXISTS "amenities_name_idx"
ON "public"."amenities" ("community_id", "name" ASC, "id" ASC)
WHERE "deleted_at" IS NULL;
