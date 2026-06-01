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
  startConnectOnboardingMock,
  parseCommunityIdFromBodyMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceWritePermissionMock: vi.fn(),
  requireFinanceAdminWriteMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  startConnectOnboardingMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
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
  startConnectOnboarding: startConnectOnboardingMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));

import { POST } from '../../src/app/api/v1/stripe/connect/onboard/route';

const URL = 'http://localhost:3000/api/v1/stripe/connect/onboard';

describe('POST /api/v1/stripe/connect/onboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-finance-1');
    parseCommunityIdFromBodyMock.mockReturnValue(42);
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
    startConnectOnboardingMock.mockResolvedValue({
      onboardingUrl: 'https://connect.stripe.com/setup/s/acct_123',
    });
  });

  it('returns onboarding URL on happy path', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-finance-test-1',
        },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({
      onboardingUrl: 'https://connect.stripe.com/setup/s/acct_123',
    });
    expect(requireFinanceEnabledMock).toHaveBeenCalled();
    expect(requireFinanceWritePermissionMock).toHaveBeenCalled();
    expect(requireFinanceAdminWriteMock).toHaveBeenCalled();
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(42);
    expect(startConnectOnboardingMock).toHaveBeenCalledWith(
      42,
      'user-finance-1',
      'req-finance-test-1',
    );
  });

  it('returns 401 without calling onboarding when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(401);
    expect(startConnectOnboardingMock).not.toHaveBeenCalled();
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
  });

  it('returns 403 when subscription guard blocks mutation', async () => {
    requireActiveSubscriptionForMutationMock.mockRejectedValueOnce(
      new AppError('Subscription required', 403, 'SUBSCRIPTION_REQUIRED'),
    );

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(403);
    expect(startConnectOnboardingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance write permission is denied', async () => {
    requireFinanceWritePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(response.status).toBe(403);
    expect(startConnectOnboardingMock).not.toHaveBeenCalled();
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body without side effects', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(startConnectOnboardingMock).not.toHaveBeenCalled();
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });
});
