/**
 * GET /api/v1/pm/site/publish/history — website editor v3, Phase 6.
 *
 * The assertion that matters most here is negative: the publish log must never
 * carry the `snapshot` payload to the client. The rest covers the canonical
 * double-wrapped pagination envelope, cursor opacity, and the lapsed-community
 * admin-read gate.
 *
 * The route delegates the query to `paginateSitePublishHistory` (ADR-003), so
 * the service is what gets stubbed here. The service's own "snapshot never
 * escapes" mapping is covered in
 * `__tests__/lib/services/site-blocks-service.test.ts`; this file additionally
 * feeds a payload-bearing row THROUGH the stub to prove the route cannot leak
 * one either.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireRoleMock,
  requirePlanFeatureMock,
  requireEntitledForAdminReadMock,
  paginateSitePublishHistoryMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn((_: unknown, id: number) => id),
  requireRoleMock: vi.fn(),
  requirePlanFeatureMock: vi.fn().mockResolvedValue(undefined),
  requireEntitledForAdminReadMock: vi.fn().mockResolvedValue(undefined),
  paginateSitePublishHistoryMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/api/role-guard', () => ({
  requireRole: requireRoleMock,
  PM_MANAGER_ROLES: ['property_manager', 'root_manager'],
}));
vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: requireEntitledForAdminReadMock,
}));
vi.mock('@/lib/services/site-blocks-service', () => ({
  paginateSitePublishHistory: paginateSitePublishHistoryMock,
}));

import { GET } from '../../src/app/api/v1/pm/site/publish/history/route';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const PM_MEMBERSHIP = { role: 'property_manager', communityId: 1, isAdmin: true };

/**
 * A history entry as the service returns it — PLUS the raw columns a careless
 * future service change might let through (`snapshot`, `communityId`). The
 * route must emit neither: it maps an explicit field allowlist, not a spread.
 */
function historyEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    publishedAt: new Date('2026-06-01T12:00:00Z'),
    actorUserId: 'pm-1',
    changeCount: 2,
    changeLabels: ['Updated Text', 'Removed Faq'],
    restorable: true,
    // Deliberate poison — see above.
    communityId: 1,
    snapshot: {
      blocks: [
        { blockOrder: 1, blockType: 'hero', content: { headline: 'SECRET DRAFT HEADLINE' } },
      ],
    },
    ...overrides,
  };
}

function req(qs = '?communityId=1'): NextRequest {
  return new NextRequest(`http://localhost/api/v1/pm/site/publish/history${qs}`);
}

interface HistoryEntry {
  id: number;
  publishedAt: string;
  actorUserId: string | null;
  changeCount: number;
  changeLabels: string[];
  restorable: boolean;
}

interface Envelope {
  data: {
    data: HistoryEntry[];
    pagination: { nextCursor: string | null; hasMore: boolean; pageSize: number };
  };
}

describe('GET /api/v1/pm/site/publish/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-1');
    requireCommunityMembershipMock.mockResolvedValue(PM_MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation((_: unknown, id: number) => id);
    requireRoleMock.mockReturnValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    requireEntitledForAdminReadMock.mockResolvedValue(undefined);
    paginateSitePublishHistoryMock.mockResolvedValue({
      data: [historyEntry()],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
  });

  it('returns the canonical double-wrapped paginated envelope', async () => {
    const res = await GET(req());

    expect(res.status).toBe(200);
    const json = (await res.json()) as Envelope;
    expect(Array.isArray(json.data.data)).toBe(true);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });
    expect(json.data.data[0]).toMatchObject({
      id: 11,
      publishedAt: '2026-06-01T12:00:00.000Z',
      actorUserId: 'pm-1',
      changeCount: 2,
      changeLabels: ['Updated Text', 'Removed Faq'],
      restorable: true,
    });
  });

  it('NEVER returns the snapshot payload', async () => {
    const res = await GET(req());
    const json = (await res.json()) as Envelope;

    expect(json.data.data[0]).not.toHaveProperty('snapshot');
    // Belt and braces: the payload's content must not appear anywhere in the
    // serialized body, however it might have been nested or spread.
    const body = JSON.stringify(json);
    expect(body).not.toContain('SECRET DRAFT HEADLINE');
    expect(body).not.toContain('snapshot');
  });

  it('surfaces a retention-pruned entry as not restorable, still listed', async () => {
    paginateSitePublishHistoryMock.mockResolvedValue({
      data: [historyEntry({ id: 4, snapshot: null, restorable: false })],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const res = await GET(req());
    const json = (await res.json()) as Envelope;

    // The log row survives its payload — that is the whole retention design.
    expect(json.data.data).toHaveLength(1);
    expect(json.data.data[0]).toMatchObject({ id: 4, restorable: false });
  });

  it('echoes the opaque cursor back and hands it to paginate untouched', async () => {
    const cursor = 'eyJpZCI6MTF9';
    paginateSitePublishHistoryMock.mockResolvedValue({
      data: [historyEntry()],
      pagination: { nextCursor: cursor, hasMore: true, pageSize: 25 },
    });

    const res = await GET(req(`?communityId=1&cursor=${cursor}&pageSize=25`));
    const json = (await res.json()) as Envelope;

    expect(paginateSitePublishHistoryMock).toHaveBeenCalledWith({
      communityId: 1,
      cursor,
      pageSize: 25,
    });
    expect(json.data.pagination.nextCursor).toBe(cursor);
    expect(json.data.pagination.hasMore).toBe(true);
  });

  it('treats empty-string cursor/pageSize as absent rather than 400ing', async () => {
    const res = await GET(req('?communityId=1&cursor=&pageSize='));

    expect(res.status).toBe(200);
    expect(paginateSitePublishHistoryMock).toHaveBeenCalledWith({
      communityId: 1,
      cursor: undefined,
      pageSize: undefined,
    });
  });

  it('runs the PM gate: membership, PM role, and the site-editor plan feature', async () => {
    await GET(req());

    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(1, 'pm-1');
    expect(requireRoleMock).toHaveBeenCalledWith(
      PM_MEMBERSHIP,
      ['property_manager', 'root_manager'],
      expect.any(String),
    );
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(1, 'hasSiteEditor');
  });

  it('refuses a resident (role guard rejects) without reading any history', async () => {
    requireRoleMock.mockImplementation(() => {
      throw new ForbiddenError('Only property managers can view the publish history');
    });

    const res = await GET(req());

    expect(res.status).toBe(403);
    expect(paginateSitePublishHistoryMock).not.toHaveBeenCalled();
  });

  it('refuses a lapsed community via requireEntitledForAdminRead', async () => {
    const { AppError } = await import('../../src/lib/api/errors/AppError');
    requireEntitledForAdminReadMock.mockRejectedValue(
      new AppError('lapsed', 403, 'SUBSCRIPTION_REQUIRED'),
    );

    const res = await GET(req());

    expect(res.status).toBe(403);
    expect(requireEntitledForAdminReadMock).toHaveBeenCalledWith(1, PM_MEMBERSHIP);
    // The gate runs BEFORE the read, so a lapsed community's history is never
    // even loaded.
    expect(paginateSitePublishHistoryMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing communityId', async () => {
    const res = await GET(req(''));
    expect(res.status).toBe(400);
    expect(paginateSitePublishHistoryMock).not.toHaveBeenCalled();
  });

  it('scopes the read to the effective community', async () => {
    resolveEffectiveCommunityIdMock.mockReturnValue(3);
    await GET(req('?communityId=1'));
    expect(paginateSitePublishHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 3 }),
    );
  });
});
