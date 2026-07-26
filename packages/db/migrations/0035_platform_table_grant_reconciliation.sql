-- Codify the table-privilege posture that production already has.
--
-- WHY THIS EXISTS
--
-- Supabase's baseline is "grants wide open, RLS is the only gate": its bootstrap
-- grants ALL on every table in `public` to anon/authenticated/service_role, and
-- ALTER DEFAULT PRIVILEGES extends that to every table a migration creates
-- later. Eleven tables in production deviate from that baseline — anon and
-- authenticated cannot touch them at all, and only service_role can.
--
-- Three of the eleven are revoked by migration 0005 (site_theme_presets,
-- site_starter_packs, site_layout_metadata). The other EIGHT — the ones below —
-- existed only as live-database state, with no migration that would recreate
-- them. A database rebuilt from this repo's history was therefore MORE
-- PERMISSIVE than production, which is the wrong direction for drift to run,
-- and it made the local/CI test database an unreliable stand-in for prod: the
-- RLS suite's "authenticated is denied on platform_admin_users" assertions
-- failed against a freshly-built database while passing against prod.
--
-- Found 2026-07-26 by comparing `has_table_privilege` across all 99 public
-- tables in production against what the migrations produce.
--
-- THIS MIGRATION IS A NO-OP AGAINST PRODUCTION. It is deliberately written to
-- assert the state prod is already in, so applying it changes nothing there and
-- everything on a rebuilt database. Verified before authoring: all eight
-- already have anon/authenticated with no SELECT, service_role with full CRUD,
-- and RLS enabled.
--
-- WHY REVOKE AND NOT JUST RELY ON RLS
--
-- Seven of the eight have RLS enabled with ZERO policies, which already denies
-- every non-privileged caller — so the revoke is defence-in-depth there. It
-- earns its keep anyway: a future policy added to one of these tables would
-- silently become reachable by anon the moment it lands, and the ACL is the
-- backstop that keeps that from being a one-line accident.
--
-- `denied_visitors` is the one with real policies (4, tenant-scoped on
-- pp_rls_can_access_community). Those are unreachable by authenticated because
-- of this very revoke — and that is correct, not a bug: the app reads that table
-- through `createScopedClient`, which connects as a privileged role, so the
-- policies are defence-in-depth for direct anon/authenticated access rather than
-- the app's own path. Confirmed in
-- apps/web/src/lib/services/package-visitor-service.ts.
--
-- Mirrors the shape of 0005_site_blocks_rls_hardening.sql exactly, so the two
-- read the same way. Idempotent: REVOKE of an already-absent privilege and
-- GRANT of an already-present one are both no-ops.
--
-- Keep in sync with scripts/sql/local-supabase-post-migrate.sql, which re-asserts
-- the same posture on the test database after the stub's blanket grant.

REVOKE ALL ON TABLE access_plans FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE access_plans TO service_role;--> statement-breakpoint

REVOKE ALL ON TABLE account_deletion_requests FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE account_deletion_requests TO service_role;--> statement-breakpoint

REVOKE ALL ON TABLE conversion_events FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE conversion_events TO service_role;--> statement-breakpoint

REVOKE ALL ON TABLE denied_visitors FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE denied_visitors TO service_role;--> statement-breakpoint

REVOKE ALL ON TABLE platform_admin_users FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE platform_admin_users TO service_role;--> statement-breakpoint

REVOKE ALL ON TABLE public_site_templates FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public_site_templates TO service_role;--> statement-breakpoint

REVOKE ALL ON TABLE revenue_snapshots FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE revenue_snapshots TO service_role;--> statement-breakpoint

REVOKE ALL ON TABLE stripe_prices FROM anon, authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE stripe_prices TO service_role;
