import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors/AppError';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  upsertPublishedBlockMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  listSiteBlocksMock,
} = vi.hoisted(() => ({
  upsertPublishedBlockMock: vi.fn().mockResolvedValue(undefined),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  listSiteBlocksMock: vi.fn(),
}));

vi.mock('@/lib/services/site-blocks-service', () => ({
  upsertPublishedBlock: upsertPublishedBlockMock,
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

// NOTE: @propertypro/shared is NOT mocked — the real Zod schemas run so that
// invalid-content tests genuinely fail at validation.

import { GET, PATCH } from '@/app/api/v1/pm/site/blocks/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(communityId: number | string = 42): NextRequest {
  return new NextRequest(`http://localhost/api/v1/pm/site/blocks?communityId=${communityId}`);
}

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/blocks', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// GET /api/v1/pm/site/blocks
// ---------------------------------------------------------------------------

describe('GET /api/v1/pm/site/blocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'pm_admin', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
  });

  it('200s and returns the ordered block list', async () => {
    const publishedAt = new Date('2026-05-15T10:00:00Z');
    // PR #8e — reader now returns isDraft + publishedAt on every row.
    const rawBlocks = [
      { id: 2, blockType: 'text', blockOrder: 2, content: { body: 'Hello' }, isDraft: false, publishedAt },
      { id: 3, blockType: 'image', blockOrder: 3, content: { imagePath: '42/content/img.webp', altText: 'Alt' }, isDraft: true, publishedAt: null },
      { id: 4, blockType: 'announcements', blockOrder: 4, content: { limit: 3 }, isDraft: false, publishedAt },
    ];
    listSiteBlocksMock.mockResolvedValueOnce(rawBlocks);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    // Route serializes publishedAt to ISO string (null preserved).
    expect(await res.json()).toEqual({
      data: {
        blocks: [
          { id: 2, blockType: 'text', blockOrder: 2, content: { body: 'Hello' }, isDraft: false, publishedAt: publishedAt.toISOString() },
          { id: 3, blockType: 'image', blockOrder: 3, content: { imagePath: '42/content/img.webp', altText: 'Alt' }, isDraft: true, publishedAt: null },
          { id: 4, blockType: 'announcements', blockOrder: 4, content: { limit: 3 }, isDraft: false, publishedAt: publishedAt.toISOString() },
        ],
      },
    });
  });

  it('passes includeDrafts: true to the reader so the editor sees the merged view', async () => {
    listSiteBlocksMock.mockResolvedValueOnce([]);
    await GET(makeGetRequest());
    expect(listSiteBlocksMock).toHaveBeenCalledWith({ includeDrafts: true });
  });

  it('200s and returns empty blocks array when no blocks exist', async () => {
    listSiteBlocksMock.mockResolvedValueOnce([]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { blocks: [] } });
  });

  it('400s when communityId query param is missing', async () => {
    const req = new NextRequest('http://localhost/api/v1/pm/site/blocks');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(listSiteBlocksMock).not.toHaveBeenCalled();
  });

  it('400s when communityId is not a positive integer', async () => {
    const res = await GET(makeGetRequest('abc'));
    expect(res.status).toBe(400);
    expect(listSiteBlocksMock).not.toHaveBeenCalled();
  });

  it('403s when caller does not hold pm_admin role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
    expect(listSiteBlocksMock).not.toHaveBeenCalled();
  });

  it('allows CAM managers to list site blocks', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'property_manager', communityId: 42 });
    listSiteBlocksMock.mockResolvedValueOnce([]);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    expect(listSiteBlocksMock).toHaveBeenCalled();
  });

  it('403s when caller is not a member of the community', async () => {
    requireMembershipMock.mockRejectedValueOnce(
      new AppError('Not a member', 403, 'FORBIDDEN'),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
    expect(listSiteBlocksMock).not.toHaveBeenCalled();
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(
      new AppError('Unauthorized', 401, 'UNAUTHORIZED'),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    expect(listSiteBlocksMock).not.toHaveBeenCalled();
  });

  it('403s when plan does not include hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new AppError('This feature requires a higher plan.', 403, 'PLAN_UPGRADE_REQUIRED'),
    );
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
    expect(listSiteBlocksMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/pm/site/blocks
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/pm/site/blocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'pm_admin', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
  });

  const VALID_TEXT_BODY = {
    communityId: 42,
    blockType: 'text' as const,
    blockOrder: 2,
    content: { body: 'Hello world' },
  };

  const VALID_IMAGE_BODY = {
    communityId: 42,
    blockType: 'image' as const,
    blockOrder: 3,
    content: { imagePath: '42/content/photo.webp', altText: 'A scenic view' },
  };

  it('200s with text block and calls upsertPublishedBlock with correct args', async () => {
    const res = await PATCH(makePatchRequest(VALID_TEXT_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(upsertPublishedBlockMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'text',
      blockOrder: 2,
      content: { body: 'Hello world' },
      isDraft: true,
    });
  });

  it('200s with image block (altText present) and calls upsertPublishedBlock', async () => {
    const res = await PATCH(makePatchRequest(VALID_IMAGE_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(upsertPublishedBlockMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
      blockType: 'image',
      blockOrder: 3,
      content: { imagePath: '42/content/photo.webp', altText: 'A scenic view' },
      isDraft: true,
    });
  });

  it('200s with decorative image block (no altText)', async () => {
    const body = {
      ...VALID_IMAGE_BODY,
      content: { imagePath: '42/content/banner.webp', decorative: true },
    };
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(200);
    expect(upsertPublishedBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: { imagePath: '42/content/banner.webp', decorative: true } }),
    );
  });

  it('PATCHes an announcements block (validates via announcementsBlockSchema)', async () => {
    const body = {
      communityId: 42,
      blockType: 'announcements',
      blockOrder: 4,
      content: { limit: 5, timeWindowDays: 30 },
    };
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(200);
    expect(upsertPublishedBlockMock).toHaveBeenCalledWith(expect.objectContaining({
      blockType: 'announcements',
      blockOrder: 4,
      content: { limit: 5, timeWindowDays: 30 },
    }));
  });

  it('PATCHes a documents block (validates via documentsBlockSchema)', async () => {
    const body = {
      communityId: 42,
      blockType: 'documents',
      blockOrder: 5,
      content: { limit: 5, includeCategories: ['budget', 'minutes'] },
    };
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(200);
    expect(upsertPublishedBlockMock).toHaveBeenCalledWith(expect.objectContaining({
      blockType: 'documents',
      blockOrder: 5,
      content: { limit: 5, includeCategories: ['budget', 'minutes'] },
    }));
  });

  it('PATCHes a meetings block (validates via meetingsBlockSchema)', async () => {
    const body = {
      communityId: 42,
      blockType: 'meetings',
      blockOrder: 6,
      content: { limit: 10, timeWindowDays: 30 },
    };
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(200);
    expect(upsertPublishedBlockMock).toHaveBeenCalledWith(expect.objectContaining({
      blockType: 'meetings',
      blockOrder: 6,
      content: { limit: 10, timeWindowDays: 30 },
    }));
  });

  it('PATCHes a contact block (validates via contactBlockSchema)', async () => {
    const body = {
      communityId: 42,
      blockType: 'contact',
      blockOrder: 7,
      content: { showBoard: true, showManagement: false },
    };
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(200);
    expect(upsertPublishedBlockMock).toHaveBeenCalledWith(expect.objectContaining({
      blockType: 'contact',
      blockOrder: 7,
      content: { showBoard: true, showManagement: false },
    }));
  });

  it('PATCHes a faq block (Pro+) and enforces hasSitePolishBlocks', async () => {
    const body = {
      communityId: 42,
      blockType: 'faq',
      blockOrder: 8,
      content: { items: [{ question: 'When are meetings?', answer: 'Quarterly.' }] },
    };
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(200);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasSitePolishBlocks');
    expect(upsertPublishedBlockMock).toHaveBeenCalledWith(expect.objectContaining({
      blockType: 'faq',
      blockOrder: 8,
      content: { items: [{ question: 'When are meetings?', answer: 'Quarterly.' }] },
    }));
  });

  it('PATCHes an amenities block (Pro+) and enforces hasSitePolishBlocks', async () => {
    const body = {
      communityId: 42,
      blockType: 'amenities',
      blockOrder: 9,
      content: { items: [{ name: 'Heated Pool', description: 'Open daily.' }] },
    };
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(200);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasSitePolishBlocks');
    expect(upsertPublishedBlockMock).toHaveBeenCalledWith(expect.objectContaining({
      blockType: 'amenities',
      blockOrder: 9,
    }));
  });

  it('PATCHes a gallery block (Pro+) and enforces hasSitePolishBlocks', async () => {
    const body = {
      communityId: 42,
      blockType: 'gallery',
      blockOrder: 10,
      content: { images: [{ imagePath: '42/content/pool.webp', altText: 'The pool' }] },
    };
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(200);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasSitePolishBlocks');
    expect(upsertPublishedBlockMock).toHaveBeenCalledWith(expect.objectContaining({
      blockType: 'gallery',
      blockOrder: 10,
    }));
  });

  it('403s a faq block when the plan lacks hasSitePolishBlocks (but has hasSiteEditor)', async () => {
    requirePlanFeatureMock.mockImplementation((_id: number, key: string) =>
      key === 'hasSitePolishBlocks'
        ? Promise.reject(new AppError('This feature requires the Professional plan or higher.', 403, 'PLAN_UPGRADE_REQUIRED'))
        : Promise.resolve(undefined),
    );
    const body = {
      communityId: 42,
      blockType: 'faq',
      blockOrder: 8,
      content: { items: [{ question: 'Q?', answer: 'A.' }] },
    };
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(403);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });

  it('does NOT enforce hasSitePolishBlocks for non-polish (text) blocks', async () => {
    await PATCH(makePatchRequest(VALID_TEXT_BODY));
    expect(requirePlanFeatureMock).not.toHaveBeenCalledWith(42, 'hasSitePolishBlocks');
  });

  it('400s on invalid text content (missing required body field)', async () => {
    const body = { ...VALID_TEXT_BODY, content: {} }; // body field is required
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(400);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });

  it('400s on invalid image content (altText missing without decorative)', async () => {
    const body = {
      ...VALID_IMAGE_BODY,
      content: { imagePath: '42/content/photo.webp' }, // no altText, no decorative
    };
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(400);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });

  it('400s on invalid contact content (unknown fields are rejected)', async () => {
    const body = {
      communityId: 42,
      blockType: 'contact',
      blockOrder: 7,
      content: { showBoard: true, showManagement: true, exposeBoardEmails: true },
    };
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(400);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });

  it('400s when blockOrder=1 (reserved for hero block)', async () => {
    const res = await PATCH(makePatchRequest({ ...VALID_TEXT_BODY, blockOrder: 1 }));
    expect(res.status).toBe(400);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });

  it('400s when blockType is "hero" (rejected by enum — use /pm/site/hero instead)', async () => {
    const res = await PATCH(
      makePatchRequest({ ...VALID_TEXT_BODY, blockType: 'hero', blockOrder: 2 }),
    );
    expect(res.status).toBe(400);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });

  it('400s when communityId is missing', async () => {
    const { communityId: _, ...body } = VALID_TEXT_BODY;
    const res = await PATCH(makePatchRequest(body));
    expect(res.status).toBe(400);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });

  it('400s when communityId is not a positive integer', async () => {
    const res = await PATCH(makePatchRequest({ ...VALID_TEXT_BODY, communityId: -1 }));
    expect(res.status).toBe(400);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });

  it('403s when caller does not hold pm_admin role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await PATCH(makePatchRequest(VALID_TEXT_BODY));
    expect(res.status).toBe(403);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });

  it('allows CAM managers to upsert site blocks', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'property_manager', communityId: 42 });
    const res = await PATCH(makePatchRequest(VALID_TEXT_BODY));
    expect(res.status).toBe(200);
    expect(upsertPublishedBlockMock).toHaveBeenCalledWith(expect.objectContaining({ blockType: 'text' }));
  });

  it('403s when caller is not a member of the community', async () => {
    requireMembershipMock.mockRejectedValueOnce(
      new AppError('Not a member', 403, 'FORBIDDEN'),
    );
    const res = await PATCH(makePatchRequest(VALID_TEXT_BODY));
    expect(res.status).toBe(403);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(
      new AppError('Unauthorized', 401, 'UNAUTHORIZED'),
    );
    const res = await PATCH(makePatchRequest(VALID_TEXT_BODY));
    expect(res.status).toBe(401);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });

  it('403s when plan does not include hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new AppError('This feature requires a higher plan.', 403, 'PLAN_UPGRADE_REQUIRED'),
    );
    const res = await PATCH(makePatchRequest(VALID_TEXT_BODY));
    expect(res.status).toBe(403);
    expect(upsertPublishedBlockMock).not.toHaveBeenCalled();
  });
});
