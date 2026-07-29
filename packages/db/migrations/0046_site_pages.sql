-- Phase 11a — multi-page EXPAND migration (gate G2).
--
-- Applied BEFORE the Phase 11b code ships, per expand-before-code discipline:
-- nothing here is read by application code yet.
--
-- WHAT IS DELIBERATELY ABSENT, and must not be "finished" here:
--   * `site_blocks_community_order_draft_partial` (the 3-column index) is NOT
--     dropped.
--   * `site_blocks.page_id` is NOT set NOT NULL.
-- Both are the Phase 11c CONTRACT migration behind gate G3, and G3 is a DEPLOY
-- WAIT, not just an apply — it can only run once the 11b code is live in
-- production. Keeping them is exactly what makes 11b revertible.
--
-- RLS: `site_pages` and `site_page_redirects` join the `public_read_service_write`
-- family that `site_blocks` uses — the public site renders them for anonymous
-- visitors. anon + authenticated get a published-rows-only SELECT scoped to the
-- `app.current_community_id` GUC; every write is privileged. Both are
-- trigger-exempt for the same reason `site_blocks` is: there is no authenticated
-- write path for pp_rls_enforce_tenant_community_id() to police.
--
-- The GUC predicate uses the fail-closed form introduced by 0023
--   COALESCE(NULLIF(current_setting('app.current_community_id', true), ''), '0')::bigint
-- so an unset or empty GUC resolves to community 0 (which cannot exist) rather
-- than throwing. The canonical GUC is `app.current_community_id`;
-- `app.community_id` is historical drift that 0023 repaired — never reintroduce it.
--
-- No table-level GRANT: Supabase's default privileges cover new tables in
-- `public`, which is how `site_blocks` is reachable by anon today. These tables
-- must NOT be added to any REVOKE list — the public site depends on the read.

CREATE TABLE "site_page_redirects" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"from_slug" text NOT NULL,
	"page_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "site_page_redirects_from_slug_shape_check" CHECK ("site_page_redirects"."from_slug" ~ '^[a-z0-9][a-z0-9-]*$')
);
--> statement-breakpoint
CREATE TABLE "site_pages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"community_id" bigint NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"in_nav" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_home" boolean DEFAULT false NOT NULL,
	"is_draft" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "site_pages_slug_shape_check" CHECK (("site_pages"."is_home" AND "site_pages"."slug" = '') OR (NOT "site_pages"."is_home" AND "site_pages"."slug" ~ '^[a-z0-9][a-z0-9-]*$'))
);
--> statement-breakpoint
ALTER TABLE "site_blocks" ADD COLUMN "page_id" bigint;--> statement-breakpoint
ALTER TABLE "site_page_redirects" ADD CONSTRAINT "site_page_redirects_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_page_redirects" ADD CONSTRAINT "site_page_redirects_page_id_site_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."site_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_blocks" ADD CONSTRAINT "site_blocks_page_id_site_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."site_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_page_redirects_community_from_slug_partial" ON "site_page_redirects" USING btree ("community_id","from_slug") WHERE "site_page_redirects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_community_slug_partial" ON "site_pages" USING btree ("community_id","slug") WHERE "site_pages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "site_pages_community_home_partial" ON "site_pages" USING btree ("community_id") WHERE "site_pages"."is_home" AND "site_pages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "site_pages_community_nav_idx" ON "site_pages" USING btree ("community_id","sort_order");--> statement-breakpoint

