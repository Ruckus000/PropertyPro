/**
 * Unit tests for POST /api/v1/subscribe (A1 drain #156).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  resolveStripePriceMock,
  emitConversionEventMock,
  getCommunityForCheckoutMock,
  findActiveAccessPlanIdForCommunityMock,
  stripeCheckoutCreateMock,
  requireFreshReauthMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  resolveStripePriceMock: vi.fn(),
  emitConversionEventMock: vi.fn(),
  getCommunityForCheckoutMock: vi.fn(),
  findActiveAccessPlanIdForCommunityMock: vi.fn(),
  stripeCheckoutCreateMock: vi.fn(),
  requireFreshReauthMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/api/reauth-guard', () => ({
  requireFreshReauth: requireFreshReauthMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/services/stripe-service', () => ({
  resolveStripePrice: resolveStripePriceMock,
  getStripeClient: () => ({
    checkout: { sessions: { create: stripeCheckoutCreateMock } },
  }),
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
    // R3-03: purchasing a plan is root-exclusive. The role guard is pure, so
    // these tests run the REAL `requireRootManager` off this fixture rather
    // than stubbing authorization out.
    requireCommunityMembershipMock.mockResolvedValue({
      isAdmin: true,
      role: 'root_manager',
      communityId: 1,
    });
    getCommunityForCheckoutMock.mockResolvedValue({
      id: 1,
      communityType: 'condo_718',
      stripeCustomerId: 'cus_abc',
      stripeSubscriptionId: null,
      subscriptionStatus: null,
    });
    findActiveAccessPlanIdForCommunityMock.mockResolvedValue(null);
    resolveStripePriceMock.mockResolvedValue('price_essentials');
    stripeCheckoutCreateMock.mockResolvedValue({
      id: 'cs_test',
      url: 'https://checkout.stripe.test/session',
    });
    emitConversionEventMock.mockResolvedValue(undefined);
    requireFreshReauthMock.mockResolvedValue(undefined);
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
      expect.objectContaining({ idempotencyKey: expect.stringContaining('subscribe:1:cus_abc:essentials:month') }),
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
      expect.anything(),
    );
  });

  it('returns 400 when planId is invalid', async () => {
    const res = await POST(buildRequest({ planId: 'not_a_plan' }));
    expect(res.status).toBe(400);
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  // R3-03 role matrix. `property_manager` is the regression that matters: it
  // passed this route via `settings:write` until the narrowing.
  it.each(['property_manager', 'resident'])(
    'returns 403 for %s and never opens a checkout session',
    async (role) => {
      requireCommunityMembershipMock.mockResolvedValue({
        isAdmin: role === 'property_manager',
        role,
        communityId: 1,
      });

      const res = await POST(buildRequest({ planId: 'essentials' }));

      expect(res.status).toBe(403);
      expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
    },
  );

  it('returns 400 when plan is unavailable for community type', async () => {
    getCommunityForCheckoutMock.mockResolvedValue({
      id: 1,
      communityType: 'apartment',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
    });
    const res = await POST(buildRequest({ planId: 'essentials' }));
    expect(res.status).toBe(400);
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });
  it('defaults to monthly billing and carries communityId in the return URLs', async () => {
    const res = await POST(buildRequest({ planId: 'essentials' }));
    expect(res.status).toBe(200);
    expect(resolveStripePriceMock).toHaveBeenCalledWith('essentials', 'condo_718', 'month');
    const [params] = stripeCheckoutCreateMock.mock.calls[0]!;
    // Without communityId the billing page can't resolve its tenant on a
    // non-community host, and the post-checkout landing would 'need a communityId'.
    expect(params.success_url).toContain('communityId=1');
    expect(params.cancel_url).toContain('communityId=1');
  });

  it('passes an explicit annual billingInterval through to the price lookup', async () => {
    const res = await POST(buildRequest({ planId: 'essentials', billingInterval: 'year' }));
    expect(res.status).toBe(200);
    expect(resolveStripePriceMock).toHaveBeenCalledWith('essentials', 'condo_718', 'year');
  });

  it('rejects a second checkout when the community already has an active subscription', async () => {
    // Guards against minting a duplicate Stripe subscription (double-billing).
    // Tier/interval switches belong to /api/v1/subscribe/change-plan.
    getCommunityForCheckoutMock.mockResolvedValue({
      id: 1,
      communityType: 'condo_718',
      stripeCustomerId: 'cus_abc',
      stripeSubscriptionId: 'sub_live',
      subscriptionStatus: 'active',
    });
    const res = await POST(buildRequest({ planId: 'professional' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: expect.objectContaining({ code: 'ALREADY_SUBSCRIBED' }),
    });
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it('allows re-subscribing after cancellation (plan nulled, sub id left behind)', async () => {
    // The cancel webhook nulls subscriptionPlan and sets status='canceled'.
    // That must remain a purchasable state or churned customers can never return.
    getCommunityForCheckoutMock.mockResolvedValue({
      id: 1,
      communityType: 'condo_718',
      stripeCustomerId: 'cus_abc',
      stripeSubscriptionId: 'sub_old',
      subscriptionStatus: 'canceled',
    });
    const res = await POST(buildRequest({ planId: 'essentials' }));
    expect(res.status).toBe(200);
    expect(stripeCheckoutCreateMock).toHaveBeenCalled();
  });

  it('rejects a trialing community — a live subscription that is not "active"', async () => {
    // REGRESSION (the expensive one): the guard used to be
    // `subscriptionStatus === 'active'`. Every self-serve signup spends its
    // first SIGNUP_TRIAL_DAYS (30) in `trialing` WITH a live subscription, so
    // an equality check waved every new customer through and sold them a
    // second subscription against the same Stripe customer.
    getCommunityForCheckoutMock.mockResolvedValue({
      id: 1,
      communityType: 'condo_718',
      stripeCustomerId: 'cus_abc',
      stripeSubscriptionId: 'sub_trial',
      subscriptionStatus: 'trialing',
    });
    const res = await POST(buildRequest({ planId: 'professional' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: expect.objectContaining({ code: 'ALREADY_SUBSCRIBED' }),
    });
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it.each(['past_due', 'incomplete', 'paused', 'some_future_stripe_status'])(
    'rejects a community whose status is %s (live or unknown, never assumed dead)',
    async (subscriptionStatus) => {
      getCommunityForCheckoutMock.mockResolvedValue({
        id: 1,
        communityType: 'condo_718',
        stripeCustomerId: 'cus_abc',
        stripeSubscriptionId: 'sub_x',
        subscriptionStatus,
      });
      const res = await POST(buildRequest({ planId: 'professional' }));
      expect(res.status).toBe(400);
      expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
    },
  );

  it('treats a subscription id with an unsynced (null) status as live', async () => {
    getCommunityForCheckoutMock.mockResolvedValue({
      id: 1,
      communityType: 'condo_718',
      stripeCustomerId: 'cus_abc',
      stripeSubscriptionId: 'sub_unsynced',
      subscriptionStatus: null,
    });
    const res = await POST(buildRequest({ planId: 'essentials' }));
    expect(res.status).toBe(400);
    expect(stripeCheckoutCreateMock).not.toHaveBeenCalled();
  });

  it('requires fresh reauth when a Stripe customer is already on file', async () => {
    // Completing a re-subscribe repoints communities.stripe_customer_id, which
    // is what /billing/portal resolves — so a stolen session could otherwise
    // rebind billing identity to a customer the attacker controls.
    getCommunityForCheckoutMock.mockResolvedValue({
      id: 1,
      communityType: 'condo_718',
      stripeCustomerId: 'cus_existing',
      stripeSubscriptionId: 'sub_old',
      subscriptionStatus: 'canceled',
    });
    const res = await POST(buildRequest({ planId: 'essentials' }));
    expect(res.status).toBe(200);
    expect(requireFreshReauthMock).toHaveBeenCalledWith('user-1');
  });

  it('does NOT require reauth for a first-ever purchase', async () => {
    getCommunityForCheckoutMock.mockResolvedValue({
      id: 1,
      communityType: 'condo_718',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
    });
    const res = await POST(buildRequest({ planId: 'essentials' }));
    expect(res.status).toBe(200);
    expect(requireFreshReauthMock).not.toHaveBeenCalled();
  });
});
