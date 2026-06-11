import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  transferRootMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  transferRootMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/services/root-dispute-service', () => ({
  transferRoot: transferRootMock,
}));

import { POST } from '../../../src/app/api/v1/communities/transfer-root/route';

const TO = '11111111-1111-4111-8111-111111111111';

function postReq(body: unknown, communityId = 7): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/communities/transfer-root', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-community-id': String(communityId),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/communities/transfer-root', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('root-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'root_manager' });
    transferRootMock.mockResolvedValue(undefined);
  });

  it('current root transfers → 200 transferred', async () => {
    const res = await POST(postReq({ communityId: 7, toUserId: TO }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { transferred: true } });
    expect(transferRootMock).toHaveBeenCalledWith(7, 'root-1', TO);
  });

  it('non-root caller → 403, service not called', async () => {
    requireCommunityMembershipMock.mockResolvedValue({ role: 'property_manager' });

    const res = await POST(postReq({ communityId: 7, toUserId: TO }));
    expect(res.status).toBe(403);
    expect(transferRootMock).not.toHaveBeenCalled();
  });

  it('service ForbiddenError (target not a PM) → 403', async () => {
    transferRootMock.mockRejectedValue(new ForbiddenError('Transfer target must already be a property manager of this community.'));

    const res = await POST(postReq({ communityId: 7, toUserId: TO }));
    expect(res.status).toBe(403);
  });
});
