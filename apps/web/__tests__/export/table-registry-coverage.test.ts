/**
 * Coverage guard for the community-export table registry.
 *
 * This test is the entire mechanism that keeps the export honest. Without it,
 * adding a tenant table simply means it is silently absent from every future
 * export — and "we forgot" is indistinguishable from "we decided not to" once
 * the archive is in someone's hands.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { describe, expect, it, vi } from 'vitest';
import { RLS_TENANT_TABLES } from '../../../../packages/db/src/schema/rls-config';

// The registry imports drizzle TABLE OBJECTS from `@propertypro/db`, whose barrel
// reaches `drizzle.ts` and throws at module load without DATABASE_URL. This test
// cares only about table names, file paths and column KEYS, so the tables are
// stubbed — but with a Proxy that returns a distinct marker per property rather
// than a bare Symbol. A bare-Symbol table makes every `table.column` reference
// silently `undefined`, which is how a mock stops resembling the thing it mocks.
vi.mock('@propertypro/db', () => {
  // Each table is a Proxy returning a distinct marker per property, NOT a bare
  // Symbol: a bare-Symbol table makes every `table.column` reference silently
  // `undefined`, which is how a mock stops resembling the thing it mocks.
  //
  // Listed explicitly rather than via a catch-all Proxy because vitest validates
  // named exports against the real module and rejects a Proxy.
  const tableProxy = (name: string) =>
    new Proxy({}, { get: (_t, prop) => ({ __column: `${name}.${String(prop)}` }) });
  return {
    amenities: tableProxy('amenities'),
    amenityReservations: tableProxy('amenityReservations'),
    announcements: tableProxy('announcements'),
    arcSubmissions: tableProxy('arcSubmissions'),
    assessmentLineItems: tableProxy('assessmentLineItems'),
    assessments: tableProxy('assessments'),
    complianceAuditLog: tableProxy('complianceAuditLog'),
    complianceChecklistItems: tableProxy('complianceChecklistItems'),
    contracts: tableProxy('contracts'),
    documentCategories: tableProxy('documentCategories'),
    documents: tableProxy('documents'),
    insurancePolicies: tableProxy('insurancePolicies'),
    leases: tableProxy('leases'),
    ledgerEntries: tableProxy('ledgerEntries'),
    maintenanceRequests: tableProxy('maintenanceRequests'),
    meetingDocuments: tableProxy('meetingDocuments'),
    meetings: tableProxy('meetings'),
    reserveAssets: tableProxy('reserveAssets'),
    units: tableProxy('units'),
    userRoles: tableProxy('userRoles'),
    vendors: tableProxy('vendors'),
    violationFines: tableProxy('violationFines'),
    violations: tableProxy('violations'),
    workOrders: tableProxy('workOrders'),
  };
});

const { EXPORT_TABLES, INTENTIONALLY_EXCLUDED } = await import(
  '@/lib/services/export/table-registry'
);

const EXPORTED = new Set(EXPORT_TABLES.map((t) => t.tableName));
const EXCLUDED = new Set(Object.keys(INTENTIONALLY_EXCLUDED));
const TENANT_TABLES = RLS_TENANT_TABLES.map((t) => t.tableName);

describe('community export table registry', () => {
  it('accounts for EVERY tenant table — exported or explicitly excluded', () => {
    const unaccounted = TENANT_TABLES.filter(
      (name) => !EXPORTED.has(name) && !EXCLUDED.has(name),
    );

    expect(
      unaccounted,
      `These tenant tables are neither exported nor explicitly excluded. Add them to\n`
        + `EXPORT_TABLES, or to INTENTIONALLY_EXCLUDED with a reason. Silence here means\n`
        + `an association's export quietly stops being its record set:\n  ${unaccounted.join('\n  ')}`,
    ).toEqual([]);
  });

  it('never both exports and excludes the same table', () => {
    const both = TENANT_TABLES.filter((name) => EXPORTED.has(name) && EXCLUDED.has(name));
    expect(both).toEqual([]);
  });

  it('does not reference tables that are not tenant-scoped', () => {
    // A non-tenant table in the registry would mean the worker queries it
    // through a scoped client that cannot scope it — cross-tenant leakage.
    const tenantSet = new Set(TENANT_TABLES);
    const strays = EXPORT_TABLES.map((t) => t.tableName).filter((n) => !tenantSet.has(n));
    expect(strays).toEqual([]);
  });

  it('gives every exclusion a real reason', () => {
    for (const [table, reason] of Object.entries(INTENTIONALLY_EXCLUDED)) {
      expect(reason.length, `${table} needs a substantive reason`).toBeGreaterThan(20);
    }
  });

  it('gives every exported table a distinct file path and a stated purpose', () => {
    const files = EXPORT_TABLES.map((t) => t.file);
    expect(new Set(files).size, 'duplicate file paths would silently overwrite').toBe(files.length);

    for (const spec of EXPORT_TABLES) {
      expect(spec.columns.length, `${spec.tableName} exports no columns`).toBeGreaterThan(0);
      expect(spec.why.length, `${spec.tableName} needs a stated purpose`).toBeGreaterThan(20);
    }
  });

  it('never exports a column that could carry credentials or search internals', () => {
    // Belt-and-braces on the no-SELECT-* rule: even hand-listed columns can pick
    // up a name like this by copy-paste.
    const FORBIDDEN = /token|secret|password|searchVector|accessToken|refreshToken/i;
    for (const spec of EXPORT_TABLES) {
      for (const c of spec.columns) {
        expect(
          FORBIDDEN.test(c.key),
          `${spec.tableName}.${c.key} looks like a credential or search internal`,
        ).toBe(false);
      }
    }
  });

  it('excludes ballot tables, for secrecy', () => {
    // §718.128 requires that a ballot cannot be tied to a specific unit owner.
    // An export containing per-unit ballots would defeat that in one file.
    for (const table of [
      'poll_votes',
      'election_ballots',
      'election_ballot_submissions',
      'election_proxies',
      'election_eligibility_snapshots',
    ]) {
      expect(EXCLUDED.has(table), `${table} must stay excluded for ballot secrecy`).toBe(true);
      expect(EXPORTED.has(table)).toBe(false);
    }
  });

  it('excludes tables holding live credentials', () => {
    for (const table of ['invitations', 'calendar_sync_tokens', 'accounting_connections']) {
      expect(EXCLUDED.has(table), `${table} holds credentials and must stay excluded`).toBe(true);
    }
  });
});
