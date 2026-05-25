/**
 * Route unit tests — `GET /api/v1/assessments/[id]/line-items`.
 *
 * Added alongside Plan A1 bundle drain #34. Covers contracted runRoute
 * envelope + the resident unit-ownership branch preserved verbatim.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireFinanceEnabledMock,
  requireFinanceReadPermissionMock,
  listActorUnitIdsForFinanceMock,
  listAssessmentLineItemsForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceReadPermissionMock: vi.fn(),
  listActorUnitIdsForFinanceMock: vi.fn(),
  listAssessmentLineItemsForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/finance/common', () => ({
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceReadPermission: requireFinanceReadPermissionMock,
}));
vi.mock('@/lib/services/finance-service', () => ({
  listActorUnitIdsForFinance: listActorUnitIdsForFinanceMock,
  listAssessmentLineItemsForCommunity: listAssessmentLineItemsForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/assessments/[id]/line-items/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'board_member' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board Member',
  communityType: 'condo_718' as const,
};

const OWNER_MEMBERSHIP = {
  userId: 'owner-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  communityType: 'condo_718' as const,
};

const ITEMS = [{ id: 1, amountCents: 1000 }];

function req(qs = '?communityId=42', id = '9', headers?: Record<string, string>): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/assessments/${id}/line-items${qs}`,
    { headers: headers ?? {} },
  );
}
function ctx(id = '9') {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/v1/assessments/[id]/line-items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    requireFinanceReadPermissionMock.mockReturnValue(undefined);
    listAssessmentLineItemsForCommunityMock.mockResolvedValue(ITEMS);
  });

  it('returns wrapped line items for an admin', async () => {
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: typeof ITEMS };
    expect(json.data).toEqual(ITEMS);
    expect(listAssessmentLineItemsForCommunityMock).toHaveBeenCalledWith(42, 9, undefined);
  });

  it('defaults a single-unit owner to their sole unitId', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('owner-1');
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7]);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    expect(listAssessmentLineItemsForCommunityMock).toHaveBeenCalledWith(42, 9, 7);
  });

  it('rejects 400 when multi-unit owner omits unitId', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('owner-1');
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7, 8]);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(400);
    expect(listAssessmentLineItemsForCommunityMock).not.toHaveBeenCalled();
  });

  it('rejects 403 when owner has zero units', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('owner-1');
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([]);
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(listAssessmentLineItemsForCommunityMock).not.toHaveBeenCalled();
  });

  it('rejects 403 when owner requests a unit they do not own', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValue('owner-1');
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7]);
    const res = await GET(req('?communityId=42&unitId=99'), ctx());
    expect(res.status).toBe(403);
    expect(listAssessmentLineItemsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await GET(req(''), ctx());
    expect(res.status).toBe(400);
  });

  it('returns 400 when communityId is non-numeric', async () => {
    const res = await GET(req('?communityId=abc'), ctx());
    expect(res.status).toBe(400);
  });

  it('returns 400 when [id] is non-numeric', async () => {
    const res = await GET(req('?communityId=42', 'abc'), ctx('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await GET(req('?communityId=42', '9', { 'x-community-id': '99' }), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 403 when finance read permission is denied', async () => {
    requireFinanceReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Finance read denied');
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
  });

  it('returns 403 when finance feature is disabled for the community', async () => {
    requireFinanceEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Finance not enabled'),
    );
    const res = await GET(req(), ctx());
    expect(res.status).toBe(403);
    expect(listAssessmentLineItemsForCommunityMock).not.toHaveBeenCalled();
  });
});
