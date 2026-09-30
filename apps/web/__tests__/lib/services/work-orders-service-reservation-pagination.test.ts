import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captured } = vi.hoisted(() => ({
  captured: {
    where: [] as unknown[],
    orderBy: [] as unknown[][],
    limit: [] as number[],
    offset: [] as number[],
    countWhere: [] as unknown[],
  },
}));

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
      selectFrom: (_table: unknown, _cols: unknown, where: unknown) => {
        captured.where.push(where);
        return {
          orderBy: (...keys: unknown[]) => {
            captured.orderBy.push(keys);
            return {
              limit: (n: number) => {
                captured.limit.push(n);
                return {
                  offset: (o: number) => {
                    captured.offset.push(o);
                    return Promise.resolve(rRows.slice(o, o + n));
                  },
                };
              },
            };
          },
        };
      },
      buildWhere: (_table: unknown, where: unknown) => ({ _type: 'scopedWhere', where }),
    }),
    logAuditEvent: vi.fn(),
    amenityReservations: {
      id: 'id',
      status: 'status',
      unitId: 'unitId',
      userId: 'userId',
      startTime: 'startTime',
      createdAt: 'createdAt',
    },
    workOrders: {},
    amenities: {},
    complianceAuditLog: {},
    vendors: {},
  };
});

vi.mock('@propertypro/db/filters', () => ({
  and: (...args: unknown[]) => ({ _type: 'and', args }),
  eq: (col: unknown, val: unknown) => ({ _type: 'eq', col, val }),
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
    select: () => ({
      from: () => ({
        where: (w: unknown) => {
          captured.countWhere.push(w);
          return Promise.resolve([{ count: 33 }]);
        },
      }),
    }),
  }),
}));

import { listReservationsForCommunity } from '@/lib/services/work-orders-service';

describe('listReservationsForCommunity — pagination', () => {
  beforeEach(() => {
    for (const list of Object.values(captured)) list.length = 0;
  });

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

  it('orders by startTime desc with id desc as the deterministic tiebreaker', async () => {
    await listReservationsForCommunity(42, { page: 3, limit: 5 });
    expect(captured.orderBy).toEqual([
      [
        { _type: 'desc', col: 'startTime' },
        { _type: 'desc', col: 'id' },
      ],
    ]);
    expect(captured.limit).toEqual([5]);
    expect(captured.offset).toEqual([10]);
  });

  it('pushes the resident userId filter into BOTH the page read and the count (PAG-03)', async () => {
    const res = await listReservationsForCommunity(42, {
      page: 2,
      limit: 10,
      userId: 'user-resident-1',
    });

    const userPredicate = { _type: 'eq', col: 'userId', val: 'user-resident-1' };
    expect(captured.where).toEqual([{ _type: 'and', args: [userPredicate] }]);
    expect(captured.countWhere).toEqual([
      { _type: 'scopedWhere', where: { _type: 'and', args: [userPredicate] } },
    ]);
    expect(captured.limit).toEqual([10]);
    expect(captured.offset).toEqual([10]);
    expect(res.total).toBe(33);
    expect(res.data.map((r) => r.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it('applies no user predicate on the admin (unfiltered) path', async () => {
    await listReservationsForCommunity(42, { page: 1, limit: 20 });
    expect(captured.where).toEqual([undefined]);
  });
});
