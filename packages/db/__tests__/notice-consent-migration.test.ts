import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards on migration 0090 (notice_consent — owner consent to
 * electronic notice).
 *
 * The live-database suite cannot cover the grants, for the reason
 * `unit-occupants-migration.test.ts` gives: `scripts/sql/local-supabase-post-migrate.sql`
 * re-revokes the table after migrations run, so deleting the REVOKE lines here
 * would leave that suite green while production exposed every owner's consent
 * record (email, IP, user agent) to the Data API.
 */
const RAW = readFileSync(path.resolve(__dirname, '../migrations/0090_notice_consent.sql'), 'utf8');
/** Comments stripped: the header discusses what is asserted, and prose must not satisfy an assertion. */
const MIGRATION = RAW.replace(/--[^\n]*/g, '');

const OWNER_ONLY =
  'pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (user_id = auth.uid()))';
const OWNER_OR_MANAGER =
  'pp_rls_is_privileged() OR ((auth.uid() IS NOT NULL) AND pp_rls_can_access_community(community_id) AND (pp_rls_can_read_audit_log(community_id) OR (user_id = auth.uid())))';

function clausesOf(name: string): string[] {
  const statement = new RegExp(`CREATE POLICY "${name}"[\\s\\S]*?;`).exec(MIGRATION)?.[0] ?? '';
  return [...statement.matchAll(/(?:USING|WITH CHECK) \((.*)\)(?=\s*(?:WITH CHECK|;))/g)].map((m) => m[1]!);
}

describe('migration 0090 — notice_consent', () => {
  it('strips comments without emptying the migration', () => {
    expect(MIGRATION).toContain('CREATE TABLE "notice_consent"');
    expect(MIGRATION.length).toBeGreaterThan(1500);
  });

  it('enables and forces RLS', () => {
    expect(MIGRATION).toContain('ALTER TABLE IF EXISTS "public"."notice_consent" ENABLE ROW LEVEL SECURITY');
    expect(MIGRATION).toContain('ALTER TABLE IF EXISTS "public"."notice_consent" FORCE ROW LEVEL SECURITY');
  });

  it('shuts the Data API out of the table AND its sequence', () => {
    expect(MIGRATION).toContain('REVOKE ALL ON TABLE notice_consent FROM anon, authenticated');
    expect(MIGRATION).toContain('REVOKE ALL ON SEQUENCE notice_consent_id_seq FROM anon, authenticated');
    expect(MIGRATION).not.toMatch(/GRANT[^;]*\bTO\s+(anon|authenticated|public)\b/i);
  });

  it('carries the tenant write-scope trigger', () => {
    expect(MIGRATION).toMatch(
      /CREATE TRIGGER pp_rls_enforce_tenant_scope BEFORE INSERT OR UPDATE ON public\.notice_consent FOR EACH ROW EXECUTE FUNCTION pp_rls_enforce_tenant_community_id\(\)/,
    );
  });

  it('allows one active consent per owner per community, keeping withdrawn rows', () => {
    expect(MIGRATION).toContain(
      'CREATE UNIQUE INDEX "notice_consent_active_uq" ON "notice_consent" USING btree ("community_id","user_id") WHERE "notice_consent"."revoked_at" is null and "notice_consent"."deleted_at" is null',
    );
  });

  it('declares exactly the four policies', () => {
    expect([...MIGRATION.matchAll(/CREATE POLICY "(\w+)"/g)].map((m) => m[1]).sort()).toEqual([
      'pp_notice_consent_delete',
      'pp_notice_consent_insert',
      'pp_notice_consent_select',
      'pp_notice_consent_update',
    ]);
  });

  it('lets only the owner give or withdraw — a manager cannot consent for them', () => {
    expect(clausesOf('pp_notice_consent_insert')).toEqual([OWNER_ONLY]);
    expect(clausesOf('pp_notice_consent_update')).toEqual([OWNER_ONLY, OWNER_ONLY]);
  });

  it('lets the owner and the manager tier read', () => {
    expect(clausesOf('pp_notice_consent_select')).toEqual([OWNER_OR_MANAGER]);
  });

  it('allows no authenticated delete', () => {
    expect(clausesOf('pp_notice_consent_delete')).toEqual(['pp_rls_is_privileged()']);
  });
});
