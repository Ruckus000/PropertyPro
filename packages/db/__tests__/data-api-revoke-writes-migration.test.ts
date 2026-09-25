import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards on migration 0078 (the Data API is read-only on every public
 * table).
 *
 * Same reason as data-api-revoke-migration.test.ts for 0077: the live suite's
 * grants have a second author. scripts/sql/local-supabase-post-migrate.sql
 * re-revokes writes after migrations run, so deleting a statement from 0078
 * leaves rls-policies.integration.test.ts green while production, which has no
 * backstop, reopens. This file reads the migration itself, and runs in the
 * unit job where the integration suite is skipped.
 *
 * Stakes: a property manager self-promoting to root_manager through
 * user_roles, rewriting communities billing columns, and members filing
 * records under other members' ids.
 */

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

/** Collapse whitespace so a statement reflowed across lines still matches. */
function normalize(sql: string): string {
  return stripComments(sql).replace(/\s+/g, ' ');
}

const MIGRATION = normalize(
  readFileSync(path.resolve(__dirname, '../migrations/0078_revoke_data_api_writes.sql'), 'utf8'),
);

const POST_MIGRATE_RAW = readFileSync(
  path.resolve(__dirname, '../../../scripts/sql/local-supabase-post-migrate.sql'),
  'utf8',
);
const MARKER = 'Migration 0078: the Data API is READ-ONLY on every public table.';
const POST_MIGRATE_0078 = normalize(POST_MIGRATE_RAW.slice(POST_MIGRATE_RAW.indexOf(MARKER)));

const WRITE_REVOKE =
  'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;';
const SEQUENCE_REVOKE = 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;';
const DEFAULT_TABLE_REVOKE =
  'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;';
const DEFAULT_SEQUENCE_REVOKE =
  'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;';
const RPC_REVOKE =
  'REVOKE EXECUTE ON FUNCTION public.pp_sync_unit_rent_amount_from_lease(bigint) FROM PUBLIC, anon, authenticated;';
const RPC_GRANT =
  'GRANT EXECUTE ON FUNCTION public.pp_sync_unit_rent_amount_from_lease(bigint) TO service_role;';

describe('migration 0078 — the Data API is read-only', () => {
  it('strips comments without emptying the migration', () => {
    // Anti-vacuity for the negative assertions below.
    expect(MIGRATION).toContain('REVOKE');
    expect(MIGRATION.length).toBeGreaterThan(500);
  });

  it('revokes every write-class privilege on every public table', () => {
    expect(MIGRATION).toContain(WRITE_REVOKE);
  });

  it('revokes every privilege on every public sequence', () => {
    expect(MIGRATION).toContain(SEQUENCE_REVOKE);
  });

  it("stops postgres's default ACL from granting writes on the NEXT table", () => {
    expect(MIGRATION).toContain(DEFAULT_TABLE_REVOKE);
    expect(MIGRATION).toContain(DEFAULT_SEQUENCE_REVOKE);
  });

  it('closes the rent-sync RPC to users while keeping it for service_role (the lease trigger)', () => {
    expect(MIGRATION).toContain(RPC_REVOKE);
    expect(MIGRATION).toContain(RPC_GRANT);
  });

  it('never revokes SELECT from authenticated (Realtime on notifications needs it)', () => {
    expect(MIGRATION).not.toMatch(/REVOKE[^;]*\bSELECT\b[^;]*ON ALL TABLES/i);
    expect(MIGRATION).not.toMatch(/REVOKE ALL ON ALL TABLES/i);
  });

  it('grants nothing to anon or authenticated', () => {
    expect(MIGRATION).not.toMatch(/\bGRANT\b[^;]*\bTO\b[^;]*\b(anon|authenticated)\b/i);
  });

  describe('the local/CI post-migrate backstop mirrors it', () => {
    it('has a 0078 block', () => {
      expect(POST_MIGRATE_RAW.indexOf(MARKER)).toBeGreaterThan(-1);
    });

    it.each([
      ['the table write revoke', WRITE_REVOKE],
      ['the sequence revoke', SEQUENCE_REVOKE],
      ['the default table revoke', DEFAULT_TABLE_REVOKE],
      ['the default sequence revoke', DEFAULT_SEQUENCE_REVOKE],
    ])('repeats %s', (_label, statement) => {
      expect(POST_MIGRATE_0078).toContain(statement);
    });

    it('repeats the rent-sync RPC revoke and service_role grant', () => {
      expect(POST_MIGRATE_0078).toContain(RPC_REVOKE);
      expect(POST_MIGRATE_0078).toContain(RPC_GRANT);
    });
  });
});
