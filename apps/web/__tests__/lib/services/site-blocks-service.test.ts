import { describe, it, expect, vi, beforeEach } from 'vitest';

// NOTE: vi.importActual cannot be used here because the real @propertypro/db
// requires DATABASE_URL at module load (packages/db/src/drizzle.ts throws if
// missing). This is the established pattern across the test suite — see
// branding-route.test.ts, audit-middleware.test.ts, etc.
//
// PR #8a added a transactional path (createUnscopedClient().transaction()),
// so this factory also stubs @propertypro/db/unsafe + complianceAuditLog.

vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(),
  siteBlocks: Symbol('siteBlocks'),
  complianceAuditLog: Symbol('complianceAuditLog'),
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
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: { strings: [...strings], values } }),
    {},
  ),
}));

// Hoisted so the test file can configure transaction behavior and inspect
// the tx call surface.
interface UpdateCall { set?: Record<string, unknown>; where?: { __and: Array<Record<string, unknown>> } }
const {
  createUnscopedClientMock,
  txExecuteMock,
  txSelectMock,
  txUpdateMock,
  txInsertMock,
  txAuditValuesMock,
  dbDeleteMock,
  setSelectQueue,
  setUpdateReturnQueue,
  getUpdateCalls,
  resetUpdateCalls,
  setDeleteReturning,
  getDeleteWhereArg,
} = vi.hoisted(() => {
  const txExecuteMock = vi.fn().mockResolvedValue(undefined);
  const txAuditValuesMock = vi.fn().mockResolvedValue(undefined);
  const txInsertMock = vi.fn(() => ({ values: txAuditValuesMock }));

  // .select() chain. Each .select() call consumes the NEXT array from
  // `selectQueue` (default []). publishCommunitySite may issue two selects in
  // one call (optimistic-concurrency newest-published, then draft block_orders)
  // so per-call control matters. The chain is thenable AND supports
  // orderBy/limit so both the `.orderBy().limit()` path and the awaited
  // `.where()` path resolve to the same queued rows.
  let selectQueue: unknown[][] = [];
  let selectIdx = 0;
  const txSelectMock = vi.fn(() => {
    const rows = selectQueue[selectIdx++] ?? [];
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.orderBy = () => chain;
    chain.limit = () => Promise.resolve(rows);
    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject);
    return chain;
  });

  // .update() chain. Captures set/where per call (for slot-aware assertions)
  // and returns the next array from `updateReturnQueue` from .returning()
  // (used for retired/promoted counts).
  let updateReturnQueue: unknown[][] = [];
  let updateIdx = 0;
  const updateCalls: UpdateCall[] = [];
  const txUpdateMock = vi.fn(() => {
    const call: UpdateCall = {};
    updateCalls.push(call);
    const rows = updateReturnQueue[updateIdx++] ?? [];
    const chain: Record<string, unknown> = {};
    chain.set = (s: Record<string, unknown>) => { call.set = s; return chain; };
    chain.where = (w: UpdateCall['where']) => { call.where = w; return chain; };
    chain.returning = () => Promise.resolve(rows);
    return chain;
  });

  // Tx itself + the unscoped client that wraps the transaction. The
  // transaction wrapper just calls its callback with `tx` and returns
  // whatever the callback returned. If the callback throws, the wrapper
  // re-throws (matching Drizzle's behavior).
  const tx = {
    execute: txExecuteMock,
    select: txSelectMock,
    update: txUpdateMock,
    insert: txInsertMock,
  };
  // .delete() chain on the top-level unscoped client (cleanupSoftDeletedSiteBlocks).
  // Tests set `dbDeleteReturning` to control the rows returned by .returning().
  let dbDeleteReturning: unknown[] = [];
  let dbDeleteWhereArg: unknown = undefined;
  const dbDeleteMock = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.where = vi.fn((w: unknown) => {
      dbDeleteWhereArg = w;
      return chain;
    });
    chain.returning = vi.fn(() => Promise.resolve(dbDeleteReturning));
    return chain;
  });

  const createUnscopedClientMock = vi.fn(() => ({
    transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
    delete: dbDeleteMock,
  }));

  return {
    createUnscopedClientMock,
    txExecuteMock,
    txSelectMock,
    txUpdateMock,
    txInsertMock,
    txAuditValuesMock,
    dbDeleteMock,
    // Test-only setters/getters for the chain mocks.
    setSelectQueue: (q: unknown[][]) => { selectQueue = q; selectIdx = 0; },
    setUpdateReturnQueue: (q: unknown[][]) => { updateReturnQueue = q; updateIdx = 0; },
    getUpdateCalls: () => updateCalls,
    resetUpdateCalls: () => { updateCalls.length = 0; },
    setDeleteReturning: (rows: unknown[]) => { dbDeleteReturning = rows; },
    getDeleteWhereArg: () => dbDeleteWhereArg,
  };
});

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

