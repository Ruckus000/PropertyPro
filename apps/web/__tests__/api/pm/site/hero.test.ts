import { describe, it, expect, vi, beforeEach } from 'vitest';

// A demo in its grace window is read-only; these tests run as a normal
// community unless a case says otherwise.
const assertNotDemoGraceMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';
import { NotFoundError } from '@/lib/api/errors';

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
  getHomePageIdMock,
} = vi.hoisted(() => ({
  upsertMock: vi.fn().mockResolvedValue(undefined),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  listSiteBlocksMock: vi.fn(),
  getHomePageIdMock: vi.fn().mockResolvedValue(1),
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
    // Phase 11b: the hero lives on the HOME page only, so the route resolves it
    // and filters. Null would mean a community with no page row at all.
    getHomePageId: getHomePageIdMock,
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
    // Reset, not just clear: a one-shot value a case did not consume must not
    // leak into the next case.
    listSiteBlocksMock.mockReset().mockResolvedValue([]);
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

  // Phase 9: the same control has to cover `photos[]`. It is invisible from
  // the schema — imagePathSchema only enforces `{numeric}/{kind}/...` and does
  // NOT bind the leading segment to the editing community — so a new
  // path-bearing field is exactly how this check gets lost.
  it('400s when any photo references a different community', async () => {
    const res = await PATCH(
      makeRequest({
        ...VALID_BODY,
        photos: [
          { path: '42/hero/ours.webp', alt: 'ours' },
          { path: '999/hero/sneaky.webp', alt: 'theirs' },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('names the offending photo by index so the error is actionable', async () => {
    const res = await PATCH(
      makeRequest({
        ...VALID_BODY,
        photos: [
          { path: '42/hero/ours.webp', alt: 'ours' },
          { path: '999/hero/sneaky.webp', alt: 'theirs' },
        ],
      }),
    );
    const body = await res.json();
    expect(JSON.stringify(body)).toContain('photos.1.path');
  });

  it('200s when every photo belongs to the editing community', async () => {
    const res = await PATCH(
      makeRequest({
        ...VALID_BODY,
        photos: [
          { path: '42/hero/one.webp', alt: 'One' },
          { path: '42/hero/two.webp', decorative: true },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalled();
  });

  it('400s on a photo with neither alt text nor a decorative flag', async () => {
    const res = await PATCH(
      makeRequest({ ...VALID_BODY, photos: [{ path: '42/hero/one.webp' }] }),
    );
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  // The website home's Edit words / Change photo: `live: true` writes the
  // published row, and a hero draft, if any, gets the same content so a later
  // editor publish cannot bring the older words back.
  describe('live', () => {
    const CONTENT = {
      headline: 'Welcome',
      subtitle: 'Hello.',
      ctaText: 'Login',
      ctaTarget: '/auth/login',
    };

    it('writes the published hero, not a draft, when live is true', async () => {
      listSiteBlocksMock.mockResolvedValueOnce([
        { id: 1, blockType: 'hero', blockOrder: 1, content: CONTENT, isDraft: false, publishedAt: new Date() },
      ]);
      const res = await PATCH(makeRequest({ ...VALID_BODY, live: true }));
      expect(res.status).toBe(200);
      expect(upsertMock).toHaveBeenCalledTimes(1);
      expect(upsertMock).toHaveBeenCalledWith({
        communityId: 42,
        actorUserId: 'user-1',
        content: CONTENT,
        isDraft: false,
      });
    });

    it('overwrites an existing hero draft with the same content', async () => {
      listSiteBlocksMock.mockResolvedValueOnce([
        { id: 9, blockType: 'hero', blockOrder: 1, content: { headline: 'Old draft' }, isDraft: true, publishedAt: null },
      ]);
      const res = await PATCH(makeRequest({ ...VALID_BODY, live: true }));
      expect(res.status).toBe(200);
      expect(upsertMock).toHaveBeenCalledTimes(2);
      expect(upsertMock.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ content: CONTENT, isDraft: false }),
      );
      expect(upsertMock.mock.calls[1]?.[0]).toEqual(
        expect.objectContaining({ content: CONTENT, isDraft: true }),
      );
      // The draft is looked for on the home page only.
      expect(listSiteBlocksMock).toHaveBeenCalledWith({ includeDrafts: true, pageId: 1 });
    });

    it('ignores a draft of another section type when looking for a hero draft', async () => {
      listSiteBlocksMock.mockResolvedValueOnce([
        { id: 4, blockType: 'announcements', blockOrder: 2, content: {}, isDraft: true, publishedAt: null },
      ]);
      await PATCH(makeRequest({ ...VALID_BODY, live: true }));
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });

    it('writes only the draft when live is false, as the editor does', async () => {
      const res = await PATCH(makeRequest({ ...VALID_BODY, live: false }));
      expect(res.status).toBe(200);
      expect(upsertMock).toHaveBeenCalledTimes(1);
      expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ content: CONTENT, isDraft: true }));
      expect(listSiteBlocksMock).not.toHaveBeenCalled();
    });

    it('400s when live is not a boolean', async () => {
      const res = await PATCH(makeRequest({ ...VALID_BODY, live: 'yes' }));
      expect(res.status).toBe(400);
      expect(upsertMock).not.toHaveBeenCalled();
    });

    it('keeps the cross-community photo check on a live save', async () => {
      const res = await PATCH(
        makeRequest({ ...VALID_BODY, live: true, photos: [{ path: '999/hero/sneaky.webp', alt: 'theirs' }] }),
      );
      expect(res.status).toBe(400);
      expect(upsertMock).not.toHaveBeenCalled();
    });

    it('403s a live save from a resident, writing nothing', async () => {
      requireMembershipMock.mockResolvedValueOnce({ role: 'resident', communityId: 42 });
      const res = await PATCH(makeRequest({ ...VALID_BODY, live: true }));
      expect(res.status).toBe(403);
      expect(upsertMock).not.toHaveBeenCalled();
    });

    it('401s a live save when unauthenticated', async () => {
      requireAuthMock.mockRejectedValueOnce(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
      const res = await PATCH(makeRequest({ ...VALID_BODY, live: true }));
      expect(res.status).toBe(401);
      expect(upsertMock).not.toHaveBeenCalled();
    });
  });

  it('404s when the body community disagrees with the request header, writing nothing', async () => {
    resolveEffectiveCommunityIdMock.mockImplementationOnce(() => {
      throw new NotFoundError('Community not found');
    });
    const res = await PATCH(makeRequest({ ...VALID_BODY, live: true }));
    expect(res.status).toBe(404);
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
    // Reset, not just clear: a one-shot value a case did not consume must not
    // leak into the next case.
    listSiteBlocksMock.mockReset().mockResolvedValue([]);
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

  it('scopes the read to the home page as well as passing includeDrafts', async () => {
    listSiteBlocksMock.mockResolvedValueOnce([]);
    await GET(makeGetRequest());
    expect(listSiteBlocksMock).toHaveBeenCalledWith({ includeDrafts: true, pageId: 1 });
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
