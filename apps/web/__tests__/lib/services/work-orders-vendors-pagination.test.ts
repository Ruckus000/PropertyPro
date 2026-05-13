import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  selectFromMock,
  orderByMock,
  limitMock,
  vendorsTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  selectFromMock: vi.fn(),
  orderByMock: vi.fn(),
  limitMock: vi.fn(),
  vendorsTable: {
    id: Symbol('vendors.id'),
    isActive: Symbol('vendors.is_active'),
    name: Symbol('vendors.name'),
  },
}));

vi.mock('@propertypro/db', () => ({
  amenities: {},
  amenityReservations: {},
  clampPageSize: (input: number | null | undefined) => {
    if (input === null || input === undefined) return 50;
    if (!Number.isFinite(input) || !Number.isInteger(input)) return 50;
    if (input < 1) return 1;
    if (input > 100) return 100;
    return input;
  },
  complianceAuditLog: {},
  createScopedClient: createScopedClientMock,
  logAuditEvent: vi.fn(),
  paginate: vi.fn(),
  vendors: vendorsTable,
  workOrders: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  asc: (col: unknown) => ({ __asc: col }),
  desc: (col: unknown) => ({ __desc: col }),
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
  gt: (col: unknown, val: unknown) => ({ __gt: { col, val } }),
  inArray: (col: unknown, vals: unknown[]) => ({ __inArray: { col, vals } }),
  lt: (col: unknown, val: unknown) => ({ __lt: { col, val } }),
  or: (...clauses: unknown[]) => ({ __or: clauses }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: { strings, values } }),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(),
}));

import { paginateVendorsForCommunity } from '../../../src/lib/services/work-orders-service';

function encodeCursor(payload: { isActive: boolean; name: string; id: number }) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function row(id: number, isActive: boolean, name: string) {
  return {
    id,
    communityId: 42,
    name,
    company: null,
    phone: null,
    email: null,
    specialties: ['plumbing'],
    isActive,
    createdAt: new Date('2026-05-01T12:00:00.000Z'),
    updatedAt: new Date('2026-05-01T12:00:00.000Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  orderByMock.mockReturnValue({ limit: limitMock });
  selectFromMock.mockReturnValue({ orderBy: orderByMock });
  createScopedClientMock.mockReturnValue({ selectFrom: selectFromMock });
});

describe('paginateVendorsForCommunity', () => {
  it('preserves active-first alphabetical order with id tiebreaker and emits an opaque cursor', async () => {
    limitMock.mockResolvedValueOnce([
      row(1, true, 'Acme Plumbing'),
      row(2, true, 'Bravo Electric'),
      row(3, false, 'Atlas Roofing'),
    ]);

    const result = await paginateVendorsForCommunity(42, { pageSize: 2 });

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(selectFromMock).toHaveBeenCalledWith(vendorsTable, {}, undefined);
    expect(orderByMock).toHaveBeenCalledWith(
      { __desc: vendorsTable.isActive },
      { __asc: vendorsTable.name },
      { __asc: vendorsTable.id },
    );
    expect(limitMock).toHaveBeenCalledWith(3);
    expect(result.data.map((vendor) => vendor.id)).toEqual([1, 2]);
    expect(result.pagination.hasMore).toBe(true);

    const decoded = JSON.parse(
      Buffer.from(result.pagination.nextCursor!, 'base64url').toString('utf8'),
    );
    expect(decoded).toEqual({ isActive: true, name: 'Bravo Electric', id: 2 });
  });

  it('uses a lexicographic cursor predicate that exactly matches the order keys', async () => {
    limitMock.mockResolvedValueOnce([row(8, true, 'Bravo Electric')]);

    await paginateVendorsForCommunity(42, {
      cursor: encodeCursor({ isActive: true, name: 'Bravo Electric', id: 7 }),
      pageSize: 10,
    });

    expect(selectFromMock.mock.calls[0]![2]).toEqual({
      __or: [
        { __lt: { col: vendorsTable.isActive, val: true } },
        {
          __and: [
            { __eq: { col: vendorsTable.isActive, val: true } },
            {
              __or: [
                { __gt: { col: vendorsTable.name, val: 'Bravo Electric' } },
                {
                  __and: [
                    { __eq: { col: vendorsTable.name, val: 'Bravo Electric' } },
                    { __gt: { col: vendorsTable.id, val: 7 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('treats malformed cursors as first page and clamps page size', async () => {
    limitMock.mockResolvedValueOnce([row(1, true, 'Acme Plumbing')]);

    const result = await paginateVendorsForCommunity(42, {
      cursor: 'not-json',
      pageSize: 500,
    });

    expect(selectFromMock).toHaveBeenCalledWith(vendorsTable, {}, undefined);
    expect(limitMock).toHaveBeenCalledWith(101);
    expect(result.pagination).toEqual({
      nextCursor: null,
      hasMore: false,
      pageSize: 100,
    });
  });
});
