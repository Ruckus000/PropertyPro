import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '../../src/lib/api/errors/AppError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireFinanceEnabledMock,
  requireFinanceWritePermissionMock,
  requireFinanceAdminWriteMock,
  requireActiveSubscriptionForMutationMock,
  completeConnectOnboardingMock,
  validateConnectOAuthStateMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceWritePermissionMock: vi.fn(),
  requireFinanceAdminWriteMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  completeConnectOnboardingMock: vi.fn(),
  validateConnectOAuthStateMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/common', () => ({
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceWritePermission: requireFinanceWritePermissionMock,
  requireFinanceAdminWrite: requireFinanceAdminWriteMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/services/finance-service', () => ({
  completeConnectOnboarding: completeConnectOnboardingMock,
  validateConnectOAuthState: validateConnectOAuthStateMock,
}));

import { POST } from '../../src/app/api/v1/stripe/connect/complete/route';

const URL = 'http://localhost:3000/api/v1/stripe/connect/complete';

describe('POST /api/v1/stripe/connect/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-finance-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-finance-1',
      communityId: 42,
      role: 'manager',
      isAdmin: true,
      communityType: 'condo_718',
    });
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    requireFinanceWritePermissionMock.mockReturnValue(undefined);
    requireFinanceAdminWriteMock.mockReturnValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    validateConnectOAuthStateMock.mockReturnValue(undefined);
    completeConnectOnboardingMock.mockResolvedValue({
      stripeAccountId: 'acct_123',
      chargesEnabled: true,
      payoutsEnabled: true,
    });
  });

  it('completes connect onboarding on happy path', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-finance-test-1',
        },
        body: JSON.stringify({
          communityId: 42,
          code: 'ac_test_code',
          state: 'valid-state-token',
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({
      stripeAccountId: 'acct_123',
      chargesEnabled: true,
      payoutsEnabled: true,
    });
    expect(validateConnectOAuthStateMock).toHaveBeenCalledWith(
      'valid-state-token',
      42,
      'user-finance-1',
    );
    expect(requireFinanceEnabledMock).toHaveBeenCalled();
    expect(requireFinanceWritePermissionMock).toHaveBeenCalled();
    expect(requireFinanceAdminWriteMock).toHaveBeenCalled();
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(42);
    expect(completeConnectOnboardingMock).toHaveBeenCalledWith(
      42,
      'ac_test_code',
      'user-finance-1',
      'req-finance-test-1',
    );
  });

  it('returns 401 without calling completion when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          code: 'ac_test_code',
          state: 'valid-state-token',
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(validateConnectOAuthStateMock).not.toHaveBeenCalled();
    expect(completeConnectOnboardingMock).not.toHaveBeenCalled();
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
  });

  it('returns 403 when OAuth state validation fails', async () => {
    validateConnectOAuthStateMock.mockImplementationOnce(() => {
      throw new ForbiddenError('OAuth state signature invalid');
    });

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          code: 'ac_test_code',
          state: 'forged-state',
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(completeConnectOnboardingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance write permission is denied', async () => {
    requireFinanceWritePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId: 42,
          code: 'ac_test_code',
          state: 'valid-state-token',
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(completeConnectOnboardingMock).not.toHaveBeenCalled();
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body without side effects', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(validateConnectOAuthStateMock).not.toHaveBeenCalled();
    expect(completeConnectOnboardingMock).not.toHaveBeenCalled();
  });
});
