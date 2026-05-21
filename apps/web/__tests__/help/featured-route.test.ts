import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getFeaturedForRoleMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
} = vi.hoisted(() => ({
  getFeaturedForRoleMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
}));

vi.mock('@/lib/services/help-article-service', () => ({
  getFeaturedForRole: getFeaturedForRoleMock,
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

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

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
});
