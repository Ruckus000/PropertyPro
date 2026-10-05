import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards on the leases_v3_expand migration (lease_residents,
 * lease_deposits, lease_renewal_offers; plan
 * docs/superpowers/plans/2026-09-29-leases-v3.md).
 *
 * Same reason as unit-occupants-migration.test.ts: the local post-migrate
 * backstop re-revokes these tables, so deleting a REVOKE from the migration
 * would leave the live suite green while production handed every member's JWT
 * the community's deposits and renewal offers.
 */
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');
const FILE = readdirSync(MIGRATIONS_DIR).find((f) => /^\d{4}_leases_v3_expand\.sql$/.test(f));
const RAW = FILE ? readFileSync(path.join(MIGRATIONS_DIR, FILE), 'utf8') : '';
/** Comments stripped: the header discusses what is asserted, and prose must not satisfy an assertion. */
const MIGRATION = RAW.replace(/--[^\n]*/g, '');
const BACKSTOP = readFileSync(path.resolve(__dirname, '../../../scripts/sql/local-supabase-post-migrate.sql'), 'utf8');

const TABLES = ['lease_residents', 'lease_deposits', 'lease_renewal_offers'] as const;
const MANAGER_TIER =
  'pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND pp_rls_can_read_audit_log(community_id))';

describe('migration leases_v3_expand', () => {
  it('exists exactly once and is not emptied by stripping comments', () => {
    expect(FILE).toBeDefined();
    expect(MIGRATION).toContain('CREATE TABLE "lease_residents"');
    expect(MIGRATION.length).toBeGreaterThan(5000);
  });

  it('keeps its number out of the header (the prod ledger hashes the bytes)', () => {
    const number = FILE!.slice(0, 4);
    expect(RAW.split('\n').slice(0, 30).join('\n')).not.toContain(number);
  });

  it('is additive: drops nothing but the resident_id NOT NULL', () => {
    const drops = [...MIGRATION.matchAll(/\bDROP\b[^;]*/gi)].map((m) => m[0]);
    for (const d of drops) expect(d).toMatch(/^DROP (NOT NULL|POLICY IF EXISTS|TRIGGER IF EXISTS)/i);
  });

  for (const t of TABLES) {
    it(`${t}: RLS forced, Data API shut (table and sequence), write-scope trigger`, () => {
      expect(MIGRATION).toContain(`ALTER TABLE IF EXISTS "public"."${t}" ENABLE ROW LEVEL SECURITY`);
      expect(MIGRATION).toContain(`ALTER TABLE IF EXISTS "public"."${t}" FORCE ROW LEVEL SECURITY`);
      expect(MIGRATION).toContain(`REVOKE ALL ON TABLE public.${t} FROM anon, authenticated`);
      expect(MIGRATION).toContain(`REVOKE ALL ON SEQUENCE public.${t}_id_seq FROM anon, authenticated`);
      expect(MIGRATION).toContain(
        `CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public.${t} FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id()`,
      );
      expect(BACKSTOP).toContain(`'${t}'`);
      expect(BACKSTOP).toContain(`'${t}_id_seq'`);
    });

    it(`${t}: every policy, SELECT included, is manager-tier`, () => {
      const policies = [...MIGRATION.matchAll(new RegExp(`CREATE POLICY "(\\w+)" ON public\\."${t}"[\\s\\S]*?;`, 'g'))];
      expect(policies.map((p) => p[1]).sort()).toEqual(
        [`pp_${t}_delete`, `pp_${t}_insert`, `pp_${t}_update`, 'pp_tenant_select'].sort(),
      );
      for (const [statement] of policies) {
        const clauses = [...statement.matchAll(/(?:USING|WITH CHECK) \((.*)\)(?=\s*(?:WITH CHECK|;))/g)].map((m) => m[1]);
        expect(clauses.length).toBeGreaterThan(0);
        for (const clause of clauses) expect(clause).toBe(MANAGER_TIER);
      }
    });
  }

  it('never grants to anon, authenticated or public', () => {
    expect(MIGRATION).not.toMatch(/GRANT[^;]*\bTO\s+(anon|authenticated|public)\b/i);
  });

  it('adds the CHECKs existing lease rows could violate as NOT VALID', () => {
    for (const name of ['leases_end_after_start', 'leases_rent_not_negative', 'leases_zero_rent_needs_reason']) {
      expect(MIGRATION).toMatch(new RegExp(`ADD CONSTRAINT "${name}" CHECK \\([^;]*\\) NOT VALID;`));
    }
  });

  it('creates the composite FK targets before the FKs that use them', () => {
    for (const [target, fk] of [
      ['"leases_id_community_uq"', 'lease_residents_lease_same_community_fk'],
      ['"unit_occupants_id_community_uq"', 'lease_residents_occupant_same_community_fk'],
    ] as const) {
      const t = MIGRATION.indexOf(target);
      const f = MIGRATION.indexOf(fk);
      expect(t).toBeGreaterThan(-1);
      expect(f).toBeGreaterThan(t);
    }
  });

  it('back-fills lease_residents idempotently', () => {
    expect(MIGRATION).toMatch(/INSERT INTO lease_residents[\s\S]*NOT EXISTS \(/);
  });
});

describe('migration leases_v3_validate_checks', () => {
  const name = readdirSync(MIGRATIONS_DIR).find((f) => /^\d{4}_leases_v3_validate_checks\.sql$/.test(f));
  const raw = name ? readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8') : '';
  const sql = raw.replace(/--[^\n]*/g, '');
  const NOT_VALID = [...MIGRATION.matchAll(/ADD CONSTRAINT "(\w+)" CHECK \([^;]*\) NOT VALID;/g)].map((m) => m[1]).sort();

  it('validates exactly the CHECKs leases_v3_expand added NOT VALID, and does nothing else', () => {
    expect(name).toBeDefined();
    const validated = [...sql.matchAll(/ALTER TABLE "leases" VALIDATE CONSTRAINT "(\w+)";/g)].map((m) => m[1]).sort();
    expect(validated).toEqual(NOT_VALID);
    expect(sql.replace(/ALTER TABLE "leases" VALIDATE CONSTRAINT "\w+";/g, '').replace(/statement-breakpoint|\s/g, '')).toBe('');
  });

  it('keeps its number out of the header (the prod ledger hashes the bytes)', () => {
    expect(raw).not.toContain(name!.slice(0, 4));
  });
});
