import { describe, it, expect, vi } from 'vitest';
import {
  clampPageSize,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  encodeCursor,
  MAX_PAGE_SIZE,
  paginate,
} from '../src/pagination';
import type { ScopedClient, ScopedRow } from '../src/types/scoped-client';

// ---------------------------------------------------------------------------
// Pure logic — clampPageSize
// ---------------------------------------------------------------------------

describe('clampPageSize', () => {
  it('returns the default when input is null or undefined', () => {
    expect(clampPageSize(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('returns the default for non-finite or non-integer inputs', () => {
    expect(clampPageSize(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(3.7)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('passes through values inside the allowed range', () => {
    expect(clampPageSize(1)).toBe(1);
    expect(clampPageSize(25)).toBe(25);
    expect(clampPageSize(MAX_PAGE_SIZE)).toBe(MAX_PAGE_SIZE);
  });

  it('clamps below 1 up to 1', () => {
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(-5)).toBe(1);
  });

  it('clamps above MAX_PAGE_SIZE down to MAX_PAGE_SIZE', () => {
    expect(clampPageSize(MAX_PAGE_SIZE + 1)).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize(10_000)).toBe(MAX_PAGE_SIZE);
  });
});

// ---------------------------------------------------------------------------
// Pure logic — encodeCursor / decodeCursor
// ---------------------------------------------------------------------------

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a numeric id', () => {
    const cursor = encodeCursor(12345);
    expect(decodeCursor(cursor)).toEqual({ id: 12345 });
  });

  it('round-trips id=0 and id=1 (edge cases near the lower bound)', () => {
    expect(decodeCursor(encodeCursor(0))).toEqual({ id: 0 });
    expect(decodeCursor(encodeCursor(1))).toEqual({ id: 1 });
  });

  it('round-trips large ids (bigint-mode-number range)', () => {
    const big = Number.MAX_SAFE_INTEGER - 1;
    expect(decodeCursor(encodeCursor(big))).toEqual({ id: big });
  });

  it('returns null for null/undefined/empty cursors (treat as first page)', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  it('returns null (not throws) for malformed cursors', () => {
    // Garbage base64 → JSON parse fails internally and is swallowed.
    expect(decodeCursor('not-base64-!!!')).toBeNull();
    // Valid base64 but not JSON.
    expect(decodeCursor(Buffer.from('not json', 'utf8').toString('base64url'))).toBeNull();
    // Valid JSON but wrong shape.
    expect(decodeCursor(Buffer.from('{"foo":1}', 'utf8').toString('base64url'))).toBeNull();
    // id is not a number.
    expect(
      decodeCursor(Buffer.from('{"id":"abc"}', 'utf8').toString('base64url')),
    ).toBeNull();
    // id is a non-finite number.
    expect(
      decodeCursor(Buffer.from('{"id":null}', 'utf8').toString('base64url')),
    ).toBeNull();
    // id is a non-integer number.
    expect(
      decodeCursor(Buffer.from('{"id":3.14}', 'utf8').toString('base64url')),
    ).toBeNull();
  });

  it('produces base64url-safe strings (no +/= chars that need URL encoding)', () => {
    // Try a wide spread of ids; none should produce URL-unsafe characters.
    for (const id of [0, 1, 42, 1000, 999999, Number.MAX_SAFE_INTEGER]) {
      const cursor = encodeCursor(id);
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

// ---------------------------------------------------------------------------
// paginate() — behavior with a fake ScopedClient
// ---------------------------------------------------------------------------

/**
 * Stand-in for a Drizzle PgTable that getTableColumns() can introspect.
 * Drizzle's `getTableColumns` reads internal symbols; we replicate just
 * enough to make it return `{ id }`.
 */
function fakeTable(name: string): unknown {
  // The actual structure used by drizzle-orm is internal; for unit tests we
  // mock getTableColumns directly via vi.mock below.
  return { __name: name };
}

// Mock drizzle-orm only inside this describe block, scoped tightly so other
// tests in this file (above) keep using the real Buffer-only logic.
vi.mock('drizzle-orm', async () => {
  // Provide just the surface paginate() touches. Order/predicate helpers can
  // return marker values — the fake selectFrom below ignores them.
  const idColumn = { __column: 'id' };
  return {
    getTableColumns: () => ({ id: idColumn }),
    getTableName: (t: { __name?: string }) => t?.__name ?? 'unknown',
    asc: () => ({ __sort: 'asc' }),
    desc: () => ({ __sort: 'desc' }),
    lt: (col: unknown, val: number) => ({ __op: 'lt', col, val }),
    gt: (col: unknown, val: number) => ({ __op: 'gt', col, val }),
    and: (...preds: unknown[]) => ({ __op: 'and', preds }),
  };
});

interface CapturedQuery {
  where: unknown;
  order: unknown;
  limit: number;
}

function makeMockScopedClient(rowsToReturn: ScopedRow[]): {
  client: ScopedClient;
  captured: CapturedQuery;
} {
  const captured: CapturedQuery = { where: undefined, order: undefined, limit: 0 };

  const builder = {
    groupBy: () => builder,
    orderBy: (...cols: unknown[]) => {
      captured.order = cols[0];
      return builder;
    },
    limit: (n: number) => {
      captured.limit = n;
      return builder;
    },
    offset: () => builder,
    for: () => builder,
    then: <R,>(onFulfilled?: ((value: ScopedRow[]) => R) | null) =>
      Promise.resolve(rowsToReturn).then(onFulfilled ?? ((v) => v as unknown as R)),
    [Symbol.toStringTag]: 'MockScopedDynamicBuilder',
  };

  const client = {
    communityId: 1,
    selectFrom: (_table: unknown, _columns: unknown, where?: unknown) => {
      captured.where = where;
      return builder;
    },
  } as unknown as ScopedClient;

  return { client, captured };
}

describe('paginate', () => {
  it('returns first page with no cursor when the table fits in one page', async () => {
    const rows: ScopedRow[] = [{ id: 3 }, { id: 2 }, { id: 1 }];
    const { client, captured } = makeMockScopedClient(rows);

    const result = await paginate(client, fakeTable('items') as never, { pageSize: 10 });

    expect(result.data).toEqual(rows);
    expect(result.pagination).toEqual({
      nextCursor: null,
      hasMore: false,
      pageSize: 10,
    });
    // pageSize + 1 look-ahead.
    expect(captured.limit).toBe(11);
    // No cursor on first page → no cursor predicate.
    expect(captured.where).toBeUndefined();
  });

  it('returns nextCursor when more rows are available (look-ahead row dropped)', async () => {
    // 6 rows returned, pageSize=5 → 1 look-ahead, hasMore=true,
    // cursor points at the LAST row in `data` (id 11), not the look-ahead (id 10).
    const rows: ScopedRow[] = [
      { id: 15 },
      { id: 14 },
      { id: 13 },
      { id: 12 },
      { id: 11 },
      { id: 10 }, // look-ahead row
    ];
    const { client } = makeMockScopedClient(rows);

    const result = await paginate(client, fakeTable('items') as never, { pageSize: 5 });

    expect(result.data).toHaveLength(5);
    expect(result.data.map((r) => r['id'])).toEqual([15, 14, 13, 12, 11]);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).not.toBeNull();
    expect(decodeCursor(result.pagination.nextCursor)).toEqual({ id: 11 });
    expect(result.pagination.pageSize).toBe(5);
  });

  it('decodes the input cursor and applies a keyset predicate (desc → lt)', async () => {
    const cursor = encodeCursor(100);
    const { client, captured } = makeMockScopedClient([{ id: 99 }]);

    await paginate(client, fakeTable('items') as never, { cursor, pageSize: 5 });

    // Default direction is desc, so the predicate is lt(id, 100).
    expect(captured.where).toMatchObject({ __op: 'lt', val: 100 });
  });

  it('uses gt() when direction is asc', async () => {
    const cursor = encodeCursor(7);
    const { client, captured } = makeMockScopedClient([{ id: 8 }]);

    await paginate(
      client,
      fakeTable('items') as never,
      { cursor, pageSize: 5 },
      { direction: 'asc' },
    );

    expect(captured.where).toMatchObject({ __op: 'gt', val: 7 });
  });

  it('AND-combines the cursor predicate with caller-supplied where', async () => {
    const cursor = encodeCursor(50);
    const callerWhere = { __op: 'eq', col: 'kind', val: 'public' };
    const { client, captured } = makeMockScopedClient([{ id: 49 }]);

    await paginate(
      client,
      fakeTable('items') as never,
      { cursor, pageSize: 5 },
      { where: callerWhere as never },
    );

    expect(captured.where).toMatchObject({
      __op: 'and',
      preds: [
        { __op: 'lt', val: 50 },
        callerWhere,
      ],
    });
  });

  it('passes through a caller where alone when there is no cursor', async () => {
    const callerWhere = { __op: 'eq', col: 'kind', val: 'public' };
    const { client, captured } = makeMockScopedClient([{ id: 1 }]);

    await paginate(
      client,
      fakeTable('items') as never,
      { pageSize: 5 },
      { where: callerWhere as never },
    );

    expect(captured.where).toBe(callerWhere);
  });

  it('clamps absurd pageSize values', async () => {
    const { client, captured } = makeMockScopedClient([]);

    const result = await paginate(client, fakeTable('items') as never, {
      pageSize: 99999,
    });

    expect(result.pagination.pageSize).toBe(MAX_PAGE_SIZE);
    // limit is pageSize+1 look-ahead, so MAX_PAGE_SIZE + 1.
    expect(captured.limit).toBe(MAX_PAGE_SIZE + 1);
  });

  it('treats a malformed cursor as "first page" instead of throwing', async () => {
    const { client, captured } = makeMockScopedClient([{ id: 1 }]);

    const result = await paginate(client, fakeTable('items') as never, {
      cursor: 'not-a-real-cursor!!',
      pageSize: 5,
    });

    expect(result.data).toEqual([{ id: 1 }]);
    expect(captured.where).toBeUndefined();
  });
});
