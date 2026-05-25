/**
 * Route unit test — `GET /api/v1/help/views`.
 *
 * Added alongside Plan A1 drain #26 (Move 2 bundle). Mirrors the
 * payments/history precedent (drain #25): mocks every service module
 * boundary and lets the real `withErrorHandler` + `runRoute` stack run so
 * the canonical envelope and status codes are asserted end-to-end.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  listViewedArticleSlugsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  listViewedArticleSlugsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/services/help-views-service', () => ({
  listViewedArticleSlugs: listViewedArticleSlugsMock,
}));

import { GET } from '../../src/app/api/v1/help/views/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

interface EnvelopeJson {
  data: { slugs: string[] };
}

interface ErrorJson {
  error: { code: string; message: string };
}

function buildReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

describe('GET /api/v1/help/views', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
  });

  it('returns viewed-article slugs — happy path', async () => {
    listViewedArticleSlugsMock.mockResolvedValue(['intro', 'compliance-basics']);

    const res = await GET(buildReq('http://localhost/api/v1/help/views?communityId=42'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toEqual({ slugs: ['intro', 'compliance-basics'] });
    expect(listViewedArticleSlugsMock).toHaveBeenCalledWith(42, 'user-1');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(buildReq('http://localhost/api/v1/help/views?communityId=42'));

    expect(res.status).toBe(401);
    expect(listViewedArticleSlugsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireCommunityMembership throws', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await GET(buildReq('http://localhost/api/v1/help/views?communityId=42'));

    expect(res.status).toBe(403);
    expect(listViewedArticleSlugsMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await GET(buildReq('http://localhost/api/v1/help/views'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is non-numeric', async () => {
    const res = await GET(buildReq('http://localhost/api/v1/help/views?communityId=abc'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with query communityId', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/help/views?communityId=42', {
        headers: { 'x-community-id': '99' },
      }),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(listViewedArticleSlugsMock).not.toHaveBeenCalled();
  });
});
