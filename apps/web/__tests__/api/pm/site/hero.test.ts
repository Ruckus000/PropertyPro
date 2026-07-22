import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  upsertMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  listSiteBlocksMock,
} = vi.hoisted(() => ({
  upsertMock: vi.fn().mockResolvedValue(undefined),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  listSiteBlocksMock: vi.fn(),
}));

vi.mock('@/lib/services/site-blocks-service', () => ({
  upsertPublishedHero: upsertMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listSiteBlocks: listSiteBlocksMock,
    listAnnouncements: vi.fn().mockResolvedValue([]),
    listDocuments: vi.fn().mockResolvedValue([]),
    listMeetings: vi.fn().mockResolvedValue([]),
    getContactInfo: vi.fn().mockResolvedValue(null),
  }),
}));

import { GET, PATCH } from '@/app/api/v1/pm/site/hero/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/hero', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PATCH /api/v1/pm/site/hero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
  });

  const VALID_BODY = {
    communityId: 42,
    headline: 'Welcome',
    subtitle: 'Hello.',
    ctaText: 'Login',
    ctaTarget: '/auth/login',
  };

  it('200s and calls upsertPublishedHero with the parsed hero content (sans communityId)', async () => {
    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(upsertMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
      content: {
        headline: 'Welcome',
        subtitle: 'Hello.',
        ctaText: 'Login',
        ctaTarget: '/auth/login',
      },
      isDraft: true,
    });
  });

  it('400s when communityId is missing', async () => {
    const { communityId: _, ...body } = VALID_BODY;
    const res = await PATCH(makeRequest(body));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('400s when communityId is not a positive integer', async () => {
    const res = await PATCH(makeRequest({ ...VALID_BODY, communityId: -1 }));
    expect(res.status).toBe(400);
  });

  it('400s when hero content is invalid (missing headline)', async () => {
    const { headline: _, ...body } = VALID_BODY;
    const res = await PATCH(makeRequest(body));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('400s on protocol-relative ctaTarget (Task 1 fix carries through)', async () => {
    const res = await PATCH(makeRequest({ ...VALID_BODY, ctaTarget: '//evil.com' }));
    expect(res.status).toBe(400);
  });

  it('401s when unauthenticated (withErrorHandler maps to 401)', async () => {
    requireAuthMock.mockRejectedValueOnce(
      new AppError('Unauthorized', 401, 'UNAUTHORIZED'),
    );
    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('403s when caller does not hold pm_admin role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('allows CAM managers to update the hero block', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'property_manager', communityId: 42 });
    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'user-1' }));
  });

  it('403s when caller is not a member of the community', async () => {
    requireMembershipMock.mockRejectedValueOnce(
      new AppError('Not a member', 403, 'FORBIDDEN'),
    );
    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('403s when plan does not include hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new AppError('This feature requires a higher plan.', 403, 'PLAN_UPGRADE_REQUIRED'),
    );
    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('400s when heroImagePath references a different community', async () => {
    const res = await PATCH(
      makeRequest({
        ...VALID_BODY,
        heroImagePath: '999/hero/sneaky.webp',
        heroImageAlt: 'cross-tenant',
      }),
    );
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('200s when heroImagePath matches the editing community', async () => {
    const res = await PATCH(
      makeRequest({
        ...VALID_BODY,
        heroImagePath: '42/hero/ours.webp',
        heroImageAlt: 'in-tenant',
      }),
    );
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ heroImagePath: '42/hero/ours.webp' }),
      }),
    );
  });
});

describe('GET /api/v1/pm/site/hero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
  });

  function makeGetRequest(communityId: number | string = 42): NextRequest {
    return new NextRequest(`http://localhost/api/v1/pm/site/hero?communityId=${communityId}`);
  }

  it('returns the current hero content (with isDraft + publishedAt metadata)', async () => {
    const publishedAt = new Date('2026-05-15T10:00:00Z');
    listSiteBlocksMock.mockResolvedValueOnce([
      { id: 1, blockType: 'hero', blockOrder: 1, content: { headline: 'H' }, isDraft: false, publishedAt },
    ]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { hero: { headline: 'H' }, isDraft: false, publishedAt: publishedAt.toISOString() },
    });
  });

  it('returns the draft hero when one exists (PR #8e merged view)', async () => {
    listSiteBlocksMock.mockResolvedValueOnce([
      { id: 9, blockType: 'hero', blockOrder: 1, content: { headline: 'Draft H' }, isDraft: true, publishedAt: null },
    ]);
    const res = await GET(makeGetRequest());
    expect(await res.json()).toEqual({
      data: { hero: { headline: 'Draft H' }, isDraft: true, publishedAt: null },
    });
  });

  it('passes includeDrafts: true to the reader', async () => {
    listSiteBlocksMock.mockResolvedValueOnce([]);
    await GET(makeGetRequest());
    expect(listSiteBlocksMock).toHaveBeenCalledWith({ includeDrafts: true });
  });

  it('returns hero:null when no hero block exists', async () => {
    listSiteBlocksMock.mockResolvedValueOnce([]);
    const res = await GET(makeGetRequest());
    expect(await res.json()).toEqual({ data: { hero: null, isDraft: false, publishedAt: null } });
  });

  it('skips non-hero blocks when finding the hero', async () => {
    const publishedAt = new Date('2026-05-15T10:00:00Z');
    listSiteBlocksMock.mockResolvedValueOnce([
      { id: 2, blockType: 'announcements', blockOrder: 1, content: {}, isDraft: false, publishedAt },
      { id: 3, blockType: 'hero', blockOrder: 2, content: { headline: 'H2' }, isDraft: false, publishedAt },
    ]);
    const res = await GET(makeGetRequest());
    expect(await res.json()).toEqual({
      data: { hero: { headline: 'H2' }, isDraft: false, publishedAt: publishedAt.toISOString() },
    });
  });

  it('400s when communityId query param is missing', async () => {
    const req = new NextRequest('http://localhost/api/v1/pm/site/hero');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('400s when communityId is not a positive integer', async () => {
    const res = await GET(makeGetRequest('abc'));
    expect(res.status).toBe(400);
  });

  it('403s when caller does not hold pm_admin role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it('allows CAM managers to read the hero block', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'property_manager', communityId: 42 });
    listSiteBlocksMock.mockResolvedValueOnce([]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
  });

  it('403s when caller is not a member of the community', async () => {
    requireMembershipMock.mockRejectedValueOnce(
      new AppError('Not a member', 403, 'FORBIDDEN'),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it('403s when plan does not include hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new AppError('plan upgrade required', 403, 'PLAN_UPGRADE_REQUIRED'),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(
      new AppError('Unauthorized', 401, 'UNAUTHORIZED'),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });
});
