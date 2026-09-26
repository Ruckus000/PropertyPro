import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards on migration 0079 (pp_rls_effective_role reads the PostgREST v12
 * claims; communities shut to the Data API).
 *
 * rls-policies.integration.test.ts proves the behaviour on a live database, but
 * it is skipped in the unit job, and for the communities revoke the test
 * database has a second author (local-supabase-post-migrate.sql re-applies it),
 * so a revoke deleted from the migration would stay green there while
 * production kept the grant. This file reads the migration itself.
 */

function normalize(sql: string): string {
  return sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
}

const MIGRATION = normalize(
  readFileSync(
    path.resolve(__dirname, '../migrations/0079_effective_role_claims_revoke_communities.sql'),
    'utf8',
  ),
);

const POST_MIGRATE_RAW = readFileSync(
  path.resolve(__dirname, '../../../scripts/sql/local-supabase-post-migrate.sql'),
  'utf8',
);
const MARKER = 'Migration 0079: communities is shut to the Data API.';
const POST_MIGRATE_0079 = normalize(POST_MIGRATE_RAW.slice(POST_MIGRATE_RAW.indexOf(MARKER)));

const COMMUNITIES_REVOKE = 'REVOKE ALL ON TABLE public.communities FROM anon, authenticated;';

describe('migration 0079 — effective role from v12 claims; communities shut', () => {
  it('strips comments without emptying the migration', () => {
    // Anti-vacuity for the negative assertion below: the header names GRANT.
    expect(MIGRATION).toContain('CREATE OR REPLACE FUNCTION');
    expect(MIGRATION).toContain('REVOKE');
  });

  it('pp_rls_effective_role delegates to auth.role() (which reads the v12 JSON claims), then session_user', () => {
    const fn = /FUNCTION public\.pp_rls_effective_role\(\).*?\$function\$;/.exec(MIGRATION)?.[0] ?? '';
    expect(fn).toContain("COALESCE(NULLIF(auth.role(), ''), session_user)");
  });

  it('relies on a local stub auth.role() that reads request.jwt.claims, like production', () => {
    const stub = readFileSync(
      path.resolve(__dirname, '../../../scripts/sql/local-supabase-stub.sql'),
      'utf8',
    );
    const start = stub.indexOf('FUNCTION auth.role()');
    expect(start).toBeGreaterThan(-1);
    expect(stub.slice(start, start + 600)).toContain("current_setting('request.jwt.claims', true)");
    // SECURITY INVOKER callers resolve auth.role() as themselves.
    expect(stub).toContain('GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;');
  });

  it('revokes every privilege on communities from anon and authenticated', () => {
    expect(MIGRATION).toContain(COMMUNITIES_REVOKE);
  });

  it('grants nothing to anon or authenticated', () => {
    expect(MIGRATION).not.toMatch(/\bGRANT\b/i);
  });

  it('the local/CI post-migrate backstop repeats the communities revoke', () => {
    expect(POST_MIGRATE_RAW.indexOf(MARKER)).toBeGreaterThan(-1);
    expect(POST_MIGRATE_0079).toContain(COMMUNITIES_REVOKE);
  });
});
