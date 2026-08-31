-- WHY: Terms acceptance was recorded as a timestamp with no VERSION, so we could
-- prove WHEN a user agreed but not WHAT they agreed to — the fact actually in
-- dispute once ToS §11 ("continued use is acceptance") is ever relied on.
-- Invited residents were worse off still: they went through Supabase Auth and
-- accepted nothing at all. `users` is the only place both entry points converge,
-- and it survives community deletion, which an invitation row does not.
-- `pending_signups.terms_version` is needed separately because a signup can sit
-- unverified for days — stamping the version at provisioning time would record
-- whatever version is current THEN against an acceptance that happened earlier,
-- silently backdating a legal record.
-- See docs/audits/2026-08-09-legal-risk-audit.md F-18.
--
-- SAFETY: Pure EXPAND. All three columns are nullable with no default and no
-- backfill, so existing rows are untouched and live code that does not know
-- about them keeps working. Apply to production BEFORE the code that writes
-- them ships.
--
-- Idempotent: re-running is a no-op (IF NOT EXISTS on every statement).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_version" text;--> statement-breakpoint
ALTER TABLE "pending_signups" ADD COLUMN IF NOT EXISTS "terms_version" text;