-- BACKFILL (DML) ---------------------------------------------------------------
--
-- One home page per community that has ever had a site_blocks row, then every
-- one of that community's blocks points at it.
--
-- Grouped over ALL blocks including soft-deleted ones, on purpose: a community
-- whose only rows are soft-deleted still needs a home page, or 11c's
-- `SET NOT NULL` would trip over those rows. The is_draft / published_at
-- aggregates are FILTERed back to LIVE rows so a tombstoned row cannot decide
-- whether the page counts as published.
--
-- is_draft = true means "never published", which anon RLS hides. A community
-- with no published block has no public site, so a draft home page is the
-- correct state for it.
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
UPDATE "site_blocks" b
SET "page_id" = p."id"
FROM "site_pages" p
WHERE p."community_id" = b."community_id"
  AND p."is_home"
  AND p."deleted_at" IS NULL
  AND b."page_id" IS NULL;--> statement-breakpoint

-- The 4-column successor index, created AFTER the backfill so it is meaningful
-- on the existing rows. (NULL page_ids would not have collided anyway — NULLs
-- are distinct in a unique index — which is precisely why the 3-column index
-- has to survive until 11c.)
CREATE UNIQUE INDEX "site_blocks_community_page_order_draft_partial" ON "site_blocks" USING btree ("community_id","page_id","block_order","is_draft") WHERE "site_blocks"."deleted_at" IS NULL;--> statement-breakpoint

-- RLS -------------------------------------------------------------------------
ALTER TABLE IF EXISTS "public"."site_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."site_pages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."site_page_redirects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."site_page_redirects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS "pp_site_pages_anon_read" ON "public"."site_pages";--> statement-breakpoint
DROP POLICY IF EXISTS "pp_site_pages_read_published" ON "public"."site_pages";--> statement-breakpoint
DROP POLICY IF EXISTS "pp_site_pages_service" ON "public"."site_pages";--> statement-breakpoint

CREATE POLICY "pp_site_pages_anon_read" ON "public"."site_pages"
  AS PERMISSIVE FOR SELECT TO anon
  USING (
    is_draft = false
    AND community_id = (COALESCE(NULLIF(current_setting('app.current_community_id', true), ''), '0'))::bigint
  );--> statement-breakpoint
CREATE POLICY "pp_site_pages_read_published" ON "public"."site_pages"
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    is_draft = false
    AND community_id = (COALESCE(NULLIF(current_setting('app.current_community_id', true), ''), '0'))::bigint
  );--> statement-breakpoint
CREATE POLICY "pp_site_pages_service" ON "public"."site_pages"
  AS PERMISSIVE FOR ALL TO public
  USING (pp_rls_is_privileged())
  WITH CHECK (pp_rls_is_privileged());--> statement-breakpoint

DROP POLICY IF EXISTS "pp_site_page_redirects_anon_read" ON "public"."site_page_redirects";--> statement-breakpoint
DROP POLICY IF EXISTS "pp_site_page_redirects_read_published" ON "public"."site_page_redirects";--> statement-breakpoint
DROP POLICY IF EXISTS "pp_site_page_redirects_service" ON "public"."site_page_redirects";--> statement-breakpoint

-- Redirects have no is_draft column, so the read is community-scoped only. A
-- `from_slug` is a URL the site PUBLISHED in the past, so it discloses nothing
-- the public did not already have; the target page's own visibility is still
-- governed by the site_pages policies above. Resolving a redirect for a
-- draft-only page therefore yields a page anon cannot read — a 404, not a leak.
CREATE POLICY "pp_site_page_redirects_anon_read" ON "public"."site_page_redirects"
  AS PERMISSIVE FOR SELECT TO anon
  USING (
    community_id = (COALESCE(NULLIF(current_setting('app.current_community_id', true), ''), '0'))::bigint
  );--> statement-breakpoint
CREATE POLICY "pp_site_page_redirects_read_published" ON "public"."site_page_redirects"
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    community_id = (COALESCE(NULLIF(current_setting('app.current_community_id', true), ''), '0'))::bigint
  );--> statement-breakpoint
CREATE POLICY "pp_site_page_redirects_service" ON "public"."site_page_redirects"
  AS PERMISSIVE FOR ALL TO public
  USING (pp_rls_is_privileged())
  WITH CHECK (pp_rls_is_privileged());
