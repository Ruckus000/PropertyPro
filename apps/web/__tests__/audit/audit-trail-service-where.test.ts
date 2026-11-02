/**
 * The audit trail's "Show" choices and person/item scopes are pushed into SQL
 * by buildAuditTrailWhere (reached through paginateAuditTrail). These tests
 * compile the captured `where` against the real table definitions and assert
 * the predicate each choice produces, so "Important" can't quietly start
 * showing routine rows or "Deleted" stop matching deletions.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { paginateMock } = vi.hoisted(() => ({ paginateMock: vi.fn() }));

// The real schema (no drizzle client, so no DATABASE_URL needed), plus stubs
// for the two runtime functions the service calls.
vi.mock('@propertypro/db', async () => ({
  ...(await import('../../../../packages/db/src/schema')),
  createScopedClient: () => ({}),
  paginate: paginateMock,
}));

// resolve-users loads the unscoped db client at import; this file never resolves names.
vi.mock('@/lib/utils/resolve-users', () => ({ resolveUserDisplayNames: vi.fn() }));

import { paginateAuditTrail, type AuditTrailFilters } from '../../src/lib/services/audit-trail-service';

async function compiledWhere(filters: AuditTrailFilters): Promise<{ sql: string; params: unknown[] } | null> {
  paginateMock.mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false, pageSize: 50 } });
  await paginateAuditTrail({ communityId: 7, filters });
  const where = paginateMock.mock.calls.at(-1)?.[3]?.where as SQL | undefined;
  return where ? new PgDialect().sqlToQuery(where) : null;
}

describe('buildAuditTrailWhere', () => {
  beforeEach(() => paginateMock.mockReset());

  it('adds nothing when no filter is set (the compliance feed’s call)', async () => {
    expect(await compiledWhere({})).toBeNull();
  });

  it('Important excludes the routine rules', async () => {
    const q = await compiledWhere({ view: 'important' });
    expect(q?.sql).toMatch(/^not \(/);
    expect(q?.params).toContain('document_accessed');
    expect(q?.params).toEqual(expect.arrayContaining(['update', 'onboarding_wizard', 'create', 'ledger_entry']));
  });

  it('Everything adds no view predicate', async () => {
    expect(await compiledWhere({ view: 'all' })).toBeNull();
  });

  it('Deleted matches deletions and is not a negation', async () => {
    const q = await compiledWhere({ view: 'deleted' });
    expect(q?.sql).not.toMatch(/not \(/);
    expect(q?.params).toEqual(expect.arrayContaining(['delete', 'document_deleted', 'community_purged']));
    expect(q?.params).not.toContain('document_accessed');
  });

  it('Access changes also match anything done during a support session', async () => {
    const q = await compiledWhere({ view: 'access' });
    expect(q?.params).toEqual(expect.arrayContaining(['role_assigned', 'root_transferred', 'support']));
    expect(q?.sql).toContain('"compliance_audit_log"."metadata" ?');
  });

  it('a person scope matches what they did and access changes about them', async () => {
    const userId = '22222222-2222-2222-2222-222222222222';
    const q = await compiledWhere({ scope: { kind: 'person', userId } });
    expect(q?.sql).toContain('"compliance_audit_log"."user_id" = $1');
    expect(q?.sql).toContain(`"compliance_audit_log"."new_values" ->> 'userId' =`);
    expect(q?.params.filter((p) => p === userId)).toHaveLength(3);
  });

  it('a document scope matches its own rows and checklist links to it', async () => {
    const q = await compiledWhere({ scope: { kind: 'item', entityType: 'document', resourceId: '482' } });
    expect(q?.sql).toContain('"compliance_audit_log"."resource_type" in ($1)');
    expect(q?.sql).toContain(`"compliance_audit_log"."new_values" ->> 'documentId' =`);
    expect(q?.params).toEqual(['document', '482', '482']);
  });

  it('control: a meeting scope has no checklist-link clause', async () => {
    const q = await compiledWhere({ scope: { kind: 'item', entityType: 'meeting', resourceId: '9' } });
    expect(q?.sql).not.toContain('documentId');
    expect(q?.params).toEqual(['meeting', 'meeting_document', '9']);
  });

  it('combines a view, a scope and a date', async () => {
    const q = await compiledWhere({
      view: 'deleted',
      scope: { kind: 'person', userId: '22222222-2222-2222-2222-222222222222' },
      startDate: '2026-10-01',
    });
    expect(q?.sql).toContain('"compliance_audit_log"."created_at" >=');
    expect(q?.params).toContain('delete');
  });
});
