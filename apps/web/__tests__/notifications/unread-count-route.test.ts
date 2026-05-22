/**
 * Route unit test — `GET /api/v1/notifications/unread-count`.
 *
 * Added alongside the Plan A1 drain (drain #5). Mirrors drain #2's
 * (`users/names`) test shape — query-only input, no audit log, single
 * scalar response wrapped as `{ data: { count } }` by the runner.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  countUnreadNotificationsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  countUnreadNotificationsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@propertypro/db', () => ({
  countUnreadNotifications: countUnreadNotificationsMock,
}));

import { GET } from '../../src/app/api/v1/notifications/unread-count/route';

describe('GET /api/v1/notifications/unread-count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('viewer-1');
    requireCommunityMembershipMock.mockResolvedValue({ communityId: 42 });
  });

  it('returns the unread count for a member', async () => {
    countUnreadNotificationsMock.mockResolvedValue(7);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/unread-count?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'viewer-1');
    expect(countUnreadNotificationsMock).toHaveBeenCalledWith(42, 'viewer-1');
    await expect(res.json()).resolves.toEqual({ data: { count: 7 } });
  });

  it('returns 0 when the user has no unread notifications', async () => {
    countUnreadNotificationsMock.mockResolvedValue(0);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/unread-count?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { count: 0 } });
  });

  it('returns 401 when the user is not authenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors');
    requireAuthenticatedUserIdMock.mockRejectedValue(
      new UnauthorizedError('Not authenticated'),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/unread-count?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(countUnreadNotificationsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not a member of the requested community', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('Not a member of this community'),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/unread-count?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(countUnreadNotificationsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/unread-count',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(countUnreadNotificationsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is non-positive', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/unread-count?communityId=-1',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(countUnreadNotificationsMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the x-community-id header disagrees with the query', async () => {
    // resolveEffectiveCommunityId throws NotFoundError on header/query mismatch,
    // matching the canonical auth-chain semantics established by the pilot.
    const req = new NextRequest(
      'http://localhost:3000/api/v1/notifications/unread-count?communityId=42',
      { headers: { 'x-community-id': '99' } },
    );
    const res = await GET(req);

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(countUnreadNotificationsMock).not.toHaveBeenCalled();
  });
});