import { upsertPublishedHero, upsertPublishedBlock, publishCommunitySite, cleanupSoftDeletedSiteBlocks, reorderSiteBlock, removeSiteBlock, discardSiteDrafts } from '@/lib/services/site-blocks-service';
import { createScopedClient } from '@propertypro/db';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/api/errors';

const createScopedClientMock = vi.mocked(createScopedClient);

const HERO = {
  headline: 'Welcome',
  subtitle: 'A welcoming community.',
  ctaText: 'Resident Login',
  ctaTarget: '/auth/login' as const,
};

function buildScopedClient() {
  const scopedClient = {
    softDelete: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue([{ id: 999 }]),
  };
  return scopedClient;
}

// ---------------------------------------------------------------------------
// upsertPublishedBlock / upsertPublishedHero — now transactional
// ---------------------------------------------------------------------------

describe('upsertPublishedHero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens exactly one transaction and runs all three steps inside it', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(createUnscopedClientMock).toHaveBeenCalledTimes(1);
    expect(scopedClient.softDelete).toHaveBeenCalledTimes(1);
    expect(scopedClient.insert).toHaveBeenCalledTimes(1);
    expect(txInsertMock).toHaveBeenCalledTimes(1); // inline audit insert
  });

  it('inserts the new hero with is_draft=false, block_type=hero, block_order=1', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        communityId: 42,
        blockType: 'hero',
        blockOrder: 1,
        isDraft: false,
        content: HERO,
      }),
    );
  });

  it('soft-deletes before inserting (ordering inside the transaction)', async () => {
    const callOrder: string[] = [];
    const scopedClient = {
      softDelete: vi.fn().mockImplementation(async () => { callOrder.push('softDelete'); return []; }),
      insert: vi.fn().mockImplementation(async () => { callOrder.push('insert'); return [{ id: 999 }]; }),
    };
    createScopedClientMock.mockReturnValue(scopedClient as never);
    txAuditValuesMock.mockImplementationOnce(async () => { callOrder.push('audit'); });
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(callOrder).toEqual(['softDelete', 'insert', 'audit']);
  });

  it('writes the audit row inline via tx.insert(complianceAuditLog) — NOT logAuditEvent', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(txAuditValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        userId: 'user-1',
        action: 'update',
        resourceType: 'site_block',
      }),
    );
  });
});

describe('upsertPublishedBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft-deletes existing published block at matching blockOrder, then inserts new', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'text',
      blockOrder: 3,
      content: { heading: 'About', body: 'Lorem ipsum.' },
    });
    expect(scopedClient.softDelete).toHaveBeenCalled();
    expect(scopedClient.insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      blockType: 'text',
      blockOrder: 3,
      isDraft: false,
      content: { heading: 'About', body: 'Lorem ipsum.' },
    }));
  });

  it('inline audit row carries action=update, resourceType=site_block, resourceId={blockType}', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'image',
      blockOrder: 4,
      content: { imagePath: '42/content/x.webp', altText: 'pool' },
    });
    expect(txAuditValuesMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'update',
      resourceType: 'site_block',
      resourceId: 'image',
      communityId: 42,
      userId: 'user-1',
    }));
  });

  it('soft-delete predicate does NOT include blockType (matches partial unique index shape)', async () => {
    // Regression guard for ultrareview bug_011.
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'image',
      blockOrder: 5,
      content: { imagePath: '42/content/x.webp', altText: 'a' },
    });
    const [, predicate] = scopedClient.softDelete.mock.calls[0];
    const serialized = JSON.stringify(predicate);
    expect(serialized).not.toContain('block_type');
    expect(serialized).not.toContain('blockType');
  });

  it('createScopedClient is invoked with the transaction handle (atomicity wiring)', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedBlock({
      communityId: 42, actorUserId: 'user-1', blockType: 'text', blockOrder: 2, content: { body: 'x' },
    });
    // Second arg must be the tx (truthy) so scoped operations participate.
    expect(createScopedClientMock).toHaveBeenCalledWith(42, expect.anything());
    const txArg = createScopedClientMock.mock.calls[0][1];
    expect(txArg).toBeDefined();
  });
});

