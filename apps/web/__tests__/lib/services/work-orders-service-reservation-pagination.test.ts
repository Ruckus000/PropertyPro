import { describe, expect, it, vi } from 'vitest';

vi.mock('@propertypro/db', async () => {
  const rRows = Array.from({ length: 33 }, (_, i) => ({
    id: i + 1,
    communityId: 42,
    amenityId: 1,
    userId: 'u-1',
    unitId: null,
    startTime: new Date(),
    endTime: new Date(),
    status: 'confirmed' as const,
    notes: null,
    createdAt: new Date(Date.now() - i * 1000),
    updatedAt: new Date(),
    deletedAt: null,
  }));

  return {
    createScopedClient: () => ({
      selectFrom: () => ({
        orderBy: () => ({
          limit: (n: number) => ({
            offset: (o: number) => Promise.resolve(rRows.slice(o, o + n)),
          }),
        }),
      }),
      buildWhere: () => undefined,
    }),
    logAuditEvent: vi.fn(),
    amenityReservations: { id: 'id', status: 'status', unitId: 'unitId', startTime: 'startTime', createdAt: 'createdAt' },
    workOrders: {},
    amenities: {},
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
    select: () => ({ from: () => ({ where: () => Promise.resolve([{ count: 33 }]) }) }),
  }),
}));

import { listReservationsForCommunity } from '@/lib/services/work-orders-service';

describe('listReservationsForCommunity — pagination', () => {
  it('returns { data, total } with default page=1, limit=20', async () => {
    const res = await listReservationsForCommunity(42, {});
    expect(res.total).toBe(33);
    expect(res.data).toHaveLength(20);
  });

  it('honors page=2 with limit=20', async () => {
    const res = await listReservationsForCommunity(42, { page: 2, limit: 20 });
    expect(res.total).toBe(33);
    expect(res.data).toHaveLength(13);
  });
});
