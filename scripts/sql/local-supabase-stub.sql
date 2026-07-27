-- Supabase primitives stub for plain Postgres.
--
-- The app's migrations assume the Supabase-managed `auth` schema, the
-- `anon`/`authenticated`/`service_role` roles, and `auth.uid()`/`auth.role()`
-- helpers exist. A vanilla Postgres server (local dev or CI service container)
-- has none of these, so this script creates minimal stand-ins so migrations and
-- RLS policies can be created and the integration suite can run.
--
-- SINGLE SOURCE OF TRUTH: this file is applied by BOTH the CI integration jobs
-- (.github/workflows/integration-tests.yml, tenant-isolation-game-day.yml) and
-- the local runner (scripts/local-test-db.sh) so "green locally" == "green in
-- CI". Idempotent — safe to re-apply to an already-bootstrapped database.

-- Roles referenced by RLS policies.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- Grant usage so policies referencing these roles can be created.
--
-- USAGE ONLY — do not widen this to GRANT ALL / GRANT CREATE. Supabase's own
-- bootstrap grants CREATE on public to anon and authenticated; migration 0039
-- revokes it, because being able to create an object in public is the
-- precondition for shadowing a real one and hijacking an unpinned search_path.
-- Nothing needs it: zero objects in public are owned by either role. The RLS
-- suite asserts both halves (CREATE denied, USAGE retained), so widening this
-- line fails there rather than silently re-opening the hole.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Auth schema and helpers.
CREATE SCHEMA IF NOT EXISTS auth;

-- These MUST read the request GUCs, exactly as real Supabase does.
--
-- They previously returned constants — `auth.uid()` always NULL and
-- `auth.role()` always 'service_role'. Both are actively wrong for testing RLS:
--
--   * `pp_rls_has_community_membership()` short-circuits on
--     `WHEN auth.uid() IS NULL THEN false`, so a constant NULL made EVERY
--     membership-scoped policy deny. Every "an authenticated member can read
--     their own community's rows" assertion failed for a reason that has
--     nothing to do with the policy under test.
--   * A constant 'service_role' is the more dangerous of the two — any policy
--     consulting `auth.role()` would treat every caller as privileged, so a
--     test could pass while the production policy denies, or vice versa.
--
-- Supabase resolves these from the per-request JWT. `request.jwt.claim.sub` is
-- the individual-claim GUC (what this repo's tests set); `request.jwt.claims`
-- is the whole-JSON form. Support both, matching upstream.
CREATE OR REPLACE FUNCTION auth.uid()
  RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
  RETURNS text
  LANGUAGE sql
  STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text;
$$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);

-- Extension required by trigram-index migrations.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Table privileges — Supabase parity.
--
-- Supabase's security model is "grants wide open, RLS is the only gate": its
-- bootstrap grants ALL on every object in `public` to anon/authenticated/
-- service_role, and every policy in this repo is written assuming that
-- baseline. The evidence is in the migrations themselves — across all of
-- history they contain only three GRANT statements (0005), and every one of
-- them NARROWS from a baseline they never establish.
--
-- Without these grants a `SET ROLE authenticated` session is refused by
-- ordinary table ACLs (42501) BEFORE any policy is evaluated, so
-- rls-policies.integration.test.ts cannot exercise a single policy. That is
-- why 61 RLS tests sat inert.
--
-- ALTER DEFAULT PRIVILEGES is the load-bearing half: this file is applied
-- BEFORE migrations run, so at this point almost no tenant table exists yet.
-- Default privileges attach to objects the named role creates LATER, and
-- migrations run as `postgres` in both CI and the local runner, so
-- `FOR ROLE postgres` is the correct owner to name.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- The other half, for tables that already exist. Needed because the local DB
-- is PERSISTENT and re-running `local-test-db.sh setup` against an
-- already-migrated database is the normal path (CI is always fresh, so CI
-- would be fine with default privileges alone).
--
-- Sequences are not optional: every id is `bigserial`, so an INSERT as
-- anon/authenticated without USAGE on the backing sequence fails with a
-- DIFFERENT 42501 that reads exactly like an RLS denial but is not one —
-- which would make the suite lie about what it proved.
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
