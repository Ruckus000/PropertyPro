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
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Auth schema and helpers.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
  RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$ SELECT NULL::uuid; $$;

CREATE OR REPLACE FUNCTION auth.role()
  RETURNS text
  LANGUAGE sql
  STABLE
AS $$ SELECT 'service_role'::text; $$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);

-- Extension required by trigram-index migrations.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
