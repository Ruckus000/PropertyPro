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
    'users', 'pending_signups', 'stripe_webhook_events',
    -- Revoked by migration 0053. Its SEQUENCE needs revoking too — see the
    -- dedicated block below, because this loop only handles tables.
    'marketing_leads',
    -- Revoked by migration 0069. 0067 created the table and reasoned only about
    -- RLS, leaving the open grant baseline in place; 0069 closed it. Text
    -- primary key, so there is no sequence to chase.
    'cron_runs',
    -- Revoked by migration 0072, which creates them. Both have bigserial
    -- sequences, so the dedicated block below is required as well — the loop
    -- handles tables only. Added here the moment the first test asserted this
    -- posture: without it, `local-test-db.sh setup` on a persistent database
    -- re-applies the stub's blanket grant over tables the migrations do not
    -- re-create, and both tickets tables come back fully readable by anon while
    -- production has them revoked. That gap is not hypothetical — it is what
    -- this pair's own RLS suite failed on first run.
    'support_tickets', 'support_ticket_events',
    -- Revoked by migration 0068 the same way, and missing from this list until
    -- 0072 made the gap visible: on a PERSISTENT local database the stub's
    -- blanket grant is re-applied over them by `local-test-db.sh setup`, so the
    -- inbox — every message a correspondent has ever sent support@, privacy@ or
    -- contact@ — comes back readable by anon while production has it revoked.
    -- Same class as the tickets gap above; found by fixing that one.
    'support_inbox_threads', 'support_inbox_messages'
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
-- marketing_leads_id_seq (migration 0053) — the loop above handles TABLES only.
--
-- The stub's ALTER DEFAULT PRIVILEGES grants ALL ON SEQUENCES as well as tables,
-- so re-narrowing the table alone would leave anon and authenticated holding the
-- backing sequence: the table would look locked down while an INSERT path stayed
-- reachable. 0053 revokes both; so must this.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.sequences
     WHERE sequence_schema = 'public' AND sequence_name = 'marketing_leads_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.marketing_leads_id_seq FROM anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.marketing_leads_id_seq TO service_role;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- support_tickets_id_seq / support_ticket_events_id_seq (migration 0072) — the
-- loop above handles TABLES only, exactly as it does for marketing_leads.
--
-- Same consequence as there, and worth restating because it is the failure mode
-- that reads as success: re-narrowing the tables alone would leave anon and
-- authenticated holding the backing sequences, so both tables would look locked
-- down to a privilege check on the TABLE while an INSERT path stayed reachable.
-- 0072 revokes both; so must this.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'support_tickets_id_seq', 'support_ticket_events_id_seq',
    -- 0068 revokes these two sequences alongside its tables; they were missing
    -- here for the same reason the tables were, and a readable sequence lets a
    -- caller enumerate how much correspondence exists even when the table is shut.
    'support_inbox_threads_id_seq', 'support_inbox_messages_id_seq'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.sequences
       WHERE sequence_schema = 'public' AND sequence_name = s
    ) THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated', s);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', s);
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
