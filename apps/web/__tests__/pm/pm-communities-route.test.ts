import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  listManagedCommunitiesForPmMock,
  isPmAdminInAnyCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  listManagedCommunitiesForPmMock: vi.fn(),
  isPmAdminInAnyCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/pm-communities', () => ({
  listManagedCommunitiesForPm: listManagedCommunitiesForPmMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock,
}));

vi.mock('@/lib/auth/signup', () => ({
  checkSignupSubdomainAvailability: vi.fn(),
}));

vi.mock('@/lib/pm/create-community', () => ({
  createCommunityForPm: vi.fn(),
}));

vi.mock('@/lib/services/stripe-service', () => ({
  createAddCommunityCheckout: vi.fn(),
}));

vi.mock('@/lib/billing/billing-group-service', () => ({
  getOrCreateBillingGroupForPm: vi.fn(),
  createPendingAddToGroupSignup: vi.fn(),
}));

import { GET } from '../../src/app/api/v1/pm/communities/route';

describe('pm communities route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-user-1');
    isPmAdminInAnyCommunityMock.mockResolvedValue(true);
  });

  it('returns managed communities for authenticated PM user', async () => {
    listManagedCommunitiesForPmMock.mockResolvedValue([
      {
        communityId: 101,
        communityName: 'Palm View',
        slug: 'palm-view',
        communityType: 'condo_718',
        timezone: 'America/New_York',
        residentCount: 12,
        totalUnits: 20,
        openMaintenanceRequests: 2,
        unsatisfiedComplianceItems: 1,
      },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/pm/communities');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[] };
    expect(json.data).toHaveLength(1);
    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(isPmAdminInAnyCommunityMock).toHaveBeenCalledWith('pm-user-1');
    expect(listManagedCommunitiesForPmMock).toHaveBeenCalledWith('pm-user-1', {
      communityType: undefined,
      search: undefined,
    });
  });

  it('applies communityType and search filters from query params', async () => {
    listManagedCommunitiesForPmMock.mockResolvedValue([]);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/pm/communities?communityType=hoa_720&search=oak',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(listManagedCommunitiesForPmMock).toHaveBeenCalledWith('pm-user-1', {
      communityType: 'hoa_720',
      search: 'oak',
    });
  });

  it('rejects invalid communityType values', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/pm/communities?communityType=invalid-type',
    );
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(listManagedCommunitiesForPmMock).not.toHaveBeenCalled();
  });

  it('returns 403 for authenticated users without PM role', async () => {
    isPmAdminInAnyCommunityMock.mockResolvedValueOnce(false);

    const req = new NextRequest('http://localhost:3000/api/v1/pm/communities');
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(isPmAdminInAnyCommunityMock).toHaveBeenCalledWith('pm-user-1');
    expect(listManagedCommunitiesForPmMock).not.toHaveBeenCalled();
  });

  it('returns 401 for unauthenticated users', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/pm/communities');
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(isPmAdminInAnyCommunityMock).not.toHaveBeenCalled();
    expect(listManagedCommunitiesForPmMock).not.toHaveBeenCalled();
  });
});
