-- 0151_pending_signups_login_token_lifecycle.sql
--
-- Hardens /api/v1/auth/provisioning-status against magic-link replay.
--
-- The previous implementation cached the generated magic-link token in
-- pending_signups.payload.loginToken and re-served it on every subsequent
-- poll keyed only by signupRequestId (a UUID). Anyone with that UUID — from
-- browser history, server logs, referrer headers — could fetch a working
-- login token. The endpoint is unauthenticated and lives behind a middleware
-- carve-out, so the UUID was the sole authentication factor.
--
-- This migration adds two columns used by the route's new single-use +
-- TTL flow:
--
--   login_token_issued_at  — set when a magic-link token is generated.
--                            Used to enforce a short TTL (≤5 min) on
--                            re-issuance.
--   login_token_consumed_at — set in the SAME atomic update as the token
--                             generation completing. Subsequent polls
--                             observe the consumed marker and return
--                             { status: 'consumed' } with no token.
--
-- Both columns are nullable to remain backwards-compatible with rows
-- created before this migration. The existing payload.loginToken cache is
-- abandoned by the new route logic; we leave the historical data in place
-- (no destructive rewrite) since payload is JSONB and ignored by readers
-- after this PR ships.

ALTER TABLE "public"."pending_signups"
  ADD COLUMN IF NOT EXISTS "login_token_issued_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "login_token_consumed_at" timestamp with time zone;
