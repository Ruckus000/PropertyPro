-- Post-migration privilege reconciliation for the local/CI test database.
--
-- Applied AFTER migrations, unlike local-supabase-stub.sql which runs before.
-- That ordering is the whole reason this file exists: the stub's
-- ALTER DEFAULT PRIVILEGES grants every table the migrations subsequently
-- create, so a revocation written in the stub is a no-op — the table does not
-- exist yet — and the grant lands afterwards regardless.
--
-- SINGLE SOURCE OF TRUTH, like the stub: applied by both the CI integration
-- jobs (.github/workflows/integration-tests.yml,
-- tenant-isolation-game-day.yml) and the local runner
-- (scripts/local-test-db.sh) so "green locally" == "green in CI".
--
-- Idempotent: safe to re-apply to an already-reconciled database.

-- ---------------------------------------------------------------------------
-- Tables production does NOT grant to anon/authenticated.
--
-- The blanket grant above mirrors Supabase's open baseline, but production is
-- not uniformly open: 11 of 99 public tables are unreachable by anon and
-- authenticated, protected by table ACL as well as RLS. Without replicating
-- that, the test database is MORE PERMISSIVE than production, and the suite's
-- "authenticated is denied on platform_admin_users" assertions fail — correctly,
-- because they describe production and the stub did not.
--
-- Derived by querying production (`has_table_privilege`) on 2026-07-26, not
-- guessed. Verified posture there: service_role can read all 99; anon and
-- authenticated can read 88.
--
-- All eleven are now reproducible from the migrations: 0005 revokes the three
-- site_* platform tables, and 0035 codifies the other eight, which until then
-- were live-database state with nothing in this repo that would recreate them.
--
-- So why does this file still exist, if the migrations now do the same thing?
-- Because the STUB runs before migrations and grants blanket privileges,
-- including on tables that already exist. On a persistent local database — where
-- re-running `local-test-db.sh setup` is the normal path — the migrations do NOT
-- re-run (the drizzle ledger records them as applied), so nothing re-narrows what
-- the stub just re-opened. This file is that backstop, and it is why a second
-- `setup` does not silently leave platform_admin_users readable by anon.
--
-- Guarded on existence so this is a no-op for tables a given migration state
-- has not created yet.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- Revoked by migration 0005.
    'site_theme_presets', 'site_starter_packs', 'site_layout_metadata',
    -- Revoked by migration 0035. Keep this list and that migration in sync.
    'access_plans', 'account_deletion_requests', 'conversion_events',
    'denied_visitors', 'platform_admin_users', 'public_site_templates',
    'revenue_snapshots', 'stripe_prices',
    -- Revoked by migration 0037, which also enabled RLS on it for the first
    -- time. Unlike the eleven above, this one was NOT already revoked in
    -- production — 0037 changes prod rather than codifying it.
    'user_search_index',
    -- Revoked by migration 0038, likewise a real change to prod rather than a
    -- codification: all three had RLS off, anon holding SELECT and authenticated
    -- holding SELECT/INSERT/UPDATE/DELETE. Keep this list and 0038 in sync.
    'users', 'pending_signups', 'stripe_webhook_events'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- platform_admin_audit_log (migration 0052) — APPEND-ONLY, so it must NOT be
-- added to the loop above.
--
-- That loop grants service_role full SELECT/INSERT/UPDATE/DELETE. Applying it
-- to this table would hand back the UPDATE and DELETE privileges that 0052
-- deliberately withholds, silently destroying the append-only property on the
-- local/test database — i.e. the very property a test would be trying to
-- verify here. The grant below is intentionally narrower.
--
-- (The BEFORE UPDATE OR DELETE trigger from 0052 still fires regardless, but
-- the grant is the primary control and both should hold.)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'platform_admin_audit_log'
  ) THEN
    -- service_role must be REVOKED before the narrow GRANT: Supabase's default
    -- privileges hand it ALL at CREATE TABLE, and GRANT is additive. Without
    -- this the append-only property silently does not exist.
    REVOKE ALL ON TABLE public.platform_admin_audit_log FROM anon, authenticated, service_role;
    GRANT SELECT, INSERT ON TABLE public.platform_admin_audit_log TO service_role;

    REVOKE ALL ON SEQUENCE public.platform_admin_audit_log_id_seq FROM anon, authenticated, service_role;
    GRANT USAGE, SELECT ON SEQUENCE public.platform_admin_audit_log_id_seq TO service_role;
  END IF;
END $$;
