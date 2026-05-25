/**
 * Route unit test — `GET /api/v1/esign/my-pending`.
 *
 * Added alongside the Plan A1 drain (drain #20). Mirrors drain #5
 * (`notifications/unread-count`) query-only shape, with the addition of
 * an esign permission gate (`requireEsignReadPermission`).
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireEsignReadPermissionMock,
  listMyPendingForActorMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireEsignReadPermissionMock: vi.fn(),
  listMyPendingForActorMock: vi.fn(),
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

vi.mock('@/lib/esign/esign-route-helpers', () => ({
  requireEsignReadPermission: requireEsignReadPermissionMock,
}));

vi.mock('@/lib/services/esign-service', () => ({
  listMyPendingForActor: listMyPendingForActorMock,
}));

import { GET } from '../../src/app/api/v1/esign/my-pending/route';

describe('GET /api/v1/esign/my-pending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    // Default: passthrough (no header/query mismatch).
    resolveEffectiveCommunityIdMock.mockImplementation(
      (_req: unknown, communityId: number) => communityId,
    );
    requireCommunityMembershipMock.mockResolvedValue({ communityId: 42 });
    requireEsignReadPermissionMock.mockResolvedValue(undefined);
  });

  it('returns pending esign requests for a member', async () => {
    const pending = [
      { id: 1, submissionId: 100, status: 'pending' },
      { id: 2, submissionId: 101, status: 'pending' },
    ];
    listMyPendingForActorMock.mockResolvedValue(pending);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/my-pending?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(req, 42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(requireEsignReadPermissionMock).toHaveBeenCalledWith({ communityId: 42 });
    expect(listMyPendingForActorMock).toHaveBeenCalledWith(42, 'user-1');
    await expect(res.json()).resolves.toEqual({ data: pending });
  });

  it('returns empty array when the user has no pending requests', async () => {
    listMyPendingForActorMock.mockResolvedValue([]);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/my-pending?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [] });
  });

  it('returns 401 when the user is not authenticated', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors');
    requireAuthenticatedUserIdMock.mockRejectedValue(
      new UnauthorizedError('Not authenticated'),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/my-pending?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireEsignReadPermissionMock).not.toHaveBeenCalled();
    expect(listMyPendingForActorMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not a member of the requested community', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('Not a member of this community'),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/my-pending?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(requireEsignReadPermissionMock).not.toHaveBeenCalled();
    expect(listMyPendingForActorMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the esign permission gate denies', async () => {
    const { ForbiddenError } = await import('@/lib/api/errors');
    requireEsignReadPermissionMock.mockRejectedValue(
      new ForbiddenError('E-Sign is not enabled for this community type'),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/my-pending?communityId=42',
    );
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(listMyPendingForActorMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId query parameter is missing', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/my-pending',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(listMyPendingForActorMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is non-numeric', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/my-pending?communityId=abc',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(listMyPendingForActorMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the x-community-id header disagrees with the query', async () => {
    const { NotFoundError } = await import('@/lib/api/errors');
    resolveEffectiveCommunityIdMock.mockImplementation(() => {
      throw new NotFoundError('Community mismatch');
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/esign/my-pending?communityId=42',
      { headers: { 'x-community-id': '99' } },
    );
    const res = await GET(req);

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requireEsignReadPermissionMock).not.toHaveBeenCalled();
    expect(listMyPendingForActorMock).not.toHaveBeenCalled();
  });
});
