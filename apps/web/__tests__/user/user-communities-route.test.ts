/**
 * Route unit test — `GET /api/v1/user/communities`.
 *
 * Added alongside Plan A1 drain #24. First drain in the corpus with no
 * community scoping; the contract declares no request schemas at all.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireAuthenticatedUserIdMock, countCommunitiesForUserMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  countCommunitiesForUserMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/user-communities', () => ({
  countCommunitiesForUser: countCommunitiesForUserMock,
}));

import { GET } from '../../src/app/api/v1/user/communities/route';

describe('GET /api/v1/user/communities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  });

  it('returns the community count for an authenticated user', async () => {
    countCommunitiesForUserMock.mockResolvedValue(3);

    const req = new NextRequest('http://localhost:3000/api/v1/user/communities');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(countCommunitiesForUserMock).toHaveBeenCalledWith('user-1');
    await expect(res.json()).resolves.toEqual({ data: { count: 3 } });
  });

  it('returns zero when the user belongs to no communities', async () => {
    countCommunitiesForUserMock.mockResolvedValue(0);

    const req = new NextRequest('http://localhost:3000/api/v1/user/communities');
    const res = await GET(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { count: 0 } });
  });

  it('returns 401 when the user is not authenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors');
    requireAuthenticatedUserIdMock.mockRejectedValue(
      new UnauthorizedError('Not authenticated'),
    );

    const req = new NextRequest('http://localhost:3000/api/v1/user/communities');
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(countCommunitiesForUserMock).not.toHaveBeenCalled();
  });
});
