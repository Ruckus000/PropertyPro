import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards on migration 0085 (unit_occupants — household members with
 * no portal login).
 *
 * The live-database suite cannot cover these, for the reason
 * `platform-admin-preferences-migration.test.ts` spells out: the test
 * database's grants have a second author. `scripts/sql/local-supabase-post-migrate.sql`
 * re-revokes this table after migrations run, so deleting the REVOKE lines
 * from the migration leaves that suite green while production — which has no
 * such backstop — would hand every member's JWT the names, emails and phones
 * of people who never signed up.
 */
const RAW = readFileSync(path.resolve(__dirname, '../migrations/0085_unit_occupants.sql'), 'utf8');
/** Comments stripped: the header discusses what is asserted, and prose must not satisfy an assertion. */
const MIGRATION = RAW.replace(/--[^\n]*/g, '');

const MANAGER_TIER =
  'pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))';

describe('migration 0085 — unit_occupants', () => {
  it('strips comments without emptying the migration', () => {
    expect(MIGRATION).toContain('CREATE TABLE "unit_occupants"');
    expect(MIGRATION.length).toBeGreaterThan(1500);
  });

  it('enables and forces RLS', () => {
    expect(MIGRATION).toContain('ALTER TABLE IF EXISTS "public"."unit_occupants" ENABLE ROW LEVEL SECURITY');
    expect(MIGRATION).toContain('ALTER TABLE IF EXISTS "public"."unit_occupants" FORCE ROW LEVEL SECURITY');
  });

  it('shuts the Data API out of the table AND its sequence', () => {
    expect(MIGRATION).toContain('REVOKE ALL ON TABLE unit_occupants FROM anon, authenticated');
    expect(MIGRATION).toContain('REVOKE ALL ON SEQUENCE unit_occupants_id_seq FROM anon, authenticated');
    expect(MIGRATION).not.toMatch(/GRANT[^;]*\bTO\s+(anon|authenticated|public)\b/i);
  });

  it('carries the tenant write-scope trigger', () => {
    expect(MIGRATION).toMatch(
      /CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public\.unit_occupants FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id\(\)/,
    );
  });

  it('every policy, SELECT included, is manager-tier — never membership alone', () => {
    const policies = [...MIGRATION.matchAll(/CREATE POLICY "(\w+)"[\s\S]*?;/g)];
    expect(policies.map((p) => p[1]).sort()).toEqual([
      'pp_unit_occupants_delete',
      'pp_unit_occupants_insert',
      'pp_unit_occupants_select',
      'pp_unit_occupants_update',
    ]);
    for (const [statement] of policies) {
      const clauses = [...statement.matchAll(/(?:USING|WITH CHECK) \((.*)\)(?=\s*(?:WITH CHECK|;))/g)].map((m) => m[1]);
      expect(clauses.length).toBeGreaterThan(0);
      for (const clause of clauses) expect(clause).toBe(MANAGER_TIER);
    }
  });
});
