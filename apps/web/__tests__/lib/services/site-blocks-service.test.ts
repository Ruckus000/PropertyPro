import { describe, it, expect, vi, beforeEach } from 'vitest';

// NOTE: vi.importActual cannot be used here because the real @propertypro/db
// requires DATABASE_URL at module load (packages/db/src/drizzle.ts throws if
// missing). This is the established pattern across the test suite — see
// branding-route.test.ts, audit-middleware.test.ts, etc.
//
// Guard against future silent-undefined imports: every export consumed by the
// service is explicitly stubbed. When PR #8 adds a sibling table import,
// this factory MUST be extended accordingly — the factory is intentionally
// exhaustive, not minimal.
vi.mock('@propertypro/db', () => ({
  createScopedClient: vi.fn(),
  logAuditEvent: vi.fn(),
  siteBlocks: Symbol('siteBlocks'), // table ref: identity doesn't matter; expect.anything() checks pass
}));

vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ __eq: { col, val } })),
  isNull: vi.fn((col: unknown) => ({ __isNull: col })),
}));

import { upsertPublishedHero, upsertPublishedBlock } from '@/lib/services/site-blocks-service';
import { createScopedClient, logAuditEvent } from '@propertypro/db';

const createScopedClientMock = vi.mocked(createScopedClient);
const logAuditEventMock = vi.mocked(logAuditEvent);

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

describe('upsertPublishedHero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('soft-deletes any existing published hero before inserting the new one', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(scopedClient.softDelete).toHaveBeenCalledTimes(1);
    expect(scopedClient.softDelete).toHaveBeenCalledWith(
      expect.anything(), // siteBlocks table ref
      expect.anything(), // where clause
    );
  });

  it('inserts the new hero with is_draft=false, block_type=hero, block_order=1', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(scopedClient.insert).toHaveBeenCalledTimes(1);
    expect(scopedClient.insert).toHaveBeenCalledWith(
      expect.anything(), // siteBlocks table ref
      expect.objectContaining({
        communityId: 42,
        blockType: 'hero',
        blockOrder: 1,
        isDraft: false,
        content: HERO,
      }),
    );
  });

  it('soft-deletes before inserting (ordering)', async () => {
    const callOrder: string[] = [];
    const scopedClient = {
      softDelete: vi.fn().mockImplementation(async () => { callOrder.push('softDelete'); return []; }),
      insert: vi.fn().mockImplementation(async () => { callOrder.push('insert'); return [{ id: 999 }]; }),
    };
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(callOrder).toEqual(['softDelete', 'insert']);
  });

  it('writes a compliance_audit_log entry on success with the canonical logAuditEvent shape', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        userId: 'user-1',
      }),
    );
  });

  it('audit-logs AFTER mutations complete (not before)', async () => {
    const callOrder: string[] = [];
    const scopedClient = {
      softDelete: vi.fn().mockImplementation(async () => { callOrder.push('softDelete'); return []; }),
      insert: vi.fn().mockImplementation(async () => { callOrder.push('insert'); return [{ id: 999 }]; }),
    };
    createScopedClientMock.mockReturnValue(scopedClient as never);
    logAuditEventMock.mockImplementationOnce(async () => {
      callOrder.push('audit');
    });
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(callOrder).toEqual(['softDelete', 'insert', 'audit']);
  });
});

describe('upsertPublishedBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('soft-deletes existing published block at matching blockType + blockOrder, then inserts new', async () => {
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

  it('audit-logs with action=update, resourceType=site_block, resourceId={blockType}', async () => {
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'image',
      blockOrder: 4,
      content: { imagePath: '42/content/x.webp', altText: 'pool' },
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'update',
      resourceType: 'site_block',
      resourceId: 'image',
      communityId: 42,
      userId: 'user-1',
    }));
  });

  it('audit log fires AFTER mutations complete', async () => {
    const callOrder: string[] = [];
    const scopedClient = {
      softDelete: vi.fn().mockImplementation(async () => { callOrder.push('softDelete'); return []; }),
      insert: vi.fn().mockImplementation(async () => { callOrder.push('insert'); return [{ id: 999 }]; }),
    };
    createScopedClientMock.mockReturnValue(scopedClient as never);
    logAuditEventMock.mockImplementationOnce(async () => { callOrder.push('audit'); });
    await upsertPublishedBlock({
      communityId: 42, actorUserId: 'user-1', blockType: 'text', blockOrder: 2, content: { body: 'x' },
    });
    expect(callOrder).toEqual(['softDelete', 'insert', 'audit']);
  });

  it('soft-delete predicate does NOT include blockType (matches partial unique index shape)', async () => {
    // Regression guard for ultrareview bug_011: the partial unique index
    // `site_blocks_community_order_draft_variant_partial` is keyed on
    // (community_id, block_order, is_draft, template_variant) WHERE
    // deleted_at IS NULL — block_type is intentionally not part of the
    // uniqueness key. Filtering soft-delete on block_type would leave a
    // different-type row at the same order, and the subsequent insert
    // would collide on the partial unique index. The predicate must be
    // type-agnostic.
    const scopedClient = buildScopedClient();
    createScopedClientMock.mockReturnValue(scopedClient as never);
    await upsertPublishedBlock({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'image',
      blockOrder: 5,
      content: { imagePath: '42/content/x.webp', altText: 'a' },
    });
    // softDelete is called with (table, predicate). The predicate is a
    // drizzle-and(...) shape; we serialize and grep to confirm absence.
    const [, predicate] = scopedClient.softDelete.mock.calls[0];
    const serialized = JSON.stringify(predicate);
    expect(serialized).not.toContain('block_type');
    expect(serialized).not.toContain('blockType');
  });
});

describe('upsertPublishedHero (back-compat caller)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logAuditEventMock.mockResolvedValue(undefined);
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
