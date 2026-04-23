import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock @propertypro/db with a fixture-injection escape hatch so individual
// tests can set up per-call row data without rewriting the whole mock.
// Each table object carries a _tableName so the stub can look up fixtures.
vi.mock('@propertypro/db', () => {
  const tableFixtures = new Map<string, Array<Record<string, unknown>>>();

  // Returns a thenable builder that resolves to the fixture rows for `tableName`.
  // Supports the full chain the service uses: .orderBy(...).limit(n) or just .orderBy(...)
  const stubBuilder = (rows: Array<Record<string, unknown>>) => {
    const builder: Record<string, unknown> = {};
    const resolved = Promise.resolve(rows);
    // Make the builder itself awaitable
    builder['then'] = resolved.then.bind(resolved);
    builder['catch'] = resolved.catch.bind(resolved);
    builder['finally'] = resolved.finally.bind(resolved);
    builder[Symbol.toStringTag] = 'ScopedDynamicBuilder';
    // Each chained method returns the same builder (still awaitable with same data)
    builder['orderBy'] = (..._args: unknown[]) => stubBuilder(rows);
    builder['limit'] = (_n: unknown) => stubBuilder(rows);
    builder['offset'] = (_n: unknown) => stubBuilder(rows);
    builder['groupBy'] = (..._args: unknown[]) => stubBuilder(rows);
    builder['for'] = (..._args: unknown[]) => stubBuilder(rows);
    return builder;
  };

  return {
    createScopedClient: (_communityId: number) => ({
      selectFrom: (table: { _tableName?: string }) => {
        const name = table?._tableName ?? 'unknown';
        const rows = tableFixtures.get(name) ?? [];
        return stubBuilder(rows);
      },
    }),

    // Escape hatch for per-test fixture injection
    __setTableFixture: (name: string, rows: Array<Record<string, unknown>>) => {
      tableFixtures.set(name, rows);
    },
    __clearFixtures: () => {
      tableFixtures.clear();
    },

    maintenanceRequests: {
      _tableName: 'maintenance_requests',
      id: 'id',
      title: 'title',
      status: 'status',
      priority: 'priority',
      unitId: 'unitId',
      createdAt: 'createdAt',
    },
    workOrders: {
      _tableName: 'work_orders',
      id: 'id',
      title: 'title',
      status: 'status',
      priority: 'priority',
      unitId: 'unitId',
      createdAt: 'createdAt',
    },
    amenityReservations: {
      _tableName: 'amenity_reservations',
      id: 'id',
      amenityId: 'amenityId',
      status: 'status',
      unitId: 'unitId',
      createdAt: 'createdAt',
      startTime: 'startTime',
    },
    amenities: {
      _tableName: 'amenities',
      id: 'id',
      name: 'name',
    },
  };
});

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((_col: unknown, _val: unknown) => ({ _type: 'eq', _col, _val })),
  and: vi.fn((...args: unknown[]) => ({ _type: 'and', args })),
  or: vi.fn((...args: unknown[]) => ({ _type: 'or', args })),
  lt: vi.fn((_col: unknown, _val: unknown) => ({ _type: 'lt', _col, _val })),
  lte: vi.fn((_col: unknown, _val: unknown) => ({ _type: 'lte', _col, _val })),
  desc: vi.fn((_col: unknown) => ({ _type: 'desc', _col })),
}));

import {
  encodeOperationsCursorForTests,
  decodeOperationsCursorForTests,
} from '@/lib/services/operations-service';

