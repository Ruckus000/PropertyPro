/**
 * Unit tests for POST /api/v1/subscribe (A1 drain #156).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  resolveEffectiveCommunityIdMock,
  resolveStripePriceMock,
  emitConversionEventMock,
  getCommunityForCheckoutMock,
  findActiveAccessPlanIdForCommunityMock,
  stripeCheckoutCreateMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  resolveStripePriceMock: vi.fn(),
  emitConversionEventMock: vi.fn(),
  getCommunityForCheckoutMock: vi.fn(),
  findActiveAccessPlanIdForCommunityMock: vi.fn(),
  stripeCheckoutCreateMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/services/stripe-service', () => ({
  resolveStripePrice: resolveStripePriceMock,
}));
vi.mock('@/lib/services/conversion-events', () => ({
  emitConversionEvent: emitConversionEventMock,
}));
vi.mock('@/lib/billing/billing-group-service', () => ({
  getCommunityForCheckout: getCommunityForCheckoutMock,
}));
vi.mock('@/lib/services/account-lifecycle-service', () => ({
  findActiveAccessPlanIdForCommunity: findActiveAccessPlanIdForCommunityMock,
}));
vi.mock('@/lib/auth/signup-schema', () => ({
  isPlanAvailableForCommunityType: (communityType: string, planId: string) => {
    if (communityType === 'apartment') return planId === 'operations_plus';
    return planId === 'essentials' || planId === 'professional';
  },
}));

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: stripeCheckoutCreateMock,
      },
    },
  })),
}));

import { POST } from '../../src/app/api/v1/subscribe/route';

const URL = 'http://localhost:3000/api/v1/subscribe?communityId=1';

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    requireCommunityMembershipMock.mockResolvedValue({ isAdmin: true });
    requirePermissionMock.mockReturnValue(undefined);
    getCommunityForCheckoutMock.mockResolvedValue({
      id: 1,
      communityType: 'condo_718',
      stripeCustomerId: 'cus_abc',
    });
    findActiveAccessPlanIdForCommunityMock.mockResolvedValue(null);
    resolveStripePriceMock.mockResolvedValue('price_essentials');
    stripeCheckoutCreateMock.mockResolvedValue({
      id: 'cs_test',
      url: 'https://checkout.stripe.test/session',
    });
    emitConversionEventMock.mockResolvedValue(undefined);
  });

  it('creates checkout session and returns canonical { data: { checkoutUrl } }', async () => {
    const res = await POST(buildRequest({ planId: 'essentials' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      data: { checkoutUrl: 'https://checkout.stripe.test/session' },
    });
    expect(stripeCheckoutCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_abc',
        metadata: expect.objectContaining({ communityId: '1', planId: 'essentials' }),
      }),
    );
    expect(emitConversionEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'self_service_upgrade_started' }),
    );
  });

  it('returns 400 when community is not found', async () => {
    getCommunityForCheckoutMock.mockResolvedValue(null);
    const res = await POST(buildRequest({ planId: 'essentials' }));
    expect(res.status).toBe(400);
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it('includes accessPlanId in checkout metadata when an active plan exists', async () => {
    findActiveAccessPlanIdForCommunityMock.mockResolvedValue(99);
    const res = await POST(buildRequest({ planId: 'essentials' }));
    expect(res.status).toBe(200);
    expect(stripeCheckoutCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ accessPlanId: '99' }),
      }),
    );
  });

  it('returns 400 when planId is invalid', async () => {
    const res = await POST(buildRequest({ planId: 'not_a_plan' }));
    expect(res.status).toBe(400);
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when plan is unavailable for community type', async () => {
    getCommunityForCheckoutMock.mockResolvedValue({
      id: 1,
      communityType: 'apartment',
      stripeCustomerId: null,
    });
    const res = await POST(buildRequest({ planId: 'essentials' }));
    expect(res.status).toBe(400);
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });
});
