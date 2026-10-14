/**
 * The predicates behind retiring a demo (audit W-05). The DELETE route test
 * mocks these helpers, so the filters that keep the write narrow and the list
 * honest are pinned here, against a recorder of the PostgREST chain.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; args: unknown[] };
const calls: Call[] = [];

function chain(table: string, result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const op of ['select', 'update', 'eq', 'is', 'order', 'limit']) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => chain(table, { data: [], error: null }) }),
}));

const { listDemos, softDeleteDemo } = await import('@/lib/db/demo-queries');

const on = (table: string) => calls.filter((c) => c.table === table);

beforeEach(() => {
  calls.length = 0;
});

describe('softDeleteDemo', () => {
  it('soft-deletes the community only while it is still an undeleted demo', async () => {
    await softDeleteDemo(42, 99, '2026-10-14T00:00:00.000Z');

    expect(on('communities')).toEqual([
      { table: 'communities', op: 'update', args: [{ deleted_at: '2026-10-14T00:00:00.000Z' }] },
      { table: 'communities', op: 'eq', args: ['id', 99] },
      { table: 'communities', op: 'eq', args: ['is_demo', true] },
      { table: 'communities', op: 'is', args: ['deleted_at', null] },
    ]);
  });

  it('soft-deletes the demo row idempotently', async () => {
    await softDeleteDemo(42, 99, '2026-10-14T00:00:00.000Z');

    expect(on('demo_instances')).toEqual([
      { table: 'demo_instances', op: 'update', args: [{ deleted_at: '2026-10-14T00:00:00.000Z' }] },
      { table: 'demo_instances', op: 'eq', args: ['id', 42] },
      { table: 'demo_instances', op: 'is', args: ['deleted_at', null] },
    ]);
  });
});

describe('listDemos', () => {
  it('lists only live demos, so a retired one leaves the list and the stale banner', async () => {
    await listDemos();
    expect(on('demo_instances')).toContainEqual({
      table: 'demo_instances',
      op: 'is',
      args: ['deleted_at', null],
    });
  });
});
