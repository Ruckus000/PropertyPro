import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Sentry mock — required because we use the real withErrorHandler below
// (so UnauthorizedError translates to a 401 response). withErrorHandler
// imports @sentry/nextjs; mock it to avoid a real network call.
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn((cb: (scope: unknown) => void) =>
    cb({ setTag: vi.fn(), setUser: vi.fn() }),
  ),
  captureException: vi.fn(),
}));

const {
  getFeaturedForRoleMock,
  filterArticlesByFeaturesMock,
  getFeaturesForCommunityMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
} = vi.hoisted(() => ({
  getFeaturedForRoleMock: vi.fn(),
  filterArticlesByFeaturesMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
}));

vi.mock('@/lib/services/help-article-service', () => ({
  getFeaturedForRole: getFeaturedForRoleMock,
  filterArticlesByFeatures: filterArticlesByFeaturesMock,
}));

vi.mock('@propertypro/shared', () => ({
  getFeaturesForCommunity: getFeaturesForCommunityMock,
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

// NOTE: withErrorHandler is NOT mocked — using the real implementation
// lets thrown errors (UnauthorizedError, NotFoundError, etc.) translate
// to the correct HTTP status codes.

import { GET } from '../../src/app/api/v1/help/featured/route';

describe('GET /api/v1/help/featured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'owner',
      presetKey: null,
      communityType: 'condo_718',
    });
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    getFeaturesForCommunityMock.mockReturnValue({});
    // Identity by default — articles pass through unfiltered
    filterArticlesByFeaturesMock.mockImplementation((articles: unknown[]) => articles);
  });

  it('returns the featured-for-role list', async () => {
    getFeaturedForRoleMock.mockReturnValue([
      { title: 'Welcome', category: 'getting-started', slug: 'welcome', description: 'Get started', roles: ['owner'], keywords: [], relatedArticles: [], featured: true },
    ]);
    const res = await GET(
      new NextRequest(new URL('/api/v1/help/featured?communityId=1', 'http://localhost:3000')),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].slug).toBe('welcome');
    expect(getFeaturedForRoleMock).toHaveBeenCalledWith('owner');
  });

  it('returns an empty array when no featured articles match the role', async () => {
    getFeaturedForRoleMock.mockReturnValue([]);
    const res = await GET(
      new NextRequest(new URL('/api/v1/help/featured?communityId=1', 'http://localhost:3000')),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns 401 when the session is not authenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors/UnauthorizedError');
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await GET(
      new NextRequest(new URL('/api/v1/help/featured?communityId=1', 'http://localhost:3000')),
    );
    expect(res.status).toBe(401);
  });

  it('excludes feature-gated articles from the featured list', async () => {
    const gatedArticle = { title: 'E-Vote', category: 'voting', slug: 'e-vote', description: 'E-voting guide', roles: ['owner'], keywords: [], relatedArticles: [], featured: true };
    getFeaturedForRoleMock.mockReturnValue([gatedArticle]);
    // filterArticlesByFeatures strips the gated article for this community
    filterArticlesByFeaturesMock.mockReturnValue([]);
    const res = await GET(
      new NextRequest(new URL('/api/v1/help/featured?communityId=1', 'http://localhost:3000')),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(filterArticlesByFeaturesMock).toHaveBeenCalledWith([gatedArticle], {});
  });
});
