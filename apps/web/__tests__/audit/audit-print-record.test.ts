/**
 * buildAuditPrintRecord feeds the printable audit record. A printout can show
 * who opened what, so producing one must itself be logged; and a history too
 * long to print must say so rather than silently stop.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logAuditEventMock, rowsRef, resolveUserDisplayNamesMock } = vi.hoisted(() => ({
  logAuditEventMock: vi.fn(),
  rowsRef: { rows: [] as Record<string, unknown>[] },
  resolveUserDisplayNamesMock: vi.fn(),
}));

function chain(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.orderBy = () => builder;
  builder.limit = (n: number) => Promise.resolve(rows.slice(0, n));
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return builder;
}

vi.mock('@propertypro/db', async () => {
  const schema = await import('../../../../packages/db/src/schema');
  return {
    ...schema,
    paginate: vi.fn(),
    logAuditEvent: logAuditEventMock,
    createScopedClient: () => ({
      selectFrom: (table: unknown) => (table === schema.complianceAuditLog ? chain(rowsRef.rows) : chain([])),
    }),
  };
});
vi.mock('@/lib/utils/resolve-users', () => ({ resolveUserDisplayNames: resolveUserDisplayNamesMock }));

import { AUDIT_PRINT_MAX_ENTRIES, buildAuditPrintRecord } from '../../src/lib/services/audit-trail-service';

const MARIA = '11111111-1111-1111-1111-111111111111';

function row(id: number) {
  return {
    id,
    userId: MARIA,
    communityId: 7,
    action: 'update',
    resourceType: 'document',
    resourceId: '10',
    oldValues: { title: 'A' },
    newValues: { title: 'B', apiToken: 'secret-value' },
    metadata: null,
    createdAt: new Date(Date.UTC(2026, 9, id)),
  };
}

describe('buildAuditPrintRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveUserDisplayNamesMock.mockResolvedValue(new Map([[MARIA, 'Maria Lopez']]));
  });

  it('returns entries oldest first, redacted, with names', async () => {
    rowsRef.rows = [row(3), row(2), row(1)]; // the query returns newest first
    const record = await buildAuditPrintRecord({
      communityId: 7,
      actorUserId: MARIA,
      filters: { view: 'all', scope: { kind: 'person', userId: MARIA } },
      fallbackLabel: null,
    });
    expect(record.entries.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(record.entries[0]!.newValues).toEqual({ title: 'B', apiToken: '[REDACTED]' });
    expect(record.scopeLabel).toBe('Maria Lopez');
    expect(record.truncated).toBe(false);
  });

  it('logs that the record was produced, naming what it covered', async () => {
    rowsRef.rows = [row(2), row(1)];
    await buildAuditPrintRecord({
      communityId: 7,
      actorUserId: MARIA,
      filters: { view: 'all', scope: { kind: 'item', entityType: 'document', resourceId: '10' } },
      fallbackLabel: 'Budget 2026.pdf',
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MARIA,
        action: 'audit_evidence_generated',
        resourceType: 'document',
        resourceId: '10',
        communityId: 7,
        metadata: expect.objectContaining({ scopeLabel: 'Budget 2026.pdf', entryCount: 2, truncated: false }),
      }),
    );
  });

  it('names the manager who generated it, even when they appear in no entry', async () => {
    const ROBIN = '22222222-2222-4222-8222-222222222222';
    resolveUserDisplayNamesMock.mockResolvedValue(new Map([[MARIA, 'Maria Lopez'], [ROBIN, 'Robin Root']]));
    rowsRef.rows = [row(1)]; // every entry is Maria's
    const record = await buildAuditPrintRecord({ communityId: 7, actorUserId: ROBIN, filters: {}, fallbackLabel: null });
    expect(resolveUserDisplayNamesMock.mock.calls[0]![1]).toContain(ROBIN);
    expect(record.users[ROBIN]).toBe('Robin Root');
  });

  it('flags a history longer than one printout can hold', async () => {
    rowsRef.rows = Array.from({ length: AUDIT_PRINT_MAX_ENTRIES + 5 }, (_, i) => row(i + 1));
    const record = await buildAuditPrintRecord({ communityId: 7, actorUserId: MARIA, filters: {}, fallbackLabel: null });
    expect(record.entries).toHaveLength(AUDIT_PRINT_MAX_ENTRIES);
    expect(record.truncated).toBe(true);
    expect(logAuditEventMock.mock.calls[0]![0].metadata).toMatchObject({ truncated: true, scopeLabel: 'the whole community' });
  });
});
