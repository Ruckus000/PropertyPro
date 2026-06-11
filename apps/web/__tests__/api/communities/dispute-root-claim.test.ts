import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  openDisputeMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  openDisputeMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/services/root-dispute-service', () => ({
  openDispute: openDisputeMock,
}));

import { POST } from '../../../src/app/api/v1/communities/dispute-root-claim/route';

function postReq(body: unknown, communityId = 7): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/communities/dispute-root-claim', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-community-id': String(communityId),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/communities/dispute-root-claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'property_manager' });
  });

  it('property_manager opens a dispute → 200 with result', async () => {
    openDisputeMock.mockResolvedValue({ disputed: true });

    const res = await POST(postReq({ communityId: 7 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { disputed: true } });
    expect(openDisputeMock).toHaveBeenCalledWith(7, 'pm-1');
  });

  it('no current root → friendly no-op result', async () => {
    openDisputeMock.mockResolvedValue({ disputed: false, reason: 'no_current_root' });

    const res = await POST(postReq({ communityId: 7 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ disputed: false, reason: 'no_current_root' });
  });

  it('non-property_manager caller → 403', async () => {
    requireCommunityMembershipMock.mockResolvedValue({ role: 'resident' });

    const res = await POST(postReq({ communityId: 7 }));
    expect(res.status).toBe(403);
    expect(openDisputeMock).not.toHaveBeenCalled();
  });

  it('caller not a member → 403 (membership throws)', async () => {
    requireCommunityMembershipMock.mockRejectedValue(new ForbiddenError('User is not a member of this community'));

    const res = await POST(postReq({ communityId: 7 }));
    expect(res.status).toBe(403);
  });
});