describe('upsertPublishedHero (back-compat caller)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to upsertPublishedBlock with blockType=hero blockOrder=1', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: { headline: 'H' } as typeof HERO });
    expect(scopedClient.insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      blockType: 'hero',
      blockOrder: 1,
      isDraft: false,
      content: { headline: 'H' },
    }));
  });
});

// ---------------------------------------------------------------------------
// publishCommunitySite — PR #8a, spec §2.7
// ---------------------------------------------------------------------------

describe('publishCommunitySite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the per-call select/update queues + captured update calls. Tests
    // queue the rows each select/update should resolve to, in call order.
    setSelectQueue([]);
    setUpdateReturnQueue([]);
    resetUpdateCalls();
  });

  it('acquires SELECT FOR UPDATE on the community row before reading state', async () => {
    setSelectQueue([[{ blockOrder: 2 }, { blockOrder: 3 }]]); // draft block_orders
    setUpdateReturnQueue([
      [{ id: 1 }, { id: 2 }, { id: 3 }], // retire
      [], // tombstone sweep (slice 8f)
      [{ id: 10 }, { id: 11 }], // promote
    ]);

    await publishCommunitySite({ communityId: 42, actorUserId: 'user-1', expectedPublishedAt: null });
    expect(txExecuteMock).toHaveBeenCalledTimes(1);
    const sqlArg = txExecuteMock.mock.calls[0][0];
    const sqlText = (sqlArg as { __sql: { strings: string[] } }).__sql.strings.join('');
    expect(sqlText).toContain('FOR UPDATE');
    expect((sqlArg as { __sql: { values: unknown[] } }).__sql.values).toContain(42);
  });

  it('returns { published:true, retiredCount, promotedCount } on a successful publish', async () => {
    setSelectQueue([[{ blockOrder: 2 }, { blockOrder: 3 }]]);
    setUpdateReturnQueue([
      [{ id: 1 }, { id: 2 }, { id: 3 }], // 3 retired
      [], // tombstone sweep (slice 8f)
      [{ id: 10 }, { id: 11 }], // 2 promoted
    ]);

    const result = await publishCommunitySite({
      communityId: 42,
      actorUserId: 'user-1',
      expectedPublishedAt: null,
    });
    expect(result).toMatchObject({
      published: true,
      retiredCount: 3,
      promotedCount: 2,
    });
    if (result.published) {
      expect(result.publishedAt).toBeInstanceOf(Date);
    }
  });

  it('returns nothing-to-publish and mutates nothing when no draft rows exist', async () => {
    setSelectQueue([[]]); // no draft block_orders

    const result = await publishCommunitySite({
      communityId: 42,
      actorUserId: 'user-1',
      expectedPublishedAt: null,
    });
    expect(result).toEqual({ published: false, reason: 'nothing-to-publish' });
    // No retire/promote UPDATE and no audit row for a no-op publish — the
    // nothing-to-publish short-circuit happens BEFORE any mutation now, so the
    // prior published rows are never even touched.
    expect(txUpdateMock).not.toHaveBeenCalled();
    expect(txAuditValuesMock).not.toHaveBeenCalled();
  });

  it('retires ONLY published rows at block_orders that have a live draft (keeps un-drafted published blocks)', async () => {
    // Drafts exist at slots 2 and 3 only. The retire UPDATE must be scoped to
    // those slots via inArray — published rows at any other slot (e.g. the
    // hero at order 1, or an un-edited block at order 4) survive the publish.
    setSelectQueue([[{ blockOrder: 2 }, { blockOrder: 3 }]]);
    setUpdateReturnQueue([
      [{ id: 100 }, { id: 101 }], // retired (slots 2,3)
      [], // tombstone sweep (slice 8f)
      [{ id: 200 }, { id: 201 }], // promoted
    ]);

    await publishCommunitySite({ communityId: 42, actorUserId: 'user-1', expectedPublishedAt: null });

    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(3);
    // First UPDATE = retire. Its predicate must include an inArray over the
    // draft block_orders [2, 3].
    const retireWhere = updateCalls[0].where;
    const inArrayClause = retireWhere?.__and.find((c) => '__inArray' in c) as
      | { __inArray: { vals: number[] } }
      | undefined;
    expect(inArrayClause).toBeDefined();
    expect(inArrayClause!.__inArray.vals).toEqual([2, 3]);
    // First UPDATE soft-deletes (sets deletedAt); the tombstone sweep also
    // soft-deletes (scoped to blockType=tombstone); the final UPDATE promotes.
    expect(updateCalls[0].set).toHaveProperty('deletedAt');
    expect(updateCalls[1].set).toHaveProperty('deletedAt');
    expect(updateCalls[2].set).toMatchObject({ isDraft: false });
  });

  it('de-duplicates draft block_orders before building the retire predicate', async () => {
    setSelectQueue([[{ blockOrder: 4 }, { blockOrder: 4 }, { blockOrder: 7 }]]);
    setUpdateReturnQueue([[{ id: 1 }], [], [{ id: 2 }]]);

    await publishCommunitySite({ communityId: 42, actorUserId: 'user-1', expectedPublishedAt: null });

    const inArrayClause = getUpdateCalls()[0].where?.__and.find((c) => '__inArray' in c) as
      | { __inArray: { vals: number[] } }
      | undefined;
    expect(inArrayClause!.__inArray.vals).toEqual([4, 7]);
  });

  it('throws ConflictError when expectedPublishedAt does not match the current max', async () => {
    const stored = new Date('2026-05-01T10:00:00Z');
    const stale = new Date('2026-04-29T10:00:00Z');
    // First select = optimistic-concurrency newest-published row.
    setSelectQueue([[{ publishedAt: stored }]]);

    await expect(
      publishCommunitySite({
        communityId: 42,
        actorUserId: 'user-1',
        expectedPublishedAt: stale,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    // Mutations and audit must NOT have run on the conflict path.
    expect(txUpdateMock).not.toHaveBeenCalled();
    expect(txAuditValuesMock).not.toHaveBeenCalled();
  });

  it('accepts matching expectedPublishedAt and proceeds to promote', async () => {
    const stored = new Date('2026-05-01T10:00:00Z');
    setSelectQueue([
      [{ publishedAt: stored }], // optimistic-concurrency select
      [{ blockOrder: 2 }], // draft block_orders select
    ]);
    setUpdateReturnQueue([
      [{ id: 1 }], // retire
      [], // tombstone sweep (slice 8f)
      [{ id: 10 }, { id: 11 }], // promote
    ]);

    const result = await publishCommunitySite({
      communityId: 42,
      actorUserId: 'user-1',
      expectedPublishedAt: stored,
    });
    expect(result.published).toBe(true);
  });

  it('writes an inline audit row with action=update, resourceType=community_site on success', async () => {
    setSelectQueue([[{ blockOrder: 2 }]]);
    setUpdateReturnQueue([
      [], // 0 retired
      [], // tombstone sweep (slice 8f)
      [{ id: 10 }, { id: 11 }, { id: 12 }], // 3 promoted
    ]);

    await publishCommunitySite({ communityId: 42, actorUserId: 'user-1', expectedPublishedAt: null });
    expect(txAuditValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        userId: 'user-1',
        action: 'update',
        resourceType: 'community_site',
        resourceId: '42',
        metadata: expect.objectContaining({ promotedCount: 3, retiredCount: 0 }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// upsertPublishedBlock — draft semantics (PR #8e)
// ---------------------------------------------------------------------------

describe('upsertPublishedBlock with isDraft=true (PR #8e)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a row with is_draft=true and publishedAt=null', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'text',
      blockOrder: 3,
      content: { body: 'draft text' },
      isDraft: true,
    });
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        isDraft: true,
        publishedAt: null,
      }),
    );
  });

  it('soft-deletes the existing DRAFT at the same blockOrder (not the published row)', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'text',
      blockOrder: 3,
      content: { body: 'replacement draft' },
      isDraft: true,
    });
    expect(scopedClient.softDelete).toHaveBeenCalledTimes(1);
    const whereArg = scopedClient.softDelete.mock.calls[0][1] as { __and: Array<{ __eq?: { col: unknown; val: unknown } }> };
    // The predicate must filter is_draft = true (replace existing draft only).
    // The mock siteBlocks is a Symbol so we identify the clause by val type.
    const isDraftClause = whereArg.__and.find(
      (c) => c?.__eq && typeof c.__eq.val === 'boolean',
    );
    expect(isDraftClause).toBeDefined();
    expect(isDraftClause!.__eq!.val).toBe(true);
  });

  it('default (isDraft omitted) still writes published — back-compat', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'text',
      blockOrder: 3,
      content: { body: 'still-published' },
    });
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        isDraft: false,
      }),
    );
    // publishedAt should be a Date (not null) on the published path.
    const insertCall = scopedClient.insert.mock.calls[0][1] as { publishedAt: unknown };
    expect(insertCall.publishedAt).toBeInstanceOf(Date);
  });

  it('audit metadata records the isDraft flag', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'text',
      blockOrder: 3,
      content: {},
      isDraft: true,
    });
    expect(txAuditValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ isDraft: true }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// cleanupSoftDeletedSiteBlocks (PR #8d)
