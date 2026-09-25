import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DATA_API_REVOKED_TENANT_TABLES,
  RLS_TENANT_TABLE_NAMES,
} from '../src/schema/rls-config';

/**
 * Static guards on migration 0077 (tenant tables shut to the Supabase Data API).
 *
 * The live-database checks in rls-policies.integration.test.ts cannot stand in
 * for these, for the reason `platform-admin-preferences-migration.test.ts`
 * spells out: the test database's grants have a SECOND author.
 * `scripts/sql/local-supabase-post-migrate.sql` re-revokes these tables after
 * migrations run, so deleting the REVOKE from the migration leaves the
 * integration suite green while production — which has no such backstop —
 * would be wide open again. Only a test that reads the migration itself can
 * see that. It also runs in the unit job, where the integration suite is
 * skipped.
 *
 * What is at stake if a table drops off the list: any community member reads
 * every row of it through PostgREST with their own JWT and the anon key that
 * ships in the browser bundle — for accounting_connections and
 * calendar_sync_tokens that is OAuth refresh tokens.
 */

const RAW = readFileSync(
  path.resolve(__dirname, '../migrations/0077_revoke_data_api_tenant_tables.sql'),
  'utf8',
);

/**
 * `--` comments stripped. The header discusses exactly what is asserted below
 * (it names tables, REVOKE and GRANT), so matching the raw text would let prose
 * satisfy an assertion the SQL does not.
 */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

const MIGRATION = stripComments(RAW);

function firstArrayLiteral(sql: string): string[] {
  const body = /ARRAY\[([\s\S]*?)\]/.exec(sql)?.[1] ?? '';
  return [...body.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]!);
}

const EXPECTED = [...DATA_API_REVOKED_TENANT_TABLES].sort();

describe('migration 0077 — tenant tables shut to the Data API', () => {
  it('strips comments without emptying the migration', () => {
    // Anti-vacuity: if the strip ever ate the statements, every negative
    // assertion below would pass against an empty string.
    expect(MIGRATION).toContain('REVOKE ALL ON TABLE');
    expect(MIGRATION).toContain('CREATE POLICY');
    expect(MIGRATION.length).toBeGreaterThan(1500);
  });

  it('revokes exactly the tables DATA_API_REVOKED_TENANT_TABLES names', () => {
    const tables = firstArrayLiteral(MIGRATION);
    expect(tables.length).toBe(DATA_API_REVOKED_TENANT_TABLES.length);
    expect(new Set(tables).size).toBe(tables.length);
    expect([...tables].sort()).toEqual(EXPECTED);
  });

  it('revokes every privilege from anon AND authenticated, on tables and their sequences', () => {
    expect(MIGRATION).toContain(
      "format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t)",
    );
    expect(MIGRATION).toContain(
      "format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated', s)",
    );
  });

  it('grants nothing — service_role keeps whatever narrower grant it already has', () => {
    expect(MIGRATION).not.toMatch(/\bGRANT\b/i);
  });

  describe('user_roles is narrowed, not revoked', () => {
    // storage.objects policies subquery user_roles as `authenticated`; revoking
    // it would break community-site asset uploads for every manager.
    const CREATE_USER_ROLES_SELECT =
      /CREATE POLICY "pp_tenant_select" ON public\."user_roles"[\s\S]*?\);/.exec(MIGRATION)?.[0] ??
      '';

    it('keeps user_roles out of the revoke list', () => {
      expect(firstArrayLiteral(MIGRATION)).not.toContain('user_roles');
    });

    it('drops the membership-only SELECT policy before recreating it', () => {
      expect(MIGRATION).toContain('DROP POLICY IF EXISTS "pp_tenant_select" ON public."user_roles"');
      expect(CREATE_USER_ROLES_SELECT).toContain('FOR SELECT');
    });

    it('admits own rows and the admin tier, and never plain membership', () => {
      expect(CREATE_USER_ROLES_SELECT).toContain('user_id = auth.uid()');
      expect(CREATE_USER_ROLES_SELECT).toContain('pp_rls_can_read_audit_log(community_id)');
      expect(CREATE_USER_ROLES_SELECT).not.toContain('pp_rls_can_access_community');
    });
  });

  describe('DATA_API_REVOKED_TENANT_TABLES', () => {
    it('names only registered tenant tables', () => {
      const registered = new Set<string>(RLS_TENANT_TABLE_NAMES);
      expect(DATA_API_REVOKED_TENANT_TABLES.filter((name) => !registered.has(name))).toEqual([]);
    });

    it('has no duplicates', () => {
      expect(new Set(DATA_API_REVOKED_TENANT_TABLES).size).toBe(
        DATA_API_REVOKED_TENANT_TABLES.length,
      );
    });

    it.each(['calendar_sync_tokens', 'accounting_connections', 'invitations',
      'election_ballot_submissions', 'leases', 'units'])(
      'still lists %s (a table whose exposure was the reason for 0077)',
      (table) => {
        expect(DATA_API_REVOKED_TENANT_TABLES).toContain(table);
      },
    );
  });

  describe('the local/CI post-migrate backstop mirrors the migration', () => {
    // On a PERSISTENT local database the Supabase stub re-grants blanket
    // privileges on every `local-test-db.sh setup` and the migrations do not
    // re-run. A table missing from the backstop is member-readable locally and
    // in CI with everything green (0068's inbox tables, until 0072).
    const POST_MIGRATE_RAW = readFileSync(
      path.resolve(__dirname, '../../../scripts/sql/local-supabase-post-migrate.sql'),
      'utf8',
    );
    const MARKER = 'Tenant tables shut to the Data API by migration 0077';
    const markerAt = POST_MIGRATE_RAW.indexOf(MARKER);
    const BLOCK = stripComments(POST_MIGRATE_RAW.slice(markerAt));
    const BLOCK_BODY = /DO \$\$[\s\S]*?END \$\$;/.exec(BLOCK)?.[0] ?? '';

    it('has a 0077 block', () => {
      expect(markerAt).toBeGreaterThan(-1);
      expect(BLOCK_BODY).toContain('REVOKE ALL ON TABLE');
    });

    it('lists exactly the same tables', () => {
      expect([...firstArrayLiteral(BLOCK_BODY)].sort()).toEqual(EXPECTED);
    });

    it('revokes owned sequences too', () => {
      expect(BLOCK_BODY).toContain(
        "format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated', s)",
      );
    });

    it('does not re-grant service_role (unlike the platform-table loop above it)', () => {
      expect(BLOCK_BODY).not.toMatch(/\bGRANT\b/i);
    });
  });
});
