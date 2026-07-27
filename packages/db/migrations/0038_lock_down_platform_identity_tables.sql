-- Lock down the last three tables that were reachable by anon/authenticated.
--
-- ⚠️ THIS MIGRATION IS NOT A NO-OP AGAINST PRODUCTION. Unlike 0035, which
-- codified a posture prod already had, this one CHANGES prod. It was applied
-- there on 2026-07-26 ahead of this PR, deliberately — see "Sequencing" below.
--
-- WHAT WAS WRONG
--
-- Closing the user_search_index gap in 0037 left three tables still at Supabase
-- advisor ERROR `rls_disabled_in_public`. Measured directly against production
-- immediately before this migration was applied:
--
--   table                  rows    RLS  policies  anon      authenticated
--   users                  1,660   off  0         SELECT    SELECT/INSERT/UPDATE/DELETE
--   pending_signups           26   off  0         SELECT    SELECT/INSERT/UPDATE/DELETE
--   stripe_webhook_events    220   off  0         SELECT    SELECT/INSERT/UPDATE/DELETE
--
-- `public.users` holds email, full_name, phone, avatar_url and the OTP lockout
-- columns. `pending_signups` holds primary_contact_name, email, street address,
-- county, zip and an opaque `payload` jsonb. The anon key ships in the browser
-- bundle, and these tables sit in a PostgREST-exposed schema — which is exactly
-- what the advisor lint detects.
--
-- So: an unauthenticated reader could dump the entire cross-tenant user
-- directory, and any signed-up resident could modify or delete arbitrary user
-- rows — including clearing `otp_locked_until` to defeat OTP lockout, or setting
-- `deleted_at` en masse. On stripe_webhook_events, write access defeats webhook
-- idempotency: delete a row to permit replay, or pre-insert an event_id so the
-- genuine webhook is skipped as a duplicate.
--
-- These grants were vestigial Supabase defaults, not a decision. None of the
-- three has ever had a GRANT, REVOKE, ENABLE ROW LEVEL SECURITY or CREATE POLICY
-- statement in any migration in this repo's history.
--
-- WHY IT WAS SAFE TO REVOKE
--
-- Nothing legitimately used those grants. Full-repo trace before applying:
--   * All five `.from('users')` PostgREST call sites use the SERVICE-ROLE client
--     (apps/web/src/lib/api/auth.ts, lib/services/esign-service.ts, and three in
--     apps/admin). service_role has rolbypassrls, so RLS never applies to it.
--   * The ~30 Drizzle query sites use the privileged connection (DATABASE_URL →
--     the `postgres` role). `users` is explicitly documented in scoped-client.ts
--     as a global, non-tenant-scoped table reached via the unsafe escape hatch.
--   * Zero `.rpc()` calls, zero Edge Functions, zero hand-rolled /rest/v1 fetches.
--   * Every browser-client use is `.auth.*` or `.channel(...)`; the only Realtime
--     subscriptions are on `notifications`.
--
-- WHY `FORCE` IS SAFE — verified, not assumed
--
-- In production, `postgres` and `service_role` both have rolbypassrls = true;
-- `anon` and `authenticated` have neither. BYPASSRLS outranks FORCE, so FORCE
-- removes only the table-OWNER exemption and cannot reach the app's connection.
-- Confirmed empirically after applying: `select count(*) from public.users`
-- over the app's connection still returns all 1,660 rows. With RLS forced and
-- ZERO policies, any role actually subject to RLS would see 0 rows — so that
-- count proves the bypass is in effect for writes as well as reads.
--
-- WHY ZERO POLICIES
--
-- Zero policies IS the deny-everyone default, not an oversight. This is the same
-- posture eleven sibling platform tables already carry (0005 for the three
-- site_* tables, 0035 for eight more, 0037 for user_search_index): RLS enabled
-- and forced, no policies, ACL revoked, service_role retaining CRUD. The REVOKE
-- is defence-in-depth on top of the zero-policy deny — it means a policy added
-- here later cannot silently become anon-reachable the moment it lands.
--
-- SEQUENCING
--
-- Applied to prod BEFORE this PR merged, matching how 0021/0022 were handled
-- under the project's expand-before-code discipline. This was a live exposure of
-- real user data, so the exposure window mattered more than briefly having prod
-- ahead of main. Pure hardening — no expand/contract ordering concern.
--
-- Idempotent throughout: IF EXISTS guards, and REVOKE of an absent privilege or
-- GRANT of a present one are both no-ops. Safe to re-apply.
--
-- Keep in sync with scripts/sql/local-supabase-post-migrate.sql, which re-asserts
-- the revocation list on the test database after the stub's blanket grant.

-- --------------------------------------------------------------------------
-- users — the identity mirror (email, full_name, phone, avatar, OTP lockout)
-- --------------------------------------------------------------------------
ALTER TABLE IF EXISTS "public"."users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

REVOKE ALL ON TABLE users FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO service_role;--> statement-breakpoint

-- --------------------------------------------------------------------------
-- pending_signups — pre-provisioning PII (name, email, full street address)
-- --------------------------------------------------------------------------
ALTER TABLE IF EXISTS "public"."pending_signups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."pending_signups" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

REVOKE ALL ON TABLE pending_signups FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pending_signups TO service_role;--> statement-breakpoint

-- --------------------------------------------------------------------------
-- stripe_webhook_events — the webhook idempotency journal
-- --------------------------------------------------------------------------
ALTER TABLE IF EXISTS "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."stripe_webhook_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

REVOKE ALL ON TABLE stripe_webhook_events FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE stripe_webhook_events TO service_role;