// ---------------------------------------------------------------------------

describe('cleanupSoftDeletedSiteBlocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDeleteReturning([]);
  });

  it('returns the count of rows deleted', async () => {
    setDeleteReturning([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const result = await cleanupSoftDeletedSiteBlocks(new Date('2026-06-01T00:00:00Z'));
    expect(result).toEqual({ deleted: 3 });
  });

  it('returns 0 when no rows are past the retention window', async () => {
    setDeleteReturning([]);
    const result = await cleanupSoftDeletedSiteBlocks(new Date('2026-06-01T00:00:00Z'));
    expect(result).toEqual({ deleted: 0 });
  });

  it('issues a single DELETE on siteBlocks', async () => {
    await cleanupSoftDeletedSiteBlocks(new Date('2026-06-01T00:00:00Z'));
    expect(dbDeleteMock).toHaveBeenCalledTimes(1);
  });

  it('predicate filters by deletedAt IS NOT NULL AND deletedAt < (now - 30 days)', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    await cleanupSoftDeletedSiteBlocks(now);
    const where = getDeleteWhereArg() as { __and: Array<{ __isNotNull?: unknown; __lt?: { val: Date } }> };
    expect(where).toHaveProperty('__and');
    expect(where.__and).toHaveLength(2);
    // First clause: isNotNull(deletedAt)
    expect(where.__and[0]).toHaveProperty('__isNotNull');
    // Second clause: lt(deletedAt, cutoff)
    const ltClause = where.__and[1];
    expect(ltClause).toHaveProperty('__lt');
    const cutoff = ltClause.__lt!.val;
    expect(cutoff).toBeInstanceOf(Date);
    // 30 days = 2592000000 ms
    expect(now.getTime() - cutoff.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('respects a custom retentionDays argument', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    await cleanupSoftDeletedSiteBlocks(now, 7);
    const where = getDeleteWhereArg() as { __and: Array<{ __lt?: { val: Date } }> };
    const ltClause = where.__and[1];
    const cutoff = ltClause.__lt!.val;
    expect(now.getTime() - cutoff.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// reorderSiteBlock — per-block ↑/↓ move (draft-copy semantics)
// ---------------------------------------------------------------------------

describe('reorderSiteBlock', () => {
  // Three published content blocks in order 2,3,4 (no drafts). The merged
  // editor view the service reads is the draft-wins dedupe of these rows.
  function threeContentBlocks() {
    return [
      { id: 12, blockType: 'text', blockOrder: 2, content: { body: 'A' }, isDraft: false },
      { id: 13, blockType: 'image', blockOrder: 3, content: { imagePath: '42/c/b.webp', altText: 'B' }, isDraft: false },
      { id: 14, blockType: 'text', blockOrder: 4, content: { body: 'C' }, isDraft: false },
    ];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setSelectQueue([]);
    setUpdateReturnQueue([]);
    resetUpdateCalls();
  });

  it('moves a block DOWN: swaps its order with the next block, writing two draft rows', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([threeContentBlocks()]);

    const result = await reorderSiteBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockId: 12, // block A at order 2
      direction: 'down',
    });

    // A (order 2) swaps with B (order 3): A→3, B→2.
    expect(result).toEqual({ movedBlockId: 12, fromOrder: 2, toOrder: 3 });
    expect(scopedClient.insert).toHaveBeenCalledTimes(2);
    // Moving block A gets the neighbor's order (3) with A's content + type.
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ blockType: 'text', blockOrder: 3, isDraft: true, publishedAt: null, content: { body: 'A' } }),
    );
    // Neighbor B gets the moving block's order (2) with B's content + type.
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ blockType: 'image', blockOrder: 2, isDraft: true, publishedAt: null, content: { imagePath: '42/c/b.webp', altText: 'B' } }),
    );
  });

  it('moves a block UP: swaps its order with the previous block', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([threeContentBlocks()]);

    const result = await reorderSiteBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockId: 13, // block B at order 3
      direction: 'up',
    });

    expect(result).toEqual({ movedBlockId: 13, fromOrder: 3, toOrder: 2 });
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ blockType: 'image', blockOrder: 2, content: { imagePath: '42/c/b.webp', altText: 'B' } }),
    );
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ blockType: 'text', blockOrder: 3, content: { body: 'A' } }),
    );
  });

  it('soft-deletes existing DRAFT rows at the two affected orders before inserting (sidesteps the partial unique index)', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([threeContentBlocks()]);

    await reorderSiteBlock({ communityId: 42, actorUserId: 'user-1', blockId: 12, direction: 'down' });

    expect(scopedClient.softDelete).toHaveBeenCalledTimes(1);
    const [, predicate] = scopedClient.softDelete.mock.calls[0] as [unknown, { __and: Array<Record<string, unknown>> }];
    // Predicate scopes to the two affected orders via inArray …
    const inArrayClause = predicate.__and.find((c) => '__inArray' in c) as { __inArray: { vals: number[] } } | undefined;
    expect(inArrayClause).toBeDefined();
    expect(inArrayClause!.__inArray.vals.sort()).toEqual([2, 3]);
    // … and only matches draft rows (is_draft = true).
    const isDraftClause = predicate.__and.find((c) => '__eq' in c && (c as { __eq: { val: unknown } }).__eq.val === true);
    expect(isDraftClause).toBeDefined();
  });

  it('uses the draft-wins winning content when a slot has both a published and a draft row', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    // Slot 2 has a published row (id 12) shadowed by a draft (id 99). The draft
    // is the winning row the editor shows and the one reorder must copy.
    setSelectQueue([[
      { id: 12, blockType: 'text', blockOrder: 2, content: { body: 'published' }, isDraft: false },
      { id: 99, blockType: 'text', blockOrder: 2, content: { body: 'draft-wins' }, isDraft: true },
      { id: 13, blockType: 'image', blockOrder: 3, content: { imagePath: '42/c/b.webp', altText: 'B' }, isDraft: false },
    ]]);

    const result = await reorderSiteBlock({ communityId: 42, actorUserId: 'user-1', blockId: 99, direction: 'down' });

    expect(result).toEqual({ movedBlockId: 99, fromOrder: 2, toOrder: 3 });
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ blockOrder: 3, content: { body: 'draft-wins' } }),
    );
  });

  it('creates a draft copy of a published-only block at its new order', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([threeContentBlocks()]); // all published, no drafts

    await reorderSiteBlock({ communityId: 42, actorUserId: 'user-1', blockId: 14, direction: 'up' });

    // Block C (published-only, order 4) becomes a DRAFT copy at order 3.
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ blockType: 'text', blockOrder: 3, isDraft: true, content: { body: 'C' } }),
    );
  });

  it('acquires SELECT FOR UPDATE on the community row before reordering', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([threeContentBlocks()]);

    await reorderSiteBlock({ communityId: 42, actorUserId: 'user-1', blockId: 12, direction: 'down' });

    expect(txExecuteMock).toHaveBeenCalledTimes(1);
    const sqlArg = txExecuteMock.mock.calls[0][0] as { __sql: { strings: string[]; values: unknown[] } };
    expect(sqlArg.__sql.strings.join('')).toContain('FOR UPDATE');
    expect(sqlArg.__sql.values).toContain(42);
  });

  it('writes an inline audit row recording the reorder', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([threeContentBlocks()]);

    await reorderSiteBlock({ communityId: 42, actorUserId: 'user-1', blockId: 12, direction: 'down' });

    expect(txAuditValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        userId: 'user-1',
        action: 'update',
        resourceType: 'site_block',
        resourceId: '12',
        metadata: expect.objectContaining({ reorder: true, direction: 'down', fromOrder: 2, toOrder: 3 }),
      }),
    );
  });

  it('throws NotFoundError when the blockId is not among the community content blocks', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([threeContentBlocks()]);

    await expect(
      reorderSiteBlock({ communityId: 42, actorUserId: 'user-1', blockId: 999, direction: 'down' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(scopedClient.insert).not.toHaveBeenCalled();
  });

  it('throws ValidationError when moving the first block UP (no neighbor)', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([threeContentBlocks()]);

    await expect(
      reorderSiteBlock({ communityId: 42, actorUserId: 'user-1', blockId: 12, direction: 'up' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(scopedClient.softDelete).not.toHaveBeenCalled();
    expect(scopedClient.insert).not.toHaveBeenCalled();
  });

  it('throws ValidationError when moving the last block DOWN (no neighbor)', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([threeContentBlocks()]);

    await expect(
      reorderSiteBlock({ communityId: 42, actorUserId: 'user-1', blockId: 14, direction: 'down' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('treats the hero (order 1) as out of scope — a lone content block has no neighbor to swap with', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    // The select is scoped to block_order >= 2, so the hero never appears. A
    // single content block at order 2 cannot move up (hero is not a neighbor).
    setSelectQueue([[
      { id: 20, blockType: 'text', blockOrder: 2, content: { body: 'only' }, isDraft: false },
    ]]);

    await expect(
      reorderSiteBlock({ communityId: 42, actorUserId: 'user-1', blockId: 20, direction: 'up' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// removeSiteBlock — staged deletion via tombstone drafts (slice 8f)
// ---------------------------------------------------------------------------

describe('removeSiteBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSelectQueue([]);
    setUpdateReturnQueue([]);
    resetUpdateCalls();
  });

  it('published slot: clears any draft at the order and stages a tombstone draft (staged=true)', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    // Slot 3 has a published row AND an edited draft.
    setSelectQueue([[
      { id: 30, blockType: 'text', isDraft: false },
      { id: 31, blockType: 'text', isDraft: true },
    ]]);

    const result = await removeSiteBlock({ communityId: 42, actorUserId: 'user-1', blockOrder: 3 });

    expect(result).toEqual({ staged: true });
    expect(scopedClient.softDelete).toHaveBeenCalledTimes(1);
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        communityId: 42,
        blockType: 'tombstone',
        blockOrder: 3,
        isDraft: true,
        publishedAt: null,
        content: {},
      }),
    );
  });

  it('draft-only slot: soft-deletes the draft immediately, no tombstone (staged=false)', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([[{ id: 40, blockType: 'faq', isDraft: true }]]);

    const result = await removeSiteBlock({ communityId: 42, actorUserId: 'user-1', blockOrder: 8 });

    expect(result).toEqual({ staged: false });
    expect(scopedClient.softDelete).toHaveBeenCalledTimes(1);
    expect(scopedClient.insert).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the slot has no live rows', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([[]]);

    await expect(
      removeSiteBlock({ communityId: 42, actorUserId: 'user-1', blockOrder: 5 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(scopedClient.softDelete).not.toHaveBeenCalled();
    expect(scopedClient.insert).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the slot holds only a tombstone draft (nothing visible)', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([[{ id: 50, blockType: 'tombstone', isDraft: true }]]);

    await expect(
      removeSiteBlock({ communityId: 42, actorUserId: 'user-1', blockOrder: 6 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ValidationError for the hero slot (blockOrder < 2) without opening a transaction', async () => {
    await expect(
      removeSiteBlock({ communityId: 42, actorUserId: 'user-1', blockOrder: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(createUnscopedClientMock).not.toHaveBeenCalled();
  });

  it('acquires the community FOR UPDATE lock (serializes with publish/reorder)', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([[{ id: 30, blockType: 'text', isDraft: false }]]);

    await removeSiteBlock({ communityId: 42, actorUserId: 'user-1', blockOrder: 3 });

    const sqlArg = txExecuteMock.mock.calls[0][0];
    const sqlText = (sqlArg as { __sql: { strings: string[] } }).__sql.strings.join('');
    expect(sqlText).toContain('FOR UPDATE');
  });

  it('writes an inline audit row with action=delete and the staged flag', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([[{ id: 30, blockType: 'meetings', isDraft: false }]]);

    await removeSiteBlock({ communityId: 42, actorUserId: 'user-1', blockOrder: 4 });

    expect(txAuditValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        userId: 'user-1',
        action: 'delete',
        resourceType: 'site_block',
        resourceId: '4',
        metadata: expect.objectContaining({ blockOrder: 4, staged: true, removedBlockType: 'meetings' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// discardSiteDrafts — escape hatch for pending drafts (slice 8f)
// ---------------------------------------------------------------------------

describe('discardSiteDrafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSelectQueue([]);
    setUpdateReturnQueue([]);
    resetUpdateCalls();
  });

  it('soft-deletes every live draft and returns the count', async () => {
    setUpdateReturnQueue([[{ id: 1 }, { id: 2 }, { id: 3 }]]);

    const result = await discardSiteDrafts({ communityId: 42, actorUserId: 'user-1' });

    expect(result).toEqual({ discardedCount: 3 });
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].set).toHaveProperty('deletedAt');
  });

  it('acquires the community FOR UPDATE lock before discarding', async () => {
    setUpdateReturnQueue([[{ id: 1 }]]);
    await discardSiteDrafts({ communityId: 42, actorUserId: 'user-1' });
    const sqlArg = txExecuteMock.mock.calls[0][0];
    const sqlText = (sqlArg as { __sql: { strings: string[] } }).__sql.strings.join('');
    expect(sqlText).toContain('FOR UPDATE');
  });

  it('returns 0 and writes no audit row when there is nothing to discard', async () => {
    setUpdateReturnQueue([[]]);
    const result = await discardSiteDrafts({ communityId: 42, actorUserId: 'user-1' });
    expect(result).toEqual({ discardedCount: 0 });
    expect(txAuditValuesMock).not.toHaveBeenCalled();
  });

  it('writes an inline audit row with action=delete, resourceType=community_site_drafts', async () => {
    setUpdateReturnQueue([[{ id: 1 }, { id: 2 }]]);
    await discardSiteDrafts({ communityId: 42, actorUserId: 'user-1' });
    expect(txAuditValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        userId: 'user-1',
        action: 'delete',
        resourceType: 'community_site_drafts',
        resourceId: '42',
        metadata: { discardedCount: 2 },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// publishCommunitySite × tombstones (slice 8f)
// ---------------------------------------------------------------------------

describe('publishCommunitySite with tombstone drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSelectQueue([]);
    setUpdateReturnQueue([]);
    resetUpdateCalls();
  });

  it('sweeps tombstone drafts between retire and promote so they are never published', async () => {
    // One tombstone draft at slot 3 (staged deletion of a published block).
    setSelectQueue([[{ blockOrder: 3 }]]);
    setUpdateReturnQueue([
      [{ id: 100 }], // retire: the published row at slot 3
      [{ id: 101 }], // tombstone sweep: the tombstone draft itself
      [], // promote: nothing left to promote
    ]);

    const result = await publishCommunitySite({ communityId: 42, actorUserId: 'user-1', expectedPublishedAt: null });

    expect(result).toMatchObject({ published: true, retiredCount: 1, promotedCount: 0 });
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(3);
    // The sweep (second UPDATE) soft-deletes and its predicate pins
    // blockType=tombstone + isDraft=true.
    expect(updateCalls[1].set).toHaveProperty('deletedAt');
    const sweepClauses = updateCalls[1].where?.__and ?? [];
    const eqClauses = sweepClauses.filter((c) => '__eq' in c) as Array<{ __eq: { val: unknown } }>;
    expect(eqClauses.some((c) => c.__eq.val === 'tombstone')).toBe(true);
    expect(eqClauses.some((c) => c.__eq.val === true)).toBe(true);
  });

  it('a tombstone counts as a draft for the nothing-to-publish check (staged deletions are publishable)', async () => {
    // draftOrders select returns the tombstone's order — publish proceeds
    // rather than short-circuiting.
    setSelectQueue([[{ blockOrder: 5 }]]);
    setUpdateReturnQueue([[{ id: 1 }], [{ id: 2 }], []]);

    const result = await publishCommunitySite({ communityId: 42, actorUserId: 'user-1', expectedPublishedAt: null });
    expect(result).toMatchObject({ published: true });
  });
});

// ---------------------------------------------------------------------------
// reorderSiteBlock × tombstones (slice 8f)
// ---------------------------------------------------------------------------

describe('reorderSiteBlock with tombstone drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSelectQueue([]);
    setUpdateReturnQueue([]);
    resetUpdateCalls();
  });

  it('skips tombstoned slots in neighbor math — swap happens across the staged deletion', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    // Slot 3 is tombstoned (draft tombstone wins the merge over its published
    // row). Visible blocks are A@2 and C@4 — moving A down must swap with C,
    // not the tombstone.
    setSelectQueue([[
      { id: 12, blockType: 'text', blockOrder: 2, content: { body: 'A' }, isDraft: false },
      { id: 13, blockType: 'image', blockOrder: 3, content: { imagePath: '42/c/b.webp', altText: 'B' }, isDraft: false },
      { id: 90, blockType: 'tombstone', blockOrder: 3, content: {}, isDraft: true },
      { id: 14, blockType: 'text', blockOrder: 4, content: { body: 'C' }, isDraft: false },
    ]]);

    const result = await reorderSiteBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockId: 12,
      direction: 'down',
    });

    expect(result).toEqual({ movedBlockId: 12, fromOrder: 2, toOrder: 4 });
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ blockType: 'text', blockOrder: 4, content: { body: 'A' } }),
    );
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ blockType: 'text', blockOrder: 2, content: { body: 'C' } }),
    );
  });

  it('a tombstone itself is not reorderable (NotFound by id)', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    setSelectQueue([[
      { id: 12, blockType: 'text', blockOrder: 2, content: { body: 'A' }, isDraft: false },
      { id: 90, blockType: 'tombstone', blockOrder: 3, content: {}, isDraft: true },
    ]]);

    await expect(
      reorderSiteBlock({ communityId: 42, actorUserId: 'user-1', blockId: 90, direction: 'up' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
