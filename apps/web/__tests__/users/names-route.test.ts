import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveUserDisplayNamesMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveUserDisplayNamesMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/utils/resolve-users', () => ({
  resolveUserDisplayNames: resolveUserDisplayNamesMock,
}));

import { GET } from '../../src/app/api/v1/users/names/route';

describe('GET /api/v1/users/names', () => {
  it('returns display names for the requested user IDs', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('viewer-1');
    requireCommunityMembershipMock.mockResolvedValue({
      communityId: 42,
    });
    resolveUserDisplayNamesMock.mockResolvedValue(
      new Map([
        ['11111111-1111-4111-8111-111111111111', 'Alice Example'],
        ['22222222-2222-4222-8222-222222222222', 'Bob Example'],
      ]),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/users/names?communityId=42&ids=11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'viewer-1');
    expect(resolveUserDisplayNamesMock).toHaveBeenCalledWith(42, [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    await expect(res.json()).resolves.toEqual({
      data: {
        '11111111-1111-4111-8111-111111111111': 'Alice Example',
        '22222222-2222-4222-8222-222222222222': 'Bob Example',
      },
    });
  });
});