describe('operations-service cursor compat', () => {
  it('decodes a legacy Phase 1 cursor (maintenance_request) via the guard', () => {
    const cursor = encodeOperationsCursorForTests({
      createdAt: '2026-04-01T12:00:00.000Z',
      id: 42,
      type: 'maintenance_request',
    });
    const payload = decodeOperationsCursorForTests(cursor);
    expect(payload.type).toBe('maintenance_request');
    expect(payload.id).toBe(42);
    expect(payload.createdAt).toBe('2026-04-01T12:00:00.000Z');
  });

  it('decodes a legacy Phase 1 cursor (work_order) via the guard', () => {
    const cursor = encodeOperationsCursorForTests({
      createdAt: '2026-04-01T12:00:00.000Z',
      id: 77,
      type: 'work_order',
    });
    const payload = decodeOperationsCursorForTests(cursor);
    expect(payload.type).toBe('work_order');
  });

  it('round-trips the new reservation cursor type via the guard', () => {
    const cursor = encodeOperationsCursorForTests({
      createdAt: '2026-04-01T12:00:00.000Z',
      id: 9,
      type: 'reservation',
    });
    const payload = decodeOperationsCursorForTests(cursor);
    expect(payload.type).toBe('reservation');
    expect(payload.id).toBe(9);
  });

  it('rejects cursors with an unknown type', () => {
    // Hand-craft a cursor with an invalid type — the decode guard must throw.
    const malformed = Buffer.from(
      JSON.stringify({ createdAt: '2026-04-01T12:00:00.000Z', id: 1, type: 'unknown_type' }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeOperationsCursorForTests(malformed)).toThrow();
  });
});

describe('listOperationsForCommunity — reservations merge', () => {
  beforeEach(async () => {
    const db = await import('@propertypro/db') as unknown as {
      __clearFixtures: () => void;
    };
    db.__clearFixtures();
  });

  it('includes reservations in the merged feed with "Reservation — <amenity>" title', async () => {
    const db = await import('@propertypro/db') as unknown as {
      __setTableFixture: (name: string, rows: Array<Record<string, unknown>>) => void;
    };

    db.__setTableFixture('maintenance_requests', []);
    db.__setTableFixture('work_orders', []);
    db.__setTableFixture('amenity_reservations', [
      {
        id: 9,
        status: 'confirmed',
        unitId: 3,
        amenityId: 1,
        createdAt: new Date('2026-04-10T12:00:00Z'),
        startTime: new Date('2026-04-11T12:00:00Z'),
      },
    ]);
    db.__setTableFixture('amenities', [{ id: 1, name: 'Pool' }]);

    const { listOperationsForCommunity } = await import('@/lib/services/operations-service');
    const res = await listOperationsForCommunity(42);

    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      id: 9,
      type: 'reservation',
      title: 'Reservation — Pool',
      status: 'confirmed',
      priority: 'normal',
    });
  });

  it('uses fallback title "Reservation" when amenity is not found', async () => {
    const db = await import('@propertypro/db') as unknown as {
      __setTableFixture: (name: string, rows: Array<Record<string, unknown>>) => void;
    };

    db.__setTableFixture('maintenance_requests', []);
    db.__setTableFixture('work_orders', []);
    db.__setTableFixture('amenity_reservations', [
      {
        id: 11,
        status: 'cancelled',
        unitId: 5,
        amenityId: 99, // not present in amenities fixture
        createdAt: new Date('2026-04-09T10:00:00Z'),
        startTime: new Date('2026-04-10T10:00:00Z'),
      },
    ]);
    db.__setTableFixture('amenities', []); // no matching amenity

    const { listOperationsForCommunity } = await import('@/lib/services/operations-service');
    const res = await listOperationsForCommunity(42);

    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      id: 11,
      type: 'reservation',
      title: 'Reservation',
      status: 'cancelled',
      priority: 'normal',
    });
  });

  it('merges maintenance requests, work orders, and reservations sorted by createdAt DESC', async () => {
    const db = await import('@propertypro/db') as unknown as {
      __setTableFixture: (name: string, rows: Array<Record<string, unknown>>) => void;
    };

    db.__setTableFixture('maintenance_requests', [
      {
        id: 1,
        title: 'Leaky faucet',
        status: 'open',
        priority: 'high',
        unitId: 1,
        createdAt: new Date('2026-04-08T08:00:00Z'),
      },
    ]);
    db.__setTableFixture('work_orders', [
      {
        id: 2,
        title: 'Paint hallway',
        status: 'in_progress',
        priority: 'low',
        unitId: null,
        createdAt: new Date('2026-04-07T08:00:00Z'),
      },
    ]);
    db.__setTableFixture('amenity_reservations', [
      {
        id: 9,
        status: 'confirmed',
        unitId: 3,
        amenityId: 1,
        createdAt: new Date('2026-04-10T12:00:00Z'),
        startTime: new Date('2026-04-11T12:00:00Z'),
      },
    ]);
    db.__setTableFixture('amenities', [{ id: 1, name: 'Pool' }]);

    const { listOperationsForCommunity } = await import('@/lib/services/operations-service');
    const res = await listOperationsForCommunity(42);

    expect(res.data).toHaveLength(3);
    // Reservation is most recent, should be first
    expect(res.data[0]!.type).toBe('reservation');
    expect(res.data[0]!.title).toBe('Reservation — Pool');
    expect(res.data[1]!.type).toBe('maintenance_request');
    expect(res.data[2]!.type).toBe('work_order');
  });
});
