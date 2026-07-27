/**
 * Publish-history retention (website editor v3, Phase 6 — decision 12).
 *
 * The behaviour under test is narrow and load-bearing: beyond the most recent
 * N publishes per community the `snapshot` PAYLOAD is nulled and the LOG ROW
 * survives. A DELETE would be simpler and wrong — the log is the point.
 *
 * `@propertypro/db` is mocked wholesale (the real module needs DATABASE_URL at
 * import time), so every export the service imports has to appear in the
 * factory below or module load throws — a failure that only shows up in the
 * DB-less CI unit job.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(),
  siteBlocks: Symbol('siteBlocks'),
  // Phase 8: publishCommunitySite now stamps communities.site_published_at.
  communities: Symbol('communities'),
  complianceAuditLog: Symbol('complianceAuditLog'),
  sitePublishSnapshots: Symbol('sitePublishSnapshots'),
}));

vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  asc: vi.fn((col: unknown) => ({ __asc: col })),
  desc: vi.fn((col: unknown) => ({ __desc: col })),
  gte: vi.fn((col: unknown, val: unknown) => ({ __gte: { col, val } })),
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: { col, val } })),
  isNull: vi.fn((col: unknown) => ({ __isNull: col })),
  isNotNull: vi.fn((col: unknown) => ({ __isNotNull: col })),
  lt: vi.fn((col: unknown, val: unknown) => ({ __lt: { col, val } })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ __inArray: { col, vals } })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: { strings: [...strings], values },
    }),
    {},
  ),
}));

const {
  createUnscopedClientMock,
  dbSelectMock,
  dbUpdateMock,
  setSelectRows,
  setUpdateReturning,
  getUpdateSet,
  getUpdateWhere,
  getDeleteCallCount,
} = vi.hoisted(() => {
  let selectRows: unknown[] = [];
  const dbSelectMock = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.orderBy = () => Promise.resolve(selectRows);
    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(selectRows).then(resolve, reject);
    return chain;
  });

  let updateSet: Record<string, unknown> | undefined;
  let updateWhere: unknown;
  let updateReturning: unknown[] = [];
  const dbUpdateMock = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.set = (s: Record<string, unknown>) => { updateSet = s; return chain; };
    chain.where = (w: unknown) => { updateWhere = w; return chain; };
    chain.returning = () => Promise.resolve(updateReturning);
    return chain;
  });

  let deleteCalls = 0;
  const dbDeleteMock = vi.fn(() => {
    deleteCalls += 1;
    const chain: Record<string, unknown> = {};
    chain.where = () => chain;
    chain.returning = () => Promise.resolve([]);
    return chain;
  });

  const createUnscopedClientMock = vi.fn(() => ({
    select: dbSelectMock,
    update: dbUpdateMock,
    delete: dbDeleteMock,
    transaction: async (cb: (t: unknown) => unknown) => cb({}),
  }));

  return {
    createUnscopedClientMock,
    dbSelectMock,
    dbUpdateMock,
    setSelectRows: (rows: unknown[]) => { selectRows = rows; },
    setUpdateReturning: (rows: unknown[]) => { updateReturning = rows; },
    getUpdateSet: () => updateSet,
    getUpdateWhere: () => updateWhere,
    getDeleteCallCount: () => deleteCalls,
  };
});

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

import {
  pruneSitePublishSnapshots,
  SITE_PUBLISH_SNAPSHOT_KEEP,
} from '@/lib/services/site-blocks-service';

/** `count` rows for one community, newest first (the service's read order). */
function rowsFor(communityId: number, count: number, startId = communityId * 1000) {
  return Array.from({ length: count }, (_, i) => ({ id: startId + i, communityId }));
}

describe('pruneSitePublishSnapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSelectRows([]);
    setUpdateReturning([]);
  });

  it('nulls the snapshot payload beyond the most recent N per community', async () => {
    setSelectRows(rowsFor(1, 5));
    setUpdateReturning([{ id: 1002 }, { id: 1003 }, { id: 1004 }]);

    const result = await pruneSitePublishSnapshots(2);

    expect(result).toEqual({ pruned: 3 });
    // The three oldest ids — the two newest keep their payload.
    const where = getUpdateWhere() as { __inArray: { vals: number[] } };
    expect(where.__inArray.vals).toEqual([1002, 1003, 1004]);
  });

  it('KEEPS the log row — it is an UPDATE to null, never a DELETE', async () => {
    setSelectRows(rowsFor(1, 3));
    setUpdateReturning([{ id: 1002 }]);

    await pruneSitePublishSnapshots(2);

    expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    expect(getUpdateSet()).toMatchObject({ snapshot: null });
    // Nothing is removed from the history log.
    expect(getDeleteCallCount()).toBe(0);
  });

  it('counts the keep window PER COMMUNITY, not globally', async () => {
    // Two communities with 3 publishes each; keep 2 → one prune from each.
    setSelectRows([...rowsFor(1, 3), ...rowsFor(2, 3)]);
    setUpdateReturning([{ id: 1002 }, { id: 2002 }]);

    const result = await pruneSitePublishSnapshots(2);

    expect(result).toEqual({ pruned: 2 });
    const where = getUpdateWhere() as { __inArray: { vals: number[] } };
    expect(where.__inArray.vals.sort()).toEqual([1002, 2002]);
  });

  it('does nothing when every community is inside the keep window', async () => {
    setSelectRows(rowsFor(1, 2));

    const result = await pruneSitePublishSnapshots(5);

    expect(result).toEqual({ pruned: 0 });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('does nothing when there is no history at all', async () => {
    setSelectRows([]);
    const result = await pruneSitePublishSnapshots();
    expect(result).toEqual({ pruned: 0 });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('only scans rows that still have a payload (already-pruned rows are skipped)', async () => {
    setSelectRows(rowsFor(1, 1));
    await pruneSitePublishSnapshots(0);
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
    // The read predicate pins snapshot IS NOT NULL AND deleted_at IS NULL, so
    // the sweep is bounded rather than a full-table scan that re-nulls nulls.
    const { isNotNull, isNull } = await import('@propertypro/db/filters');
    expect(vi.mocked(isNotNull)).toHaveBeenCalled();
    expect(vi.mocked(isNull)).toHaveBeenCalled();
  });

  it('defaults to the documented keep window', async () => {
    setSelectRows(rowsFor(1, SITE_PUBLISH_SNAPSHOT_KEEP));
    const result = await pruneSitePublishSnapshots();
    expect(result).toEqual({ pruned: 0 });
    expect(SITE_PUBLISH_SNAPSHOT_KEEP).toBeGreaterThan(0);
  });

  it('touches the updatedAt stamp so the prune is visible in the row', async () => {
    setSelectRows(rowsFor(1, 2));
    setUpdateReturning([{ id: 1001 }]);
    await pruneSitePublishSnapshots(1);
    expect(getUpdateSet()?.['updatedAt']).toBeInstanceOf(Date);
  });
});
