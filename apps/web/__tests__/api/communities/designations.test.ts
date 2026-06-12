import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../../src/lib/api/errors/ForbiddenError';
import { ValidationError } from '../../../src/lib/api/errors/ValidationError';

// NonOwnerAckRequiredError is defined in the mock factory so that the route's
// `instanceof` check resolves against the same class reference.
const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  setDesignationMock,
  NonOwnerAckRequiredError: MockNonOwnerAckRequiredError,
} = vi.hoisted(() => {
  class NonOwnerAckRequiredError extends Error {
    constructor() {
      super('Board eligibility acknowledgement required for a non-owner.');
      this.name = 'NonOwnerAckRequiredError';
    }
  }
  return {
    requireAuthenticatedUserIdMock: vi.fn(),
    requireCommunityMembershipMock: vi.fn(),
    setDesignationMock: vi.fn(),
    NonOwnerAckRequiredError,
  };
});

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/services/role-management-service', () => ({
  setDesignation: setDesignationMock,
  NonOwnerAckRequiredError: MockNonOwnerAckRequiredError,
}));

import { POST } from '../../../src/app/api/v1/communities/designations/route';

const TARGET_USER = '33333333-3333-4333-8333-333333333333';
const COMMUNITY_ID = 7;

function makeReq(body: unknown, communityId = COMMUNITY_ID): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/communities/designations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-community-id': String(communityId),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/communities/designations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('root-1');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'root_manager',
      communityType: 'condo_718',
    });
    setDesignationMock.mockResolvedValue({ ok: true });
  });

  it('root sets board_member → 200 with ok: true', async () => {
    const res = await POST(
      makeReq({ communityId: COMMUNITY_ID, userId: TARGET_USER, designation: 'board_member' }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { ok: true } });
    expect(setDesignationMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      'condo_718',
      TARGET_USER,
      'board_member',
      false,
      'root-1',
    );
  });

  it('non-owner without ack (service throws NonOwnerAckRequiredError) → 409', async () => {
    setDesignationMock.mockRejectedValue(new MockNonOwnerAckRequiredError());
    const res = await POST(
      makeReq({ communityId: COMMUNITY_ID, userId: TARGET_USER, designation: 'board_member' }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe('NON_OWNER_ACK_REQUIRED');
  });

  it('non-owner with acknowledgeNonOwner: true → 200', async () => {
    const res = await POST(
      makeReq({
        communityId: COMMUNITY_ID,
        userId: TARGET_USER,
        designation: 'board_member',
        acknowledgeNonOwner: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(setDesignationMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      'condo_718',
      TARGET_USER,
      'board_member',
      true,
      'root-1',
    );
  });

  it('apartment community (service throws ValidationError) → 400', async () => {
    setDesignationMock.mockRejectedValue(
      new ValidationError('Apartment communities have no board.'),
    );
    const res = await POST(
      makeReq({ communityId: COMMUNITY_ID, userId: TARGET_USER, designation: 'board_member' }),
    );
    expect(res.status).toBe(400);
  });

  it('non-root caller → 403, service not called', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'property_manager',
      communityType: 'condo_718',
    });
    const res = await POST(
      makeReq({ communityId: COMMUNITY_ID, userId: TARGET_USER, designation: 'board_member' }),
    );
    expect(res.status).toBe(403);
    expect(setDesignationMock).not.toHaveBeenCalled();
  });

  it('malformed body (bad designation enum) → 400', async () => {
    const res = await POST(
      makeReq({ communityId: COMMUNITY_ID, userId: TARGET_USER, designation: 'invalid_value' }),
    );
    expect(res.status).toBe(400);
    expect(setDesignationMock).not.toHaveBeenCalled();
  });
});
