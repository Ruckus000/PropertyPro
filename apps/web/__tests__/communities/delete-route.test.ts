import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors';

// R3-03: community deletion is one of ADR-006's four root-exclusive powers.
// These tests deliberately do NOT mock the role guard — it is a pure function,
// so exercising the real `requireRootManager` through the membership fixture
// pins the actual authorization rather than a stub of it.

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requestCommunityDeletionMock,
  findCoolingCommunityDeletionRequestMock,
  interveneCommunityDeletionMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
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

vi.mock('@/lib/services/account-lifecycle-service', () => ({
  requestCommunityDeletion: requestCommunityDeletionMock,
  findCoolingCommunityDeletionRequest: findCoolingCommunityDeletionRequestMock,
  interveneCommunityDeletion: interveneCommunityDeletionMock,
}));

import { DELETE, POST } from '../../src/app/api/v1/communities/delete/route';

const POST_URL = 'http://localhost:3000/api/v1/communities/delete?communityId=7';
const DELETE_URL = POST_URL;

const membership = (role: string) => ({ role, communityId: 7, isAdmin: role !== 'resident' });
const rootMembership = membership('root_manager');

describe('POST /api/v1/communities/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveEffectiveCommunityIdMock.mockReturnValue(7);
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-user');
    requireCommunityMembershipMock.mockResolvedValue(rootMembership);
    requestCommunityDeletionMock.mockResolvedValue({
      id: 99,
      status: 'cooling',
      communityId: 7,
    });
  });

  it('creates a deletion request for the root manager', async () => {
    const req = new NextRequest(POST_URL, { method: 'POST' });
    const res = await POST(req);
    const json = (await res.json()) as { data: { id: number; status: string } };

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ id: 99, status: 'cooling', communityId: 7 });
    expect(requestCommunityDeletionMock).toHaveBeenCalledWith(7, 'admin-user');
  });

  // The role matrix IS the regression fence. Before R3-03 `property_manager`
  // passed here via `settings:write`.
  it.each(['property_manager', 'resident'])('returns 403 for %s', async (role) => {
    requireCommunityMembershipMock.mockResolvedValue(membership(role));

    const req = new NextRequest(POST_URL, { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(requestCommunityDeletionMock).not.toHaveBeenCalled();
  });

  it('tells a rejected caller how to recover', async () => {
    requireCommunityMembershipMock.mockResolvedValue(membership('property_manager'));

    const req = new NextRequest(POST_URL, { method: 'POST' });
    const res = await POST(req);
    const json = (await res.json()) as { error?: { message?: string } };

    expect(res.status).toBe(403);
    // A bare 403 would strand a PM in a root-vacant community.
    expect(JSON.stringify(json)).toMatch(/claim it from the dashboard/);
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest(POST_URL, { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(requestCommunityDeletionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when membership is denied', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

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
    requireCommunityMembershipMock.mockResolvedValue(rootMembership);
    findCoolingCommunityDeletionRequestMock.mockResolvedValue(42);
    interveneCommunityDeletionMock.mockResolvedValue(undefined);
  });

  it('cancels an active deletion request for the root manager', async () => {
    const req = new NextRequest(DELETE_URL, { method: 'DELETE' });
    const res = await DELETE(req);
    const json = (await res.json()) as { data: { cancelled: boolean } };

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ cancelled: true });
    expect(interveneCommunityDeletionMock).toHaveBeenCalledWith(42, {
      adminUserId: 'admin-user',
      notes: 'Cancelled by community administrator',
    });
  });

  // Cancel is root-only too — a PM must not be able to overturn the root's
  // deliberate decision. Platform-admin intervention is the break-glass.
  it.each(['property_manager', 'resident'])('returns 403 for %s', async (role) => {
    requireCommunityMembershipMock.mockResolvedValue(membership(role));

    const req = new NextRequest(DELETE_URL, { method: 'DELETE' });
    const res = await DELETE(req);

    expect(res.status).toBe(403);
    expect(interveneCommunityDeletionMock).not.toHaveBeenCalled();
  });

  it('authorizes BEFORE looking up the deletion request', async () => {
    // Ordering matters: a rejected caller must not be able to probe whether a
    // deletion request exists.
    requireCommunityMembershipMock.mockResolvedValue(membership('property_manager'));

    const req = new NextRequest(DELETE_URL, { method: 'DELETE' });
    await DELETE(req);

    expect(findCoolingCommunityDeletionRequestMock).not.toHaveBeenCalled();
  });

  it('returns 404 when no active deletion request exists', async () => {
    findCoolingCommunityDeletionRequestMock.mockResolvedValueOnce(null);

    const req = new NextRequest(DELETE_URL, { method: 'DELETE' });
    const res = await DELETE(req);

    expect(res.status).toBe(404);
    expect(interveneCommunityDeletionMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest(DELETE_URL, { method: 'DELETE' });
    const res = await DELETE(req);

    expect(res.status).toBe(401);
    expect(interveneCommunityDeletionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when membership is denied', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest(DELETE_URL, { method: 'DELETE' });
    const res = await DELETE(req);

    expect(res.status).toBe(403);
    expect(interveneCommunityDeletionMock).not.toHaveBeenCalled();
  });
});
