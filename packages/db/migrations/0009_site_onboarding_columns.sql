-- Migration 0009: site onboarding tracking columns
--
-- Adds two nullable columns to communities to track the PM site-onboarding
-- wizard:
--
--   (a) site_onboarding_completed_at — authoritative completion timestamp,
--       set to now() when the PM clicks Publish on the wizard's final step.
--       Replaces the prior `branding.layoutId`-unset heuristic used by
--       WizardEntryBanner. Null = wizard never completed.
--   (b) site_onboarding_progress — jsonb resume state ({ lastCompletedStep })
--       so a partially-completed wizard can deep-link a "Resume customizing"
--       banner. Null = no saved progress.
--
-- Both are nullable with no default; every existing row reads NULL (i.e.
-- "not yet onboarded"), which is the correct backfill for prod.

BEGIN;

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS site_onboarding_completed_at timestamp with time zone;

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS site_onboarding_progress jsonb;

COMMIT;
