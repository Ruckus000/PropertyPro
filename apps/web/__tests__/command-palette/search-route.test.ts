import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  searchAccessibleGroupsMock,
  randomUUIDMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  searchAccessibleGroupsMock: vi.fn(),
  randomUUIDMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/search/data-search-service', () => ({
  searchAccessibleGroups: searchAccessibleGroupsMock,
}));

import { GET } from '../../src/app/api/v1/search/route';

describe('aggregated search route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    randomUUIDMock.mockReturnValue('req-123');
    vi.stubGlobal('crypto', { randomUUID: randomUUIDMock });
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-1',
      communityId: 42,
      role: 'manager',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
      displayTitle: 'Board Member',
      city: null,
      state: null,
      timezone: 'America/New_York',
      isDemo: false,
      trialEndsAt: null,
      demoExpiresAt: null,
      electionsAttorneyReviewed: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns stable aggregated search metadata and partial status', async () => {
    searchAccessibleGroupsMock.mockResolvedValue([
      {
        key: 'documents',
        label: 'Documents',
        status: 'ok',
        totalCount: 1,
        results: [],
        durationMs: 4,
      },
      {
        key: 'announcements',
        label: 'Announcements',
        status: 'error',
        totalCount: 0,
        results: [],
        error: 'Search is temporarily unavailable for this section.',
        durationMs: 5,
      },
    ]);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/v1/search?communityId=42&q=board&limit=5'),
    );
    const json = await response.json();

    expect(searchAccessibleGroupsMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ userId: 'user-1' }),
      'board',
      5,
    );
    expect(json).toMatchObject({
      requestId: 'req-123',
      communityId: 42,
      partial: true,
      groups: [
        { key: 'documents', status: 'ok' },
        { key: 'announcements', status: 'error' },
      ],
    });
  });
});
