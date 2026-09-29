/**
 * cancelReservationForCommunity — support-session attribution on its inline
 * compliance_audit_log insert.
 *
 * The cancel transition writes its audit row on the transaction handle,
 * bypassing logAuditEvent, so it merges the request's audit actor itself
 * (packages/db/src/audit-actor.ts). withErrorHandler enters that actor in a
 * real request; here it is entered directly. Mirrors the site-blocks /
 * site-pages service cases.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { txAuditValuesMock, txUpdateReturningMock, existingRow } = vi.hoisted(() => ({
  txAuditValuesMock: vi.fn(async () => undefined),
  txUpdateReturningMock: vi.fn(),
  existingRow: {
    id: 11,
    communityId: 42,
    amenityId: 1,
    userId: 'user-1',
    unitId: null,
    startTime: new Date('2026-10-01T10:00:00Z'),
    endTime: new Date('2026-10-01T11:00:00Z'),
    status: 'confirmed',
    notes: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    deletedAt: null,
  },
}));

vi.mock('@propertypro/db', () => ({
  amenities: {},
  amenityReservations: { id: 'id', communityId: 'communityId' },
  clampPageSize: (n: number) => n,
  complianceAuditLog: { __table: 'compliance_audit_log' },
  createScopedClient: vi.fn(),
  logAuditEvent: vi.fn(),
  paginate: vi.fn(),
  vendors: {},
  workOrders: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ _type: 'and', args }),
  asc: (col: unknown) => ({ _type: 'asc', col }),
  desc: (col: unknown) => ({ _type: 'desc', col }),
  eq: (col: unknown, val: unknown) => ({ _type: 'eq', col, val }),
  gt: (col: unknown, val: unknown) => ({ _type: 'gt', col, val }),
  inArray: (col: unknown, vals: unknown) => ({ _type: 'inArray', col, vals }),
  lt: (col: unknown, val: unknown) => ({ _type: 'lt', col, val }),
  or: (...args: unknown[]) => ({ _type: 'or', args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ _type: 'sql', strings, values }),
    { mapWith: () => ({}) },
  ),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({ where: () => ({ limit: async () => [existingRow] }) }),
        }),
        update: () => ({
          set: () => ({ where: () => ({ returning: txUpdateReturningMock }) }),
        }),
        insert: () => ({ values: txAuditValuesMock }),
      }),
  }),
}));

import { cancelReservationForCommunity } from '@/lib/services/work-orders-service';

function auditMetadata(): Record<string, unknown> {
  expect(txAuditValuesMock).toHaveBeenCalledTimes(1);
  const calls = txAuditValuesMock.mock.calls as unknown as [{ metadata: Record<string, unknown> }][];
  return calls[0]![0].metadata;
}

describe('cancelReservationForCommunity audit row — support-session attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txUpdateReturningMock.mockResolvedValue([{ ...existingRow, status: 'cancelled' }]);
  });

  it('merges metadata.support inside a support run, preserving the requestId', async () => {
    const { runWithAuditActor } = await import('@propertypro/db/audit-actor');

    const result = await runWithAuditActor(
      { support: { sessionId: 42, adminUserId: 'admin-uuid' } },
      () => cancelReservationForCommunity(42, 11, 'user-1', false, 'req-1'),
    );

    expect(result.status).toBe('cancelled');
    const metadata = auditMetadata();
    expect(metadata).toMatchObject({ requestId: 'req-1' });
    expect(metadata.support).toEqual({ sessionId: 42, adminUserId: 'admin-uuid' });
  });

  it('outside a support run the metadata carries no support key', async () => {
    await cancelReservationForCommunity(42, 11, 'user-1', false, 'req-1');

    const metadata = auditMetadata();
    expect(metadata).toEqual({ requestId: 'req-1' });
    expect(metadata).not.toHaveProperty('support');
  });
});
