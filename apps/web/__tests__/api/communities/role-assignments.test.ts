import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  assignPropertyManagerMock,
  revokePropertyManagerMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  assignPropertyManagerMock: vi.fn(),
  revokePropertyManagerMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/services/role-management-service', () => ({
  assignPropertyManager: assignPropertyManagerMock,
  revokePropertyManager: revokePropertyManagerMock,
}));

import { POST, DELETE } from '../../../src/app/api/v1/communities/role-assignments/route';

const TARGET_USER = '22222222-2222-4222-8222-222222222222';
const COMMUNITY_ID = 7;

function makeReq(method: 'POST' | 'DELETE', body: unknown, communityId = COMMUNITY_ID): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/communities/role-assignments', {
    method,
    headers: {
      'content-type': 'application/json',
      'x-community-id': String(communityId),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/communities/role-assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('root-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'root_manager', communityType: 'condo_718' });
    assignPropertyManagerMock.mockResolvedValue({ assigned: true, alreadyAssigned: false });
  });

  it('root assigns a member → 200 with result', async () => {
    const res = await POST(makeReq('POST', { communityId: COMMUNITY_ID, userId: TARGET_USER }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { assigned: true, alreadyAssigned: false } });
    expect(assignPropertyManagerMock).toHaveBeenCalledWith(COMMUNITY_ID, TARGET_USER, 'root-1');
  });

  it('non-root caller → 403, service not called', async () => {
    requireCommunityMembershipMock.mockResolvedValue({ role: 'property_manager', communityType: 'condo_718' });
    const res = await POST(makeReq('POST', { communityId: COMMUNITY_ID, userId: TARGET_USER }));
    expect(res.status).toBe(403);
    expect(assignPropertyManagerMock).not.toHaveBeenCalled();
  });

  it('service ForbiddenError (target is root_manager) → 403', async () => {
    assignPropertyManagerMock.mockRejectedValue(
      new ForbiddenError('Cannot change the root manager here — use Transfer root.'),
    );
    const res = await POST(makeReq('POST', { communityId: COMMUNITY_ID, userId: TARGET_USER }));
    expect(res.status).toBe(403);
  });

  it('malformed body (non-UUID userId) → 400, service not called', async () => {
    const res = await POST(makeReq('POST', { communityId: COMMUNITY_ID, userId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect(assignPropertyManagerMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/communities/role-assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('root-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'root_manager', communityType: 'condo_718' });
    revokePropertyManagerMock.mockResolvedValue({ revoked: true });
  });

  it('root revokes a property_manager → 200 with result', async () => {
    const res = await DELETE(makeReq('DELETE', { communityId: COMMUNITY_ID, userId: TARGET_USER }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { revoked: true } });
    expect(revokePropertyManagerMock).toHaveBeenCalledWith(COMMUNITY_ID, TARGET_USER, 'root-1');
  });

  it('service ForbiddenError (revoking root_manager) → 403', async () => {
    revokePropertyManagerMock.mockRejectedValue(
      new ForbiddenError('Transfer root before changing the root manager.'),
    );
    const res = await DELETE(makeReq('DELETE', { communityId: COMMUNITY_ID, userId: TARGET_USER }));
    expect(res.status).toBe(403);
  });

  it('non-root caller → 403, service not called', async () => {
    requireCommunityMembershipMock.mockResolvedValue({ role: 'property_manager', communityType: 'condo_718' });
    const res = await DELETE(makeReq('DELETE', { communityId: COMMUNITY_ID, userId: TARGET_USER }));
    expect(res.status).toBe(403);
    expect(revokePropertyManagerMock).not.toHaveBeenCalled();
  });
});
