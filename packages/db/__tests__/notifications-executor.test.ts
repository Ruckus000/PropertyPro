/**
 * Unit tests for the new {@link insertNotifications} executor parameter (Plan C3).
 *
 * The point of accepting an executor is to allow callers inside a
 * `db.transaction(async (tx) => …)` callback to pass `tx` so the notification
 * INSERT runs in the same SQL transaction as the surrounding state change.
 * Pre-C3 the function always used the package-level `db`, which meant
 * notification failures silently dropped while the parent action committed.
 *
 * These tests don't need a real database — they prove the routing logic.
 */
import { describe, expect, it, vi } from 'vitest';

// Mock the package-level `db` BEFORE importing the module under test so that
// the import binding picks up the mock. We track each call to `db.insert(...)`
// to prove that, when a custom executor is supplied, the package-level `db`
// is NOT touched.
const dbInsertSpy = vi.fn();

vi.mock('../src/drizzle', () => {
  const builder = {
    values: () => builder,
    onConflictDoNothing: () => builder,
    returning: async () => [{ id: 1 }],
  };
  return {
    db: {
      insert: (...args: unknown[]) => {
        dbInsertSpy(...args);
        return builder;
      },
    },
  };
});

// Import AFTER the mock is registered.
const { insertNotifications } = await import('../src/queries/notifications');

function makeExecutor(insertFn: (table: unknown) => unknown) {
  return { insert: insertFn } as unknown as Parameters<typeof insertNotifications>[1];
}

describe('insertNotifications — executor parameter (C3)', () => {
  it('returns { created: 0 } and performs no inserts when rows is empty', async () => {
    dbInsertSpy.mockClear();
    const executorSpy = vi.fn();
    const result = await insertNotifications([], makeExecutor(executorSpy));
    expect(result).toEqual({ created: 0 });
    expect(executorSpy).not.toHaveBeenCalled();
    expect(dbInsertSpy).not.toHaveBeenCalled();
  });

  it('uses the package-level db when no executor is passed', async () => {
    dbInsertSpy.mockClear();
    const result = await insertNotifications([
      {
        communityId: 1,
        userId: 'u1',
        category: 'system',
        title: 't',
        sourceType: 'join_request',
        sourceId: '1',
      },
    ]);
    expect(dbInsertSpy).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(1);
  });

  it('routes inserts through the supplied executor (e.g. a transaction handle)', async () => {
    dbInsertSpy.mockClear();
    const txInsertSpy = vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [{ id: 99 }],
        }),
      }),
    }));
    const tx = makeExecutor(txInsertSpy);

    const result = await insertNotifications(
      [
        {
          communityId: 1,
          userId: 'u1',
          category: 'system',
          title: 't',
          sourceType: 'join_request',
          sourceId: '1',
        },
      ],
      tx,
    );

    expect(txInsertSpy).toHaveBeenCalledTimes(1);
    expect(dbInsertSpy).not.toHaveBeenCalled(); // package db must NOT be used
    expect(result.created).toBe(1);
  });

  it('chunks large batches but stays on the supplied executor for every chunk', async () => {
    dbInsertSpy.mockClear();
    const txInsertSpy = vi.fn(() => ({
      values: (rows: unknown[]) => ({
        onConflictDoNothing: () => ({
          returning: async () =>
            // Return one id per inserted row to mimic real chunked output.
            (rows as unknown[]).map((_r, i) => ({ id: i + 1 })),
        }),
      }),
    }));
    const tx = makeExecutor(txInsertSpy);

    // 250 rows → INSERT_CHUNK_SIZE=100 means 3 chunks (100 + 100 + 50).
    const rows = Array.from({ length: 250 }, (_, i) => ({
      communityId: 1,
      userId: `u${i}`,
      category: 'system' as const,
      title: 't',
      sourceType: 'join_request',
      sourceId: String(i),
    }));

    const result = await insertNotifications(rows, tx);

    expect(txInsertSpy).toHaveBeenCalledTimes(3);
    expect(dbInsertSpy).not.toHaveBeenCalled();
    expect(result.created).toBe(250);
  });

  it('propagates the executor error (no silent swallow)', async () => {
    dbInsertSpy.mockClear();
    const txInsertSpy = vi.fn(() => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            throw new Error('simulated tx failure');
          },
        }),
      }),
    }));
    const tx = makeExecutor(txInsertSpy);

    await expect(
      insertNotifications(
        [
          {
            communityId: 1,
            userId: 'u1',
            category: 'system',
            title: 't',
            sourceType: 'join_request',
            sourceId: '1',
          },
        ],
        tx,
      ),
    ).rejects.toThrow('simulated tx failure');
  });
});
