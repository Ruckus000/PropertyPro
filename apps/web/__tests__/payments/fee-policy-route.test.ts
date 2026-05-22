/**
 * Route unit tests — `/api/v1/payments/fee-policy` (GET + PATCH).
 *
 * Added alongside the Plan A1 drain #13. The route had no isolated unit
 * test before; the migration adds coverage of the auth chain, finance
 * gates (`requireFinanceEnabled` + `requireFinanceAdminWrite`), audit-log
 * emission with the full `settings_changed` payload, the demo-grace
 * block, body/query validation, and the runner's envelope wrapping.
 *
 * Mirrors drain #4's two-contracts-per-file test pattern.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireFinanceEnabledMock,
  requireFinanceAdminWriteMock,
  assertNotDemoGraceMock,
  getCommunityFeePolicyMock,
  setCommunityFeePolicyMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceAdminWriteMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  getCommunityFeePolicyMock: vi.fn(),
  setCommunityFeePolicyMock: vi.fn(),
  logAuditEventMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/common', () => ({
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceAdminWrite: requireFinanceAdminWriteMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/finance-service', () => ({
  getCommunityFeePolicy: getCommunityFeePolicyMock,
  setCommunityFeePolicy: setCommunityFeePolicyMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));

import { GET, PATCH } from '../../src/app/api/v1/payments/fee-policy/route';

const ADMIN_MEMBERSHIP = {
  userId: 'admin-1',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

const MEMBER_MEMBERSHIP = {
  userId: 'member-1',
  communityId: 42,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  communityType: 'condo_718' as const,
};

interface FeePolicyJson {
  data: { feePolicy: 'owner_pays' | 'association_absorbs' };
}

function jsonPatch(
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/payments/fee-policy', {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('GET /api/v1/payments/fee-policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBER_MEMBERSHIP);
    requireFinanceEnabledMock.mockResolvedValue(undefined);
  });

  it('returns the current fee policy for any community member with finance enabled', async () => {
    getCommunityFeePolicyMock.mockResolvedValue('owner_pays');

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/payments/fee-policy?communityId=42'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as FeePolicyJson;
    expect(json.data).toEqual({ feePolicy: 'owner_pays' });
    expect(getCommunityFeePolicyMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(requireFinanceEnabledMock).toHaveBeenCalledWith(MEMBER_MEMBERSHIP);
  });

  it('returns the default fee policy (association_absorbs) when not yet customized', async () => {
    // getCommunityFeePolicy itself falls back to DEFAULT_FEE_POLICY when the
    // setting is unset — verify the route surfaces that value unchanged.
    getCommunityFeePolicyMock.mockResolvedValue('association_absorbs');

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/payments/fee-policy?communityId=42'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as FeePolicyJson;
    expect(json.data).toEqual({ feePolicy: 'association_absorbs' });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/payments/fee-policy?communityId=42'),
    );

    expect(res.status).toBe(401);
    expect(getCommunityFeePolicyMock).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not a member of the requested community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/payments/fee-policy?communityId=42'),
    );

    expect(res.status).toBe(403);
    expect(getCommunityFeePolicyMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance is not enabled for the community', async () => {
    requireFinanceEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Finance is not enabled for this community'),
    );

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/payments/fee-policy?communityId=42'),
    );

    expect(res.status).toBe(403);
    expect(getCommunityFeePolicyMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/payments/fee-policy'),
    );

    expect(res.status).toBe(400);
    expect(getCommunityFeePolicyMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is non-positive', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/payments/fee-policy?communityId=0'),
    );

    expect(res.status).toBe(400);
    expect(getCommunityFeePolicyMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/payments/fee-policy?communityId=42', {
        headers: { 'x-community-id': '99' },
      }),
    );

    expect(res.status).toBe(404);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getCommunityFeePolicyMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/payments/fee-policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('admin-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    requireFinanceAdminWriteMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    setCommunityFeePolicyMock.mockResolvedValue({
      oldPolicy: 'association_absorbs',
      newPolicy: 'owner_pays',
    });
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('updates fee policy and emits the canonical audit-log event', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost:3000/api/v1/payments/fee-policy', {
        method: 'PATCH',
        body: JSON.stringify({ communityId: 42, feePolicy: 'owner_pays' }),
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-abc-123',
        },
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as FeePolicyJson;
    expect(json.data).toEqual({ feePolicy: 'owner_pays' });
    expect(setCommunityFeePolicyMock).toHaveBeenCalledWith(42, 'owner_pays');
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: 'admin-1',
      action: 'settings_changed',
      resourceType: 'community',
      resourceId: '42',
      communityId: 42,
      oldValues: { paymentFeePolicy: 'association_absorbs' },
      newValues: { paymentFeePolicy: 'owner_pays' },
      metadata: { requestId: 'req-abc-123' },
    });
  });

  it('passes a null requestId in audit metadata when x-request-id header is absent', async () => {
    const res = await PATCH(
      jsonPatch({ communityId: 42, feePolicy: 'owner_pays' }),
    );

    expect(res.status).toBe(200);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { requestId: null },
      }),
    );
  });

  it('returns 403 during the demo grace window (before membership/finance checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await PATCH(
      jsonPatch({ communityId: 42, feePolicy: 'owner_pays' }),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(setCommunityFeePolicyMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller lacks finance admin write permission', async () => {
    requireFinanceAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Finance admin write required');
    });

    const res = await PATCH(
      jsonPatch({ communityId: 42, feePolicy: 'owner_pays' }),
    );

    expect(res.status).toBe(403);
    expect(setCommunityFeePolicyMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance is not enabled', async () => {
    requireFinanceEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Finance is not enabled for this community'),
    );

    const res = await PATCH(
      jsonPatch({ communityId: 42, feePolicy: 'owner_pays' }),
    );

    expect(res.status).toBe(403);
    expect(requireFinanceAdminWriteMock).not.toHaveBeenCalled();
    expect(setCommunityFeePolicyMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(
      jsonPatch({ communityId: 42, feePolicy: 'owner_pays' }),
    );

    expect(res.status).toBe(401);
    expect(setCommunityFeePolicyMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 400 when communityId is missing from body', async () => {
    const res = await PATCH(jsonPatch({ feePolicy: 'owner_pays' }));

    expect(res.status).toBe(400);
    expect(setCommunityFeePolicyMock).not.toHaveBeenCalled();
  });

  it('returns 400 when feePolicy is missing from body', async () => {
    const res = await PATCH(jsonPatch({ communityId: 42 }));

    expect(res.status).toBe(400);
    expect(setCommunityFeePolicyMock).not.toHaveBeenCalled();
  });

  it('returns 400 when feePolicy is not a valid enum value', async () => {
    const res = await PATCH(
      jsonPatch({ communityId: 42, feePolicy: 'free_for_all' }),
    );

    expect(res.status).toBe(400);
    expect(setCommunityFeePolicyMock).not.toHaveBeenCalled();
  });

  it('returns 404 when x-community-id header disagrees with body communityId', async () => {
    const res = await PATCH(
      jsonPatch(
        { communityId: 42, feePolicy: 'owner_pays' },
        { 'x-community-id': '99' },
      ),
    );

    expect(res.status).toBe(404);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(setCommunityFeePolicyMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
