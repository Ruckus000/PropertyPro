import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RLS_GLOBAL_TABLE_EXCLUSIONS, RLS_EXPECTED_TENANT_TABLE_COUNT } from '../src/schema/rls-config';

/**
 * Static guards on migration 0052 (platform_admin_audit_log).
 *
 * The sibling `audit-log-append-only-db.integration.test.ts` proves the
 * behaviour against a real Postgres, but it is skipped whenever DATABASE_URL
 * is absent — which is the case in the CI unit job. These assertions read the
 * migration text instead, so the security-critical properties are checked on
 * every PR.
 *
 * What is actually being defended here: the append-only property of this table
 * rests on service_role NOT holding UPDATE or DELETE. That is one word in one
 * GRANT, it looks like an oversight next to eleven sibling tables that do grant
 * full CRUD, and "fixing" it would silently make the operator audit trail
 * rewritable by the same client that writes it.
 */

const MIGRATION = readFileSync(
  path.resolve(__dirname, '../migrations/0052_platform_admin_audit_log.sql'),
  'utf8',
);

const TABLE = 'platform_admin_audit_log';

describe('0052 platform_admin_audit_log migration', () => {
  it('creates the table', () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS "public"\."platform_admin_audit_log"/);
  });

  it('leaves community_id NULLABLE — platform actions have no community', () => {
    // The entire reason this table exists: compliance_audit_log.community_id
    // and support_access_log.community_id are both NOT NULL, so neither can
    // record "who granted platform admin".
    const columnLine = MIGRATION.split('\n').find((l) => l.includes('"community_id" bigint'));
    expect(columnLine).toBeDefined();
    expect(columnLine).not.toMatch(/NOT NULL/);
  });

  it('uses ON DELETE SET NULL so an entry outlives the community it describes', () => {
    // CASCADE would mean deleting a tenant deletes the record of the deletion.
    expect(MIGRATION).toMatch(/REFERENCES "public"\."communities"\("id"\)\s*\n?\s*ON DELETE SET NULL/);
    expect(MIGRATION).not.toMatch(/communities"\("id"\)\s*\n?\s*ON DELETE CASCADE/);
  });

  it('does NOT declare a foreign key on admin_user_id', () => {
    // A platform admin need not have a public.users row, and
    // compliance_audit_log's ON DELETE RESTRICT FK to users.id is exactly what
    // would reject such an actor.
    expect(MIGRATION).not.toMatch(/"admin_user_id"[^\n]*REFERENCES/);
    expect(MIGRATION).not.toMatch(/FOREIGN KEY \("admin_user_id"\)/);
  });

  // --- The append-only contract -------------------------------------------

  it('grants service_role SELECT and INSERT only — never UPDATE or DELETE', () => {
    // `ON TABLE` only — the bigserial's sequence grant legitimately carries
    // USAGE and its name contains the table name as a prefix.
    const grants = MIGRATION.split('\n').filter(
      (l) => l.includes('GRANT') && l.includes('ON TABLE') && l.includes(TABLE),
    );

    expect(grants.length).toBeGreaterThan(0);
    for (const grant of grants) {
      expect(grant).toMatch(/GRANT SELECT, INSERT ON TABLE/);
      expect(grant).not.toMatch(/\bUPDATE\b/);
      expect(grant).not.toMatch(/\bDELETE\b/);
    }
  });

  it('REVOKES from service_role before granting — GRANT alone is additive', () => {
    // Supabase's default privileges grant service_role ALL at CREATE TABLE
    // (verified in production: DELETE,INSERT,REFERENCES,SELECT,TRIGGER,
    // TRUNCATE,UPDATE). GRANT takes nothing away, so without this REVOKE the
    // narrow grant above is a no-op and there is no append-only property at
    // all. Order matters: the REVOKE must precede the GRANT.
    const revokeIdx = MIGRATION.indexOf(
      'REVOKE ALL ON TABLE "public"."platform_admin_audit_log" FROM anon, authenticated, service_role',
    );
    const grantIdx = MIGRATION.indexOf(
      'GRANT SELECT, INSERT ON TABLE "public"."platform_admin_audit_log" TO service_role',
    );

    expect(revokeIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(revokeIdx);
  });

  it('revokes the sequence from service_role too', () => {
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON SEQUENCE "public"\."platform_admin_audit_log_id_seq" FROM anon, authenticated, service_role/,
    );
  });

  it('installs a BEFORE UPDATE OR DELETE trigger as the second line of defence', () => {
    // The grant does not bind the privileged Drizzle connection, which holds
    // rolbypassrls. The trigger does.
    expect(MIGRATION).toMatch(/BEFORE UPDATE OR DELETE ON "public"\."platform_admin_audit_log"/);
    expect(MIGRATION).toMatch(/RAISE EXCEPTION/);
  });

  it('covers TRUNCATE with a STATEMENT-level trigger', () => {
    // A FOR EACH ROW trigger never fires for TRUNCATE — no rows to fire per —
    // so UPDATE/DELETE coverage says nothing about it. TRUNCATE is part of the
    // ALL that default privileges grant, and it erases the entire trail.
    expect(MIGRATION).toMatch(/BEFORE TRUNCATE ON "public"\."platform_admin_audit_log"/);
    expect(MIGRATION).toMatch(/FOR EACH STATEMENT EXECUTE FUNCTION/);
  });

  // --- Lockdown posture ----------------------------------------------------

  it('enables and FORCES row level security', () => {
    expect(MIGRATION).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(MIGRATION).toMatch(/FORCE ROW LEVEL SECURITY/);
  });

  it('declares zero policies — the deny-everyone default', () => {
    expect(MIGRATION).not.toMatch(/CREATE POLICY/i);
  });

  it('revokes all privileges from anon and authenticated', () => {
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON TABLE "public"\."platform_admin_audit_log" FROM anon, authenticated/,
    );
  });

  it('grants the sequence so INSERT actually works', () => {
    // A table INSERT grant without USAGE on the bigserial sequence fails at
    // runtime with "permission denied for sequence".
    expect(MIGRATION).toMatch(
      /GRANT USAGE, SELECT ON SEQUENCE "public"\."platform_admin_audit_log_id_seq" TO service_role/,
    );
  });
});

describe('platform_admin_audit_log RLS registration', () => {
  it('is registered as a GLOBAL (platform) table, not a tenant table', () => {
    const entry = RLS_GLOBAL_TABLE_EXCLUSIONS.find((t) => t.tableName === TABLE);

    expect(entry).toBeDefined();
    expect(entry!.reason.length).toBeGreaterThan(50);
  });

  it('does not count toward the tenant-table total', () => {
    // A platform table must NOT bump RLS_EXPECTED_TENANT_TABLE_COUNT. Pinning
    // the value here makes an accidental bump in this PR visible.
    // Bumped 80 → 82 by migration 0058 (community_export_jobs +
    // community_export_job_parts), then 82 → 83 by 0065
    // (site_publish_schedules) — all tenant tables. The assertion still does
    // its job: it pins the value so an accidental bump is visible.
    expect(RLS_EXPECTED_TENANT_TABLE_COUNT).toBe(83);
  });
});
