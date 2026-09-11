import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

interface ListRow {
  id: number;
  published_at: string;
  change_count: number | null;
  change_labels: string[] | null;
  /** Present in the FIXTURE only — the list query must never select it. */
  snapshot?: unknown;
}

/**
 * Two-query stub.
 *
 * Call 1 is the list: `.select(cols).eq().is().order().limit()`. Call 2 is the
 * retention probe: `.select('id').in('id', ids).not('snapshot', 'is', null)`.
 * Both record the columns they were asked for and the filters they were given,
 * so the cases below can assert that the payload column never appears in a
 * projection — the whole point of the change — rather than only that
 * `restorable` still comes out right.
 */
function mockSnapshotsDb(rows: ListRow[]) {
  const listColumns: string[] = [];
  const probes: { columns: string; ids: unknown; notArgs: unknown[] }[] = [];

  const from = vi.fn(() => {
    let columns = '';
    const chain = {
      select: (cols: string) => {
        columns = cols;
        return chain;
      },
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => {
        listColumns.push(columns);
        return Promise.resolve({
          // Mirror PostgREST: only the projected columns come back.
          data: rows.map((row) => ({
            id: row.id,
            published_at: row.published_at,
            change_count: row.change_count,
            change_labels: row.change_labels,
            ...(columns.includes('snapshot') ? { snapshot: row.snapshot ?? null } : {}),
          })),
          error: null,
        });
      },
      in: (_col: string, ids: number[]) => {
        chain.inIds = ids;
        return chain;
      },
      not: (...args: unknown[]) => {
        probes.push({ columns, ids: chain.inIds, notArgs: args });
        return Promise.resolve({
          data: rows
            .filter((row) => (chain.inIds as number[]).includes(row.id) && (row.snapshot ?? null) !== null)
            .map((row) => ({ id: row.id })),
          error: null,
        });
      },
      inIds: undefined as unknown,
    };
    return chain;
  });

  createAdminClientMock.mockReturnValue({ from });
  return { from, listColumns, probes };
}

const WITH_PAYLOAD: ListRow = {
  id: 10,
  published_at: '2026-03-14T12:00:00.000Z',
  change_count: 3,
  change_labels: ['Hero updated'],
  snapshot: { version: 2, pages: [], blocks: [] },
};

const PRUNED: ListRow = {
  id: 9,
  published_at: '2026-01-01T00:00:00.000Z',
  change_count: 1,
  change_labels: null,
  snapshot: null,
};

describe('getCommunitySnapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps a NOT-NULL snapshot to restorable: true and a pruned (NULL) one to false', async () => {
    const { from } = mockSnapshotsDb([WITH_PAYLOAD, PRUNED]);

    const { getCommunitySnapshots } = await import('@/lib/server/community-snapshots');
    const result = await getCommunitySnapshots(42);

    expect(from).toHaveBeenCalledWith('site_publish_snapshots');
    expect(result).toEqual([
      { id: 10, publishedAt: '2026-03-14T12:00:00.000Z', changeCount: 3, changeLabels: ['Hero updated'], restorable: true },
      { id: 9, publishedAt: '2026-01-01T00:00:00.000Z', changeCount: 1, changeLabels: [], restorable: false },
    ]);
  });

  it('never asks for the snapshot payload — `restorable` comes from a narrow id probe', async () => {
    const { listColumns, probes } = mockSnapshotsDb([WITH_PAYLOAD, PRUNED]);

    const { getCommunitySnapshots } = await import('@/lib/server/community-snapshots');
    await getCommunitySnapshots(42);

    // The list query: 20 rows wide, so this is the projection that used to carry
    // an entire published site's content JSON twenty times over.
    expect(listColumns).toHaveLength(1);
    expect(listColumns[0]).not.toContain('snapshot');

    // The probe: one column, and the payload appears only as a NULL test.
    expect(probes).toHaveLength(1);
    expect(probes[0]!.columns).toBe('id');
    expect(probes[0]!.ids).toEqual([10, 9]);
    expect(probes[0]!.notArgs).toEqual(['snapshot', 'is', null]);
  });

  it('does not forward the snapshot payload itself — only whether it is present', async () => {
    mockSnapshotsDb([WITH_PAYLOAD]);

    const { getCommunitySnapshots } = await import('@/lib/server/community-snapshots');
    const result = await getCommunitySnapshots(42);

    expect(result[0]).not.toHaveProperty('snapshot');
    expect(Object.keys(result[0] as object).sort()).toEqual(
      ['changeCount', 'changeLabels', 'id', 'publishedAt', 'restorable'].sort(),
    );
  });

  it('skips the retention probe entirely when there are no rows', async () => {
    const { probes } = mockSnapshotsDb([]);

    const { getCommunitySnapshots } = await import('@/lib/server/community-snapshots');
    expect(await getCommunitySnapshots(42)).toEqual([]);
    expect(probes).toHaveLength(0);
  });

  it('throws (rather than degrading to an empty list) when the query errors', async () => {
    const from = vi.fn(() => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
      };
      return chain;
    });
    createAdminClientMock.mockReturnValue({ from });

    const { getCommunitySnapshots } = await import('@/lib/server/community-snapshots');
    await expect(getCommunitySnapshots(42)).rejects.toThrow('boom');
  });

  it('throws when the retention probe errors, rather than reporting everything unrestorable', async () => {
    const from = vi.fn(() => {
      let columns = '';
      const chain = {
        select: (cols: string) => {
          columns = cols;
          return chain;
        },
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () =>
          Promise.resolve({
            data: [{ id: 10, published_at: '2026-03-14T12:00:00.000Z', change_count: 1, change_labels: [] }],
            error: null,
          }),
        in: () => chain,
        not: () => Promise.resolve({ data: null, error: { message: 'probe exploded' } }),
      };
      void columns;
      return chain;
    });
    createAdminClientMock.mockReturnValue({ from });

    const { getCommunitySnapshots } = await import('@/lib/server/community-snapshots');
    await expect(getCommunitySnapshots(42)).rejects.toThrow('probe exploded');
  });
});
