-- Migration 0130: Add in-app per-category muting columns to notification_preferences

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "in_app_announcements" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "in_app_documents"     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "in_app_meetings"      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "in_app_maintenance"   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "in_app_violations"    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "in_app_elections"     boolean NOT NULL DEFAULT true;
