/**
 * Route unit test — `GET /api/v1/help/contextual`.
 *
 * Added alongside Plan A1 drain #27 (Move 2 bundle). Asserts the auth chain,
 * the runner's canonical 400 envelope on missing/invalid query, and the
 * preset-vs-base role fallback in `effectiveRole`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  getContextualArticlesMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  getContextualArticlesMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/services/help-article-service', () => ({
  getContextualArticles: getContextualArticlesMock,
}));

import { GET } from '../../src/app/api/v1/help/contextual/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

const ARTICLE = {
  title: 'Compliance basics',
  description: 'Intro',
  category: 'Compliance',
  slug: 'compliance-basics',
  roles: ['resident'],
  readTimeMinutes: 5,
};

interface EnvelopeJson {
  data: Array<{ title: string; description: string; category: string; slug: string }>;
}

interface ErrorJson {
  error: { code: string; message: string };
}

function buildReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

describe('GET /api/v1/help/contextual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    getContextualArticlesMock.mockReturnValue([ARTICLE]);
  });

  it('returns contextual articles — happy path uses membership.role when no preset', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/help/contextual?path=/compliance&communityId=42'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toEqual([
      {
        title: 'Compliance basics',
        description: 'Intro',
        category: 'Compliance',
        slug: 'compliance-basics',
      },
    ]);
    expect(getContextualArticlesMock).toHaveBeenCalledWith('/compliance', 'resident', 3);
  });

  it('prefers membership.presetKey over base role for effectiveRole', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      ...MEMBERSHIP,
      presetKey: 'board_member',
    });

    const res = await GET(
      buildReq('http://localhost/api/v1/help/contextual?path=/compliance&communityId=42'),
    );

    expect(res.status).toBe(200);
    expect(getContextualArticlesMock).toHaveBeenCalledWith('/compliance', 'board_member', 3);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      buildReq('http://localhost/api/v1/help/contextual?path=/compliance&communityId=42'),
    );

    expect(res.status).toBe(401);
    expect(getContextualArticlesMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireCommunityMembership throws', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await GET(
      buildReq('http://localhost/api/v1/help/contextual?path=/compliance&communityId=42'),
    );

    expect(res.status).toBe(403);
    expect(getContextualArticlesMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when path is missing', async () => {
    const res = await GET(buildReq('http://localhost/api/v1/help/contextual?communityId=42'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when communityId is non-numeric', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/help/contextual?path=/compliance&communityId=abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
