import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  selectFromMock,
  orderByMock,
  limitMock,
  amenitiesTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  selectFromMock: vi.fn(),
  orderByMock: vi.fn(),
  limitMock: vi.fn(),
  amenitiesTable: {
    id: Symbol('amenities.id'),
    name: Symbol('amenities.name'),
  },
}));

vi.mock('@propertypro/db', () => ({
  amenities: amenitiesTable,
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
  vendors: {},
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

import { paginateAmenitiesForCommunity } from '../../../src/lib/services/work-orders-service';

function encodeCursor(payload: { name: string; id: number }) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function row(id: number, name: string) {
  return {
    id,
    communityId: 42,
    name,
    description: null,
    location: null,
    capacity: null,
    isBookable: true,
    bookingRules: null,
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

describe('paginateAmenitiesForCommunity', () => {
  it('preserves alphabetical order with id tiebreaker and emits an opaque cursor', async () => {
    limitMock.mockResolvedValueOnce([
      row(1, 'Clubhouse'),
      row(2, 'Pool'),
      row(3, 'Tennis Court'),
    ]);

    const result = await paginateAmenitiesForCommunity(42, { pageSize: 2 });

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(selectFromMock).toHaveBeenCalledWith(amenitiesTable, {}, undefined);
    expect(orderByMock).toHaveBeenCalledWith(
      { __asc: amenitiesTable.name },
      { __asc: amenitiesTable.id },
    );
    expect(limitMock).toHaveBeenCalledWith(3);
    expect(result.data.map((amenity) => amenity.id)).toEqual([1, 2]);
    expect(result.data[0]!.bookingRules).toEqual({});
    expect(result.pagination.hasMore).toBe(true);

    const decoded = JSON.parse(
      Buffer.from(result.pagination.nextCursor!, 'base64url').toString('utf8'),
    );
    expect(decoded).toEqual({ name: 'Pool', id: 2 });
  });

  it('uses a lexicographic cursor predicate that exactly matches the order keys', async () => {
    limitMock.mockResolvedValueOnce([row(8, 'Pool')]);

    await paginateAmenitiesForCommunity(42, {
      cursor: encodeCursor({ name: 'Pool', id: 7 }),
      pageSize: 10,
    });

    expect(selectFromMock.mock.calls[0]![2]).toEqual({
      __or: [
        { __gt: { col: amenitiesTable.name, val: 'Pool' } },
        {
          __and: [
            { __eq: { col: amenitiesTable.name, val: 'Pool' } },
            { __gt: { col: amenitiesTable.id, val: 7 } },
          ],
        },
      ],
    });
  });

  it('treats malformed cursors as first page and clamps page size', async () => {
    limitMock.mockResolvedValueOnce([row(1, 'Clubhouse')]);

    const result = await paginateAmenitiesForCommunity(42, {
      cursor: 'not-json',
      pageSize: 500,
    });

    expect(selectFromMock).toHaveBeenCalledWith(amenitiesTable, {}, undefined);
    expect(limitMock).toHaveBeenCalledWith(101);
    expect(result.pagination).toEqual({
      nextCursor: null,
      hasMore: false,
      pageSize: 100,
    });
  });
});
