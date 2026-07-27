-- Website editor v3, Phase 7 — the urgent notice banner.
--
-- A PM-authored line shown on every page of a community's public site: a
-- hurricane closure, a boil-water order, an elevator outage. Announcements and
-- emergency_broadcasts, the closest existing relatives, never reach the public
-- site, so nothing today can do this.
--
-- ===========================================================================
-- WHY COLUMNS ON communities AND NOT A NEW TABLE
-- ===========================================================================
--
-- The banner is a per-community SINGLETON — exactly one is live at a time.
-- A table would model per-notice history that compliance_audit_log already
-- records (urgent_notice_set / urgent_notice_cleared), and it would add a
-- query to every pageview of a statutory public entry point. The public
-- renderer already SELECTs this row once per request (getCommunityPublicInfo),
-- so widening that SELECT is free.
--
-- Staying off the tenant-table list also keeps RLS_EXPECTED_TENANT_TABLE_COUNT,
-- the policy families in rls-config.ts, and the pp_rls_enforce_tenant_scope
-- trigger set untouched. communities already carries every other site-level
-- singleton (site_published_at, custom_domain, branding, transparency_enabled).
--
-- ===========================================================================
-- WHY THE CHECK CONSTRAINT EXISTS
-- ===========================================================================
--
-- This is the only write in the product that is public the instant it lands —
-- it bypasses the draft/publish layer entirely, so there is no review step
-- between a typo and every visitor seeing it. The 240-character cap is
-- therefore enforced three times, not once:
--
--   1. the Zod request schema (rejects at the API boundary),
--   2. the service (re-normalises and re-checks after trimming),
--   3. this CHECK (the backstop that holds even if a future caller skips both).
--
-- Expiry is deliberately NOT swept by a cron. urgent_notice_expires_at is
-- compared at RENDER time, so a missed or failed sweep can never strand a live
-- banner on a public site.
--
-- Expand-only: four nullable columns, no defaults, no table rewrite, no
-- backfill. Safe to apply before the code that reads them ships.

ALTER TABLE "communities"
  ADD COLUMN IF NOT EXISTS "urgent_notice_text" text,
  ADD COLUMN IF NOT EXISTS "urgent_notice_expires_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "urgent_notice_set_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "urgent_notice_set_by" uuid;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'communities_urgent_notice_text_len'
      AND conrelid = 'public.communities'::regclass
  ) THEN
    ALTER TABLE "communities"
      ADD CONSTRAINT "communities_urgent_notice_text_len"
      CHECK ("urgent_notice_text" IS NULL OR char_length("urgent_notice_text") <= 240);
  END IF;
END $$;
--> statement-breakpoint

-- Cross-schema FK to auth.users. Drizzle cannot express a reference into
-- another schema, so the column is declared without .references() in
-- schema/communities.ts and the constraint is added here instead — the same
-- convention used by site_publish_snapshots.actor_user_id and
-- user_search_index. ON DELETE SET NULL: deleting the manager who posted a
-- notice must never cascade into the community row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'communities_urgent_notice_set_by_fkey'
      AND conrelid = 'public.communities'::regclass
  ) THEN
    ALTER TABLE "communities"
      ADD CONSTRAINT "communities_urgent_notice_set_by_fkey"
      FOREIGN KEY ("urgent_notice_set_by") REFERENCES "auth"."users"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
