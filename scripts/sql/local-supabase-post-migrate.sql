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
-- ⚠️ EIGHT OF THESE ELEVEN ARE NOT REPRODUCIBLE FROM THE MIGRATIONS. Only
-- site_theme_presets / site_starter_packs / site_layout_metadata are revoked by
-- a migration (0005). The other eight are live-database state with no migration
-- that would recreate them, so a database rebuilt purely from this repo's
-- history would be more permissive than production. That is defence-in-depth
-- rather than an open door — all eight have RLS enabled, and all but
-- denied_visitors have zero policies, so RLS denies non-privileged access
-- regardless — but it IS drift, and this list is the only place it is written
-- down. See the PR that added this block.
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
    -- Live-database state only; no migration recreates these.
    'access_plans', 'account_deletion_requests', 'conversion_events',
    'denied_visitors', 'platform_admin_users', 'public_site_templates',
    'revenue_snapshots', 'stripe_prices'
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
