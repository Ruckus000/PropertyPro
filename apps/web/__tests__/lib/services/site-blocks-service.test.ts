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
  desc: vi.fn((col: unknown) => ({ __desc: col })),
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: { col, val } })),
  isNull: vi.fn((col: unknown) => ({ __isNull: col })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: { strings: [...strings], values } }),
    {},
  ),
}));

// Hoisted so the test file can configure transaction behavior and inspect
// the tx call surface.
const { createUnscopedClientMock, txExecuteMock, txSelectMock, txUpdateMock, txInsertMock, txAuditValuesMock } = vi.hoisted(() => {
  const txExecuteMock = vi.fn().mockResolvedValue(undefined);
  const txAuditValuesMock = vi.fn().mockResolvedValue(undefined);
  const txInsertMock = vi.fn(() => ({ values: txAuditValuesMock }));
  // .select() chain: orderBy + limit are terminal-ish; .where() returns
  // chainable; the final await resolves to an array of rows. Tests set
  // `txSelectRows` per-call before invoking the SUT.
  let txSelectRows: unknown[] = [];
  const txSelectMock = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(txSelectRows));
    // For .select().from().where() that awaits without orderBy/limit
    // (publishCommunitySite optimistic-concurrency path), make the chain
    // thenable.
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve(txSelectRows).then(resolve);
    return chain;
  });
  // .update() chain: set/where/returning. Tests set `txUpdateReturning` to
  // control returning() output (used for retired/promoted count).
  let txUpdateReturning: unknown[] = [];
  const txUpdateMock = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.set = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.returning = vi.fn(() => Promise.resolve(txUpdateReturning));
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
  const createUnscopedClientMock = vi.fn(() => ({
    transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
  }));

  return {
    createUnscopedClientMock,
    txExecuteMock,
    txSelectMock,
    txUpdateMock,
    txInsertMock,
    txAuditValuesMock,
    // Test-only setters for the chain mocks.
    setSelectRows: (rows: unknown[]) => { txSelectRows = rows; },
    setUpdateReturning: (rows: unknown[]) => { txUpdateReturning = rows; },
  };
});

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

import { upsertPublishedHero, upsertPublishedBlock, publishCommunitySite } from '@/lib/services/site-blocks-service';
import { createScopedClient } from '@propertypro/db';
import { ConflictError } from '@/lib/api/errors';

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
    // Default chain returns: no current published row (so optimistic check
    // resolves to "current=null"); update returning [] means 0 rows.
    // Tests override per-case.
  });

  it('acquires SELECT FOR UPDATE on the community row before reading state', async () => {
    // promoted = 1 so we don't trip the nothing-to-publish path
    txUpdateMock.mockImplementationOnce(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]), // 3 retired
    } as unknown as ReturnType<typeof txUpdateMock>))
    .mockImplementationOnce(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }]), // 2 promoted
    } as unknown as ReturnType<typeof txUpdateMock>));

    await publishCommunitySite({ communityId: 42, actorUserId: 'user-1', expectedPublishedAt: null });
    expect(txExecuteMock).toHaveBeenCalledTimes(1);
    const sqlArg = txExecuteMock.mock.calls[0][0];
    const sqlText = (sqlArg as { __sql: { strings: string[] } }).__sql.strings.join('');
    expect(sqlText).toContain('FOR UPDATE');
    expect((sqlArg as { __sql: { values: unknown[] } }).__sql.values).toContain(42);
  });

  it('returns { published:true, retiredCount, promotedCount } on a successful publish', async () => {
    txUpdateMock.mockImplementationOnce(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]),
    } as unknown as ReturnType<typeof txUpdateMock>))
    .mockImplementationOnce(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }]),
    } as unknown as ReturnType<typeof txUpdateMock>));

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

  it('returns { published:false, reason:nothing-to-publish } when no drafts exist', async () => {
    txUpdateMock.mockImplementationOnce(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 1 }]), // 1 retired
    } as unknown as ReturnType<typeof txUpdateMock>))
    .mockImplementationOnce(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]), // 0 promoted
    } as unknown as ReturnType<typeof txUpdateMock>));

    const result = await publishCommunitySite({
      communityId: 42,
      actorUserId: 'user-1',
      expectedPublishedAt: null,
    });
    expect(result).toEqual({ published: false, reason: 'nothing-to-publish' });
    // Audit row must NOT have been written for a no-op publish.
    expect(txAuditValuesMock).not.toHaveBeenCalled();
  });

  it('throws ConflictError when expectedPublishedAt does not match the current max', async () => {
    const stored = new Date('2026-05-01T10:00:00Z');
    const stale = new Date('2026-04-29T10:00:00Z');
    // Optimistic-concurrency SELECT returns the stored value.
    txSelectMock.mockImplementationOnce(() => {
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.orderBy = vi.fn(() => chain);
      chain.limit = vi.fn(() => Promise.resolve([{ publishedAt: stored }]));
      return chain;
    });

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
    txSelectMock.mockImplementationOnce(() => {
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.orderBy = vi.fn(() => chain);
      chain.limit = vi.fn(() => Promise.resolve([{ publishedAt: stored }]));
      return chain;
    });
    txUpdateMock.mockImplementationOnce(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    } as unknown as ReturnType<typeof txUpdateMock>))
    .mockImplementationOnce(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }]),
    } as unknown as ReturnType<typeof txUpdateMock>));

    const result = await publishCommunitySite({
      communityId: 42,
      actorUserId: 'user-1',
      expectedPublishedAt: stored,
    });
    expect(result.published).toBe(true);
  });

  it('writes an inline audit row with action=update, resourceType=community_site on success', async () => {
    txUpdateMock.mockImplementationOnce(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof txUpdateMock>))
    .mockImplementationOnce(() => ({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }, { id: 12 }]),
    } as unknown as ReturnType<typeof txUpdateMock>));

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
