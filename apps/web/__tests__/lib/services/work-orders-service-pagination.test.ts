import { describe, expect, it, vi } from 'vitest';

vi.mock('@propertypro/db', async () => {
  const rows = Array.from({ length: 45 }, (_, i) => ({
    id: i + 1,
    communityId: 42,
    title: `WO ${i + 1}`,
    description: null,
    unitId: null,
    vendorId: null,
    priority: 'medium',
    status: 'created',
    slaResponseHours: null,
    slaCompletionHours: null,
    assignedAt: null,
    startedAt: null,
    completedAt: null,
    closedAt: null,
    notes: null,
    createdAt: new Date(Date.now() - i * 1000),
    updatedAt: new Date(Date.now() - i * 1000),
    assignedByUserId: null,
    completedByUserId: null,
  }));

  return {
    createScopedClient: () => ({
      selectFrom: () => ({
        orderBy: () => ({
          limit: (n: number) => ({
            offset: (o: number) => Promise.resolve(rows.slice(o, o + n)),
          }),
        }),
      }),
      buildWhere: () => undefined,
    }),
    logAuditEvent: vi.fn(),
    workOrders: { id: 'id', status: 'status', unitId: 'unitId', createdAt: 'createdAt' },
    amenities: {},
    amenityReservations: {},
    complianceAuditLog: {},
    vendors: {},
  };
});

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ _type: 'and', args }),
  eq: () => ({ _type: 'eq' }),
  inArray: () => ({ _type: 'inArray' }),
  desc: (col: unknown) => ({ _type: 'desc', col }),
  asc: (col: unknown) => ({ _type: 'asc', col }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ _type: 'sql', strings, values }),
    { mapWith: () => ({}) },
  ),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: () => ({ from: () => ({ where: () => Promise.resolve([{ count: 45 }]) }) }),
  }),
}));

import { listWorkOrdersForCommunity } from '@/lib/services/work-orders-service';

describe('listWorkOrdersForCommunity — pagination', () => {
  it('returns { data, total } with default page=1, limit=20', async () => {
    const res = await listWorkOrdersForCommunity(42, {});
    expect(res.total).toBe(45);
    expect(res.data).toHaveLength(20);
    expect(res.data[0]!.id).toBe(1);
  });

  it('honors page=2 with limit=20', async () => {
    const res = await listWorkOrdersForCommunity(42, { page: 2, limit: 20 });
    expect(res.total).toBe(45);
    expect(res.data).toHaveLength(20);
    expect(res.data[0]!.id).toBe(21);
  });

  it('caps limit at 100', async () => {
    const res = await listWorkOrdersForCommunity(42, { page: 1, limit: 500 });
    expect(res.data.length).toBeLessThanOrEqual(100);
  });
});
