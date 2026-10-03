-- Website builder v4, Phase 5b: per-page search title and description.
-- Nullable, no default: NULL means "use the page's default" (its name and the
-- site's description), so every existing page keeps its current metadata.
-- Additive and backwards-compatible; no backfill.
ALTER TABLE "site_pages" ADD COLUMN "seo_title" text;--> statement-breakpoint
ALTER TABLE "site_pages" ADD COLUMN "seo_description" text;
