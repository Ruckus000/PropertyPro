import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  headersMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  headersMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

describe('page auth and community context helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('reads forwarded user headers without calling Supabase auth', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        'x-user-id': 'user-123',
        'x-user-email': 'jane@example.com',
        'x-user-full-name': 'Jane Doe',
        'x-user-phone': '+13055550123',
      }),
    );

    const { requirePageAuthenticatedUser } = await import(
      '../../src/lib/request/page-auth-context'
    );

    await expect(requirePageAuthenticatedUser()).resolves.toEqual({
      id: 'user-123',
      email: 'jane@example.com',
      fullName: 'Jane Doe',
      phone: '+13055550123',
      user_metadata: {
        full_name: 'Jane Doe',
      },
    });
  });

  it('resolves community membership from forwarded headers', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        'x-user-id': 'user-123',
        'x-community-id': '42',
      }),
    );
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 42,
      communityName: 'Sunset Condos',
      role: 'manager',
      communityType: 'condo_718',
      timezone: 'America/New_York',
      isUnitOwner: false,
      isAdmin: true,
      displayTitle: 'Manager',
      city: 'Miami',
      state: 'FL',
      isDemo: false,
    });

    const { requirePageCommunityMembership } = await import(
      '../../src/lib/request/page-community-context'
    );

    await requirePageCommunityMembership();

    expect(requireCommunityMembershipMock).toHaveBeenCalledTimes(1);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-123');
  });
});
