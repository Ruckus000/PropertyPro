import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

type Chain = {
  select: (...args: unknown[]) => Chain;
  eq: (...args: unknown[]) => Chain;
  is: (...args: unknown[]) => Chain;
  order: (...args: unknown[]) => Chain;
  limit: (...args: unknown[]) => Chain;
  then?: PromiseLike<unknown>['then'];
};

function resolvedChain(result: { data: unknown; error?: unknown }): Chain {
  const resolved = Promise.resolve({ error: null, ...result });
  const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
  };
  chain.then = resolved.then.bind(resolved);
  return chain;
}

describe('getCommunitySnapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps a NOT-NULL snapshot to restorable: true and a pruned (NULL) one to false', async () => {
    const from = vi.fn(() =>
      resolvedChain({
        data: [
          {
            id: 10,
            published_at: '2026-03-14T12:00:00.000Z',
            change_count: 3,
            change_labels: ['Hero updated'],
            snapshot: { version: 2, pages: [], blocks: [] },
          },
          {
            id: 9,
            published_at: '2026-01-01T00:00:00.000Z',
            change_count: 1,
            change_labels: null,
            snapshot: null,
          },
        ],
      }),
    );
    createAdminClientMock.mockReturnValue({ from });

    const { getCommunitySnapshots } = await import('@/lib/server/community-snapshots');
    const result = await getCommunitySnapshots(42);

    expect(from).toHaveBeenCalledWith('site_publish_snapshots');
    expect(result).toEqual([
      { id: 10, publishedAt: '2026-03-14T12:00:00.000Z', changeCount: 3, changeLabels: ['Hero updated'], restorable: true },
      { id: 9, publishedAt: '2026-01-01T00:00:00.000Z', changeCount: 1, changeLabels: [], restorable: false },
    ]);
  });

  it('does not forward the snapshot payload itself — only whether it is present', async () => {
    const from = vi.fn(() =>
      resolvedChain({
        data: [
          {
            id: 1,
            published_at: '2026-03-14T12:00:00.000Z',
            change_count: 1,
            change_labels: [],
            snapshot: { version: 2, pages: [{ pageId: 1, name: 'Home', slug: '', inNav: true, sortOrder: 0, isHome: true }], blocks: [] },
          },
        ],
      }),
    );
    createAdminClientMock.mockReturnValue({ from });

    const { getCommunitySnapshots } = await import('@/lib/server/community-snapshots');
    const result = await getCommunitySnapshots(42);

    expect(result[0]).not.toHaveProperty('snapshot');
    expect(Object.keys(result[0] as object).sort()).toEqual(
      ['changeCount', 'changeLabels', 'id', 'publishedAt', 'restorable'].sort(),
    );
  });

  it('throws (rather than degrading to an empty list) when the query errors', async () => {
    const from = vi.fn(() => resolvedChain({ data: null, error: { message: 'boom' } }));
    createAdminClientMock.mockReturnValue({ from });

    const { getCommunitySnapshots } = await import('@/lib/server/community-snapshots');
    await expect(getCommunitySnapshots(42)).rejects.toThrow('boom');
  });
});
