/**
 * postgres.js pipelining is off, and transactions still work with it off.
 *
 * Why both halves are pinned (full story on UNTYPED_DRIVER_OPTIONS in
 * src/drizzle.ts):
 * - In production on 2026-09-14, a query pipelined onto a busy connection
 *   stalled forever behind Supavisor's transaction mode, and a dashboard hit
 *   the 300s platform timeout. The fix is `max_pipeline: 0`.
 * - Upstream postgres.js 3.4.8/3.4.9 throws UNSAFE_TRANSACTION from every
 *   `sql.begin` at `max_pipeline: 0`. patches/postgres@3.4.8.patch fixes that.
 *   A version bump that drops the patch must fail here, not in production.
 *
 * The stacking assertion has a control. Without `max_pipeline: 0`, the same
 * three queries are written together, which proves the measurement can see
 * pipelining rather than passing vacuously.
 */
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { sql as drizzleSql } from 'drizzle-orm';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

type Client = ReturnType<typeof postgres>;
const clients: Client[] = [];

// `max_pipeline` is read by the runtime but missing from the type definitions.
function connect(options: Record<string, unknown>): Client {
  const client = postgres(url as string, { prepare: false, ...options } as Parameters<typeof postgres>[1]);
  clients.push(client);
  return client;
}

/** Matches the literal `pg_sleep(0.3)` below. */
const SLEEP_MS = 300;

/**
 * Gaps, in ms, between successive socket writes of three concurrent
 * `pg_sleep(SLEEP_MS)` queries on one connection.
 *
 * A pipelined write happens within the same run of microtasks as the one
 * before it, so its gap is ~0. An unpipelined write cannot happen until the
 * server has finished the previous sleep, so its gap is >= SLEEP_MS. The
 * assertions split at SLEEP_MS / 2, leaving a ~150ms margin on both sides,
 * because loose millisecond thresholds are how #1131 went red.
 *
 * Event ORDER cannot tell 0 from 1: postgres.js dispatches the next queued
 * query synchronously in the same ReadyForQuery handler that resolves the
 * previous one, so both orders read write1, write2, done1, ...
 */
async function writeGaps(maxPipeline: number | undefined): Promise<number[]> {
  const writes: number[] = [];
  const sql = connect({
    max: 1,
    ...(maxPipeline === undefined ? {} : { max_pipeline: maxPipeline }),
    debug: (_connection: number, query: string) => {
      if (query.includes('pg_sleep')) writes.push(performance.now());
    },
  });
  await sql`select 1`;
  // A literal, not a parameter. A parameter of unknown type makes postgres.js
  // describe the query first, and describe-first queries are never pipelined,
  // which would turn the controls green-to-red for a reason unrelated to
  // max_pipeline.
  await Promise.all([1, 2, 3].map(() => sql`select pg_sleep(0.3)`));
  expect(writes).toHaveLength(3);
  return [writes[1]! - writes[0]!, writes[2]! - writes[1]!];
}

const stacked = (gap: number) => gap < SLEEP_MS / 2;

describeDb('postgres.js pipelining and transactions (DB integration)', () => {
  afterAll(async () => {
    await Promise.all(clients.map((client) => client.end({ timeout: 5 })));
    // The last test builds the app's shared client; close it too.
    const { closeDb } = await import('../src/drizzle');
    await closeDb();
  });

  it('control: by default, both later queries are pipelined', async () => {
    expect((await writeGaps(undefined)).map(stacked)).toEqual([true, true]);
  });

  it('control: max_pipeline 1 still pipelines one query behind the running one', async () => {
    expect((await writeGaps(1)).map(stacked)).toEqual([true, false]);
  });

  it('max_pipeline 0 writes each query only after the previous one returns', async () => {
    expect((await writeGaps(0)).map(stacked)).toEqual([false, false]);
  });

  it('max_pipeline 0 keeps concurrent transactions, savepoints and rollback working', async () => {
    const sql = connect({ max: 3, max_pipeline: 0 });

    const outside = Array.from({ length: 8 }, (_, i) => sql`select ${i}::int as i`);
    const committed = Array.from({ length: 3 }, (_, t) =>
      sql.begin(async (tx) => {
        const inner = await Promise.all(
          [1, 2, 3].map((n) => tx`select ${t * 10 + n}::int as v`),
        );
        const nested = await tx.savepoint((sp) => sp`select 7::int as n`);
        return [inner.map((rows) => rows[0]!.v as number), nested[0]!.n as number];
      }),
    );
    const rolledBack = sql
      .begin(async (tx) => {
        await tx`select 1`;
        throw new Error('rollback requested');
      })
      .then(
        () => 'committed',
        (error: Error) => error.message,
      );

    const [outsideRows, results, rollback] = await Promise.all([
      Promise.all(outside),
      Promise.all(committed),
      rolledBack,
    ]);

    expect(outsideRows.map((rows) => rows[0]!.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(results).toEqual([
      [[1, 2, 3], 7],
      [[11, 12, 13], 7],
      [[21, 22, 23], 7],
    ]);
    expect(rollback).toBe('rollback requested');
  });

  it("the app's shared client pins the Supavisor-safe pool settings and runs transactions", async () => {
    const { db } = await import('../src/drizzle');
    const client = (db as unknown as { $client: Client }).$client;
    expect(
      client.options as unknown as {
        max: number;
        max_pipeline: number;
        idle_timeout: number;
        connect_timeout: number;
      },
    ).toMatchObject({
      max: 3,
      max_pipeline: 0,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    const results = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        db.transaction(async (tx) => {
          const rows = await tx.execute(drizzleSql`select ${n}::int as v`);
          return (rows as unknown as Array<{ v: number }>)[0]!.v;
        }),
      ),
    );
    expect(results).toEqual([1, 2, 3, 4]);
  });
});
