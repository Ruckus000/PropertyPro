/**
 * Route unit test — `GET /api/v1/payments/history`.
 *
 * Added alongside Plan A1 drain #25. Covers the auth chain + the
 * conditional resident-owner vs. non-resident branch. The route was
 * previously only exercised via the DB-backed `finance-dues-ledger`
 * integration test; this adds isolated unit coverage of every gate and
 * every business-rule message.
 *
 * Business-rule error messages MUST stay byte-identical with
 * pre-migration. The asserts below pin every one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireFinanceEnabledMock,
  requireFinanceReadPermissionMock,
  listActorUnitIdsForFinanceMock,
  listPaymentHistoryForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceReadPermissionMock: vi.fn(),
  listActorUnitIdsForFinanceMock: vi.fn(),
  listPaymentHistoryForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/common', () => ({
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceReadPermission: requireFinanceReadPermissionMock,
}));

vi.mock('@/lib/services/finance-service', () => ({
  listActorUnitIdsForFinance: listActorUnitIdsForFinanceMock,
  listPaymentHistoryForCommunity: listPaymentHistoryForCommunityMock,
}));

import { GET } from '../../src/app/api/v1/payments/history/route';

const STAFF_MEMBERSHIP = {
  userId: 'staff-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
};

const OWNER_MEMBERSHIP = {
  userId: 'owner-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Unit Owner',
  communityType: 'condo_718' as const,
};

function buildReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

interface EnvelopeJson {
  data: Array<Record<string, unknown>>;
}

interface ErrorJson {
  error: { code: string; message: string };
}

describe('GET /api/v1/payments/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    requireFinanceReadPermissionMock.mockImplementation(() => undefined);
  });

  it('returns history for non-resident (no unitId filter) — happy path', async () => {
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    listPaymentHistoryForCommunityMock.mockResolvedValue([
      { id: 1, unitId: 7, amountCents: 1000 },
    ]);

    const res = await GET(buildReq('http://localhost/api/v1/payments/history?communityId=42'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson;
    expect(json.data).toEqual([{ id: 1, unitId: 7, amountCents: 1000 }]);
    expect(requireFinanceReadPermissionMock).toHaveBeenCalledWith(STAFF_MEMBERSHIP);
    expect(listActorUnitIdsForFinanceMock).not.toHaveBeenCalled();
    expect(listPaymentHistoryForCommunityMock).toHaveBeenCalledWith(42, undefined);
  });

  it('returns history for non-resident with explicit unitId — happy path', async () => {
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    listPaymentHistoryForCommunityMock.mockResolvedValue([
      { id: 2, unitId: 42, amountCents: 2000 },
    ]);

    const res = await GET(
      buildReq('http://localhost/api/v1/payments/history?communityId=42&unitId=42'),
    );

    expect(res.status).toBe(200);
    expect(listPaymentHistoryForCommunityMock).toHaveBeenCalledWith(42, 42);
    expect(listActorUnitIdsForFinanceMock).not.toHaveBeenCalled();
  });

  it('returns history for resident-owner with single unit (auto-resolves unitId)', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7]);
    listPaymentHistoryForCommunityMock.mockResolvedValue([
      { id: 3, unitId: 7, amountCents: 3000 },
    ]);

    const res = await GET(buildReq('http://localhost/api/v1/payments/history?communityId=42'));

    expect(res.status).toBe(200);
    expect(listActorUnitIdsForFinanceMock).toHaveBeenCalledWith(42, 'user-1');
    expect(listPaymentHistoryForCommunityMock).toHaveBeenCalledWith(42, 7);
    expect(requireFinanceReadPermissionMock).not.toHaveBeenCalled();
  });

  it('returns history for resident-owner with valid unitId from multi-unit set', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7, 8]);
    listPaymentHistoryForCommunityMock.mockResolvedValue([
      { id: 4, unitId: 7, amountCents: 4000 },
    ]);

    const res = await GET(
      buildReq('http://localhost/api/v1/payments/history?communityId=42&unitId=7'),
    );

    expect(res.status).toBe(200);
    expect(listPaymentHistoryForCommunityMock).toHaveBeenCalledWith(42, 7);
    expect(requireFinanceReadPermissionMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(buildReq('http://localhost/api/v1/payments/history?communityId=42'));

    expect(res.status).toBe(401);
    expect(listPaymentHistoryForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await GET(buildReq('http://localhost/api/v1/payments/history'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(listPaymentHistoryForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is non-numeric', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/payments/history?communityId=abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(listPaymentHistoryForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireCommunityMembership throws', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await GET(buildReq('http://localhost/api/v1/payments/history?communityId=42'));

    expect(res.status).toBe(403);
    expect(listPaymentHistoryForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 with exact message when resident-owner has zero unit associations', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([]);

    const res = await GET(buildReq('http://localhost/api/v1/payments/history?communityId=42'));

    expect(res.status).toBe(403);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.message).toBe('No unit association found for this owner');
    expect(listPaymentHistoryForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 BAD_REQUEST with exact message when resident-owner has multi-unit and missing unitId', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7, 8]);

    const res = await GET(buildReq('http://localhost/api/v1/payments/history?communityId=42'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorJson;
    // Pre-migration was BAD_REQUEST via BadRequestError — preserved.
    expect(json.error.code).toBe('BAD_REQUEST');
    expect(json.error.message).toBe(
      'unitId query parameter is required when you are associated with multiple units',
    );
    expect(listPaymentHistoryForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 with exact message when resident-owner requests a unitId they do not own', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER_MEMBERSHIP);
    listActorUnitIdsForFinanceMock.mockResolvedValue([7, 8]);

    const res = await GET(
      buildReq('http://localhost/api/v1/payments/history?communityId=42&unitId=999'),
    );

    expect(res.status).toBe(403);
    const json = (await res.json()) as ErrorJson;
    expect(json.error.message).toBe(
      'Owners can only access payment history for their own unit',
    );
    expect(listPaymentHistoryForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when non-resident finance read permission is denied', async () => {
    requireCommunityMembershipMock.mockResolvedValue(STAFF_MEMBERSHIP);
    requireFinanceReadPermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient finance read permission');
    });

    const res = await GET(buildReq('http://localhost/api/v1/payments/history?communityId=42'));

    expect(res.status).toBe(403);
    expect(listPaymentHistoryForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with query communityId', async () => {
    const res = await GET(
      buildReq('http://localhost/api/v1/payments/history?communityId=42', {
        headers: { 'x-community-id': '99' },
      }),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(listPaymentHistoryForCommunityMock).not.toHaveBeenCalled();
  });
});
