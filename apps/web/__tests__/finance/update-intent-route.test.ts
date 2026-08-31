/**
 * Unit tests — `PATCH /api/v1/payments/update-intent` (A1 drain #131).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  parseCommunityIdFromBodyMock,
  requireFinanceEnabledMock,
  requireFinanceWritePermissionMock,
  requireFinanceAdminWriteMock,
  requireActorOwnsPiMock,
  updatePaymentIntentFeeMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceWritePermissionMock: vi.fn(),
  requireFinanceAdminWriteMock: vi.fn(),
  requireActorOwnsPiMock: vi.fn(),
  updatePaymentIntentFeeMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));

vi.mock('@/lib/finance/common', () => ({
  requirePaymentsEnabled: vi.fn(),
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceWritePermission: requireFinanceWritePermissionMock,
  requireFinanceAdminWrite: requireFinanceAdminWriteMock,
}));

vi.mock('@/lib/services/finance-service', () => ({
  requireActorOwnsPi: requireActorOwnsPiMock,
  updatePaymentIntentFee: updatePaymentIntentFeeMock,
}));

import { PATCH } from '../../src/app/api/v1/payments/update-intent/route';

const OWNER_MEMBERSHIP = {
  userId: 'owner-1',
  communityId: 10,
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  communityType: 'condo_718' as const,
};

const ADMIN_MEMBERSHIP = {
  userId: 'admin-1',
  communityId: 10,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
};

function patchReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/payments/update-intent', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/v1/payments/update-intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('owner-1');
    parseCommunityIdFromBodyMock.mockReturnValue(10);
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    requireFinanceWritePermissionMock.mockReturnValue(undefined);
    updatePaymentIntentFeeMock.mockResolvedValue({ clientSecret: 'cs_test' });
  });

  it('updates fee for unit owner on own PI', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    requireActorOwnsPiMock.mockResolvedValueOnce(undefined);

    const res = await PATCH(
      patchReq({
        communityId: 10,
        paymentIntentId: 'pi_abc123',
        paymentMethod: 'card',
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { clientSecret: string } };
    expect(json.data.clientSecret).toBe('cs_test');
    // communityId is the third arg now: under direct charges the PaymentIntent
    // lives on the association's connected account, so the ownership check has
    // to retrieve it from there (F-15).
    expect(requireActorOwnsPiMock).toHaveBeenCalledWith('pi_abc123', 'owner-1', 10);
    expect(requireFinanceAdminWriteMock).not.toHaveBeenCalled();
    expect(updatePaymentIntentFeeMock).toHaveBeenCalledWith(10, 'pi_abc123', 'card', 'owner-1');
  });

  it('updates fee for finance admin', async () => {
    requireAuthenticatedUserIdMock.mockResolvedValueOnce('admin-1');
    requireCommunityMembershipMock.mockResolvedValueOnce(ADMIN_MEMBERSHIP);

    const res = await PATCH(
      patchReq({
        communityId: 10,
        paymentIntentId: 'pi_admin',
        paymentMethod: 'us_bank_account',
      }),
    );

    expect(res.status).toBe(200);
    expect(requireFinanceAdminWriteMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireActorOwnsPiMock).not.toHaveBeenCalled();
    expect(updatePaymentIntentFeeMock).toHaveBeenCalledWith(
      10,
      'pi_admin',
      'us_bank_account',
      'admin-1',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(
      patchReq({
        communityId: 10,
        paymentIntentId: 'pi_abc',
        paymentMethod: 'card',
      }),
    );

    expect(res.status).toBe(401);
    expect(updatePaymentIntentFeeMock).not.toHaveBeenCalled();
  });

  it('returns 403 when owner does not own PI', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce(OWNER_MEMBERSHIP);
    requireActorOwnsPiMock.mockRejectedValueOnce(new ForbiddenError('Forbidden'));

    const res = await PATCH(
      patchReq({
        communityId: 10,
        paymentIntentId: 'pi_other',
        paymentMethod: 'card',
      }),
    );

    expect(res.status).toBe(403);
    expect(updatePaymentIntentFeeMock).not.toHaveBeenCalled();
  });

  it('returns 400 when paymentIntentId missing pi_ prefix', async () => {
    const res = await PATCH(
      patchReq({
        communityId: 10,
        paymentIntentId: 'bad_id',
        paymentMethod: 'card',
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updatePaymentIntentFeeMock).not.toHaveBeenCalled();
  });

  it('returns 400 when paymentMethod invalid', async () => {
    const res = await PATCH(
      patchReq({
        communityId: 10,
        paymentIntentId: 'pi_abc',
        paymentMethod: 'bitcoin',
      }),
    );

    expect(res.status).toBe(400);
    expect(updatePaymentIntentFeeMock).not.toHaveBeenCalled();
  });
});
