import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  requestCommunityDeletionMock,
  findCoolingCommunityDeletionRequestMock,
  interveneCommunityDeletionMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requestCommunityDeletionMock: vi.fn(),
  findCoolingCommunityDeletionRequestMock: vi.fn(),
  interveneCommunityDeletionMock: vi.fn(),
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

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/services/account-lifecycle-service', () => ({
  requestCommunityDeletion: requestCommunityDeletionMock,
  findCoolingCommunityDeletionRequest: findCoolingCommunityDeletionRequestMock,
  interveneCommunityDeletion: interveneCommunityDeletionMock,
}));

import { DELETE, POST } from '../../src/app/api/v1/communities/delete/route';

const POST_URL = 'http://localhost:3000/api/v1/communities/delete?communityId=7';
const DELETE_URL = POST_URL;

const adminMembership = {
  role: 'board_president',
  isAdmin: true,
};

describe('POST /api/v1/communities/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveEffectiveCommunityIdMock.mockReturnValue(7);
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-user');
    requireCommunityMembershipMock.mockResolvedValue(adminMembership);
    requestCommunityDeletionMock.mockResolvedValue({
      id: 99,
      status: 'cooling',
      communityId: 7,
    });
  });

  it('creates a deletion request', async () => {
    const req = new NextRequest(POST_URL, { method: 'POST' });
    const res = await POST(req);
    const json = (await res.json()) as { data: { id: number; status: string } };

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 99, status: 'cooling', communityId: 7 });
    expect(requestCommunityDeletionMock).toHaveBeenCalledWith(7, 'admin-user');
    expect(requirePermissionMock).toHaveBeenCalledWith(adminMembership, 'settings', 'write');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest(POST_URL, { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(requestCommunityDeletionMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when membership is denied', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest(POST_URL, { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(requestCommunityDeletionMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when settings write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError();
    });

    const req = new NextRequest(POST_URL, { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(requestCommunityDeletionMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/communities/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveEffectiveCommunityIdMock.mockReturnValue(7);
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-user');
    requireCommunityMembershipMock.mockResolvedValue(adminMembership);
    findCoolingCommunityDeletionRequestMock.mockResolvedValue(42);
    interveneCommunityDeletionMock.mockResolvedValue(undefined);
  });

  it('cancels an active deletion request', async () => {
    const req = new NextRequest(DELETE_URL, { method: 'DELETE' });
    const res = await DELETE(req);
    const json = (await res.json()) as { data: { cancelled: boolean } };

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ cancelled: true });
    expect(interveneCommunityDeletionMock).toHaveBeenCalledWith(42, {
      adminUserId: 'admin-user',
      notes: 'Cancelled by community administrator',
    });
    expect(requirePermissionMock).toHaveBeenCalledWith(adminMembership, 'settings', 'write');
  });

  it('returns 404 when no active deletion request exists', async () => {
    findCoolingCommunityDeletionRequestMock.mockResolvedValueOnce(null);

    const req = new NextRequest(DELETE_URL, { method: 'DELETE' });
    const res = await DELETE(req);

    expect(res.status).toBe(404);
    expect(interveneCommunityDeletionMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).toHaveBeenCalledWith(adminMembership, 'settings', 'write');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest(DELETE_URL, { method: 'DELETE' });
    const res = await DELETE(req);

    expect(res.status).toBe(401);
    expect(interveneCommunityDeletionMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when membership is denied', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest(DELETE_URL, { method: 'DELETE' });
    const res = await DELETE(req);

    expect(res.status).toBe(403);
    expect(interveneCommunityDeletionMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when settings write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError();
    });

    const req = new NextRequest(DELETE_URL, { method: 'DELETE' });
    const res = await DELETE(req);

    expect(res.status).toBe(403);
    expect(interveneCommunityDeletionMock).not.toHaveBeenCalled();
  });
});
