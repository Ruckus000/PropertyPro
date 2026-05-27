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

import { upsertPublishedHero } from '@/lib/services/site-blocks-service';
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
