/**
 * Unit tests for POST /api/v1/subscribe/change-plan (A1 drain #148).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireFreshReauthMock,
  resolveEffectiveCommunityIdMock,
  resolveStripePriceMock,
  changeSubscriptionPlanMock,
  getActiveSubscriptionIntervalMock,
  emitConversionEventMock,
  getCommunityForChangePlanMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireFreshReauthMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  resolveStripePriceMock: vi.fn(),
  changeSubscriptionPlanMock: vi.fn(),
  getActiveSubscriptionIntervalMock: vi.fn(),
  emitConversionEventMock: vi.fn(),
  getCommunityForChangePlanMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/api/reauth-guard', () => ({
  requireFreshReauth: requireFreshReauthMock,
}));
vi.mock('@/lib/services/stripe-service', () => ({
  resolveStripePrice: resolveStripePriceMock,
  changeSubscriptionPlan: changeSubscriptionPlanMock,
  getActiveSubscriptionInterval: getActiveSubscriptionIntervalMock,
}));
vi.mock('@/lib/services/conversion-events', () => ({
  emitConversionEvent: emitConversionEventMock,
}));
vi.mock('@/lib/billing/billing-group-service', () => ({
  getCommunityForChangePlan: getCommunityForChangePlanMock,
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: <H extends (...args: unknown[]) => unknown>(handler: H): H => handler,
}));

vi.mock('@/lib/auth/signup-schema', () => ({
  isPlanAvailableForCommunityType: (communityType: string, planId: string) => {
    if (communityType === 'apartment') return planId === 'operations_plus';
    return planId === 'essentials' || planId === 'professional';
  },
}));

import { POST } from '../../src/app/api/v1/subscribe/change-plan/route';

const URL = 'http://localhost:3000/api/v1/subscribe/change-plan?communityId=1';

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/subscribe/change-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    // R3-03: changing the plan is root-exclusive. The role guard is pure, so
    // these tests run the REAL `requireRootManager` off this fixture.
    requireCommunityMembershipMock.mockResolvedValue({
      isAdmin: true,
      communityName: 'Sunset Condos',
      role: 'root_manager',
      communityId: 1,
    });
    requireFreshReauthMock.mockResolvedValue(undefined);
    getCommunityForChangePlanMock.mockResolvedValue({
      id: 1,
      communityType: 'condo_718',
      stripeSubscriptionId: 'sub_abc',
      subscriptionPlan: 'essentials',
      subscriptionStatus: 'active',
    });
    resolveStripePriceMock.mockResolvedValue('price_new');
    changeSubscriptionPlanMock.mockResolvedValue({ id: 'sub_abc' });
    getActiveSubscriptionIntervalMock.mockResolvedValue('month');
    emitConversionEventMock.mockResolvedValue(undefined);
  });

  it('upgrades essentials → professional and records the conversion event', async () => {
    const res = await POST(buildRequest({ planId: 'professional', billingInterval: 'month' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { ok: true, planId: 'professional', billingInterval: 'month' } });
    expect(resolveStripePriceMock).toHaveBeenCalledWith('professional', 'condo_718', 'month');
    expect(changeSubscriptionPlanMock).toHaveBeenCalledWith('sub_abc', 'price_new');
    expect(emitConversionEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'self_service_plan_changed',
        metadata: expect.objectContaining({
          fromPlan: 'essentials',
          toPlan: 'professional',
          billingInterval: 'month',
        }),
      }),
    );
  });

  it('allows same-plan annual switch (interval upgrade)', async () => {
    getActiveSubscriptionIntervalMock.mockResolvedValue('month');
    const res = await POST(buildRequest({ planId: 'essentials', billingInterval: 'year' }));
    expect(res.status).toBe(200);
    expect(resolveStripePriceMock).toHaveBeenCalledWith('essentials', 'condo_718', 'year');
    expect(changeSubscriptionPlanMock).toHaveBeenCalled();
  });

  it('rejects no-op when plan and interval are unchanged', async () => {
    getActiveSubscriptionIntervalMock.mockResolvedValue('month');
    await expect(
      POST(buildRequest({ planId: 'essentials', billingInterval: 'month' })),
    ).rejects.toMatchObject({ code: 'NO_OP_PLAN_CHANGE', statusCode: 400 });
    expect(changeSubscriptionPlanMock).not.toHaveBeenCalled();
  });

  it('allows same-plan switch when current interval lookup fails (server is the authority)', async () => {
    getActiveSubscriptionIntervalMock.mockRejectedValue(new Error('Stripe down'));
    const res = await POST(buildRequest({ planId: 'essentials', billingInterval: 'year' }));
    expect(res.status).toBe(200);
    expect(changeSubscriptionPlanMock).toHaveBeenCalled();
  });

  it('rejects downgrades with DOWNGRADE_NOT_SUPPORTED', async () => {
    getCommunityForChangePlanMock.mockResolvedValue({
      id: 1,
      communityType: 'condo_718',
      stripeSubscriptionId: 'sub_abc',
      subscriptionPlan: 'professional',
      subscriptionStatus: 'active',
    });
    await expect(
      POST(buildRequest({ planId: 'essentials', billingInterval: 'month' })),
    ).rejects.toMatchObject({ code: 'DOWNGRADE_NOT_SUPPORTED', statusCode: 400 });
    expect(changeSubscriptionPlanMock).not.toHaveBeenCalled();
  });

  it('rejects when community has no active subscription', async () => {
    getCommunityForChangePlanMock.mockResolvedValue({
      id: 1,
      communityType: 'condo_718',
      stripeSubscriptionId: null,
      subscriptionPlan: null,
      subscriptionStatus: null,
    });
    await expect(
      POST(buildRequest({ planId: 'professional', billingInterval: 'month' })),
    ).rejects.toMatchObject({ code: 'NO_ACTIVE_SUBSCRIPTION', statusCode: 400 });
    expect(changeSubscriptionPlanMock).not.toHaveBeenCalled();
  });

  it('rejects plans not available for the community type', async () => {
    await expect(
      POST(buildRequest({ planId: 'operations_plus', billingInterval: 'month' })),
    ).rejects.toMatchObject({ name: 'ValidationError' });
    expect(changeSubscriptionPlanMock).not.toHaveBeenCalled();
  });

  // R3-03 role matrix. `property_manager` passed via `settings:write` before.
  it.each(['property_manager', 'resident'])(
    'rejects %s and never touches the Stripe subscription',
    async (role) => {
      requireCommunityMembershipMock.mockResolvedValue({
        isAdmin: role === 'property_manager',
        communityName: 'Sunset Condos',
        role,
        communityId: 1,
      });

      await expect(
        POST(buildRequest({ planId: 'professional', billingInterval: 'month' })),
      ).rejects.toMatchObject({ name: 'ForbiddenError' });
      expect(changeSubscriptionPlanMock).not.toHaveBeenCalled();
    },
  );

  it('checks root identity BEFORE the reauth prompt', async () => {
    // Ordering matters for UX: a property manager who can never complete this
    // action should not first be made to re-enter their password.
    requireCommunityMembershipMock.mockResolvedValue({
      isAdmin: true,
      communityName: 'Sunset Condos',
      role: 'property_manager',
      communityId: 1,
    });

    await expect(
      POST(buildRequest({ planId: 'professional', billingInterval: 'month' })),
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(requireFreshReauthMock).not.toHaveBeenCalled();
  });

  it('propagates ReauthRequired when the cookie is missing', async () => {
    requireFreshReauthMock.mockRejectedValue(
      Object.assign(new Error('Reauth required'), { code: 'REAUTH_REQUIRED', statusCode: 403 }),
    );
    await expect(
      POST(buildRequest({ planId: 'professional', billingInterval: 'month' })),
    ).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    expect(changeSubscriptionPlanMock).not.toHaveBeenCalled();
  });

  it('wraps Stripe failures as STRIPE_UPDATE_FAILED', async () => {
    changeSubscriptionPlanMock.mockRejectedValue(new Error('Stripe API down'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      POST(buildRequest({ planId: 'professional', billingInterval: 'month' })),
    ).rejects.toMatchObject({ code: 'STRIPE_UPDATE_FAILED', statusCode: 502 });
    consoleErrorSpy.mockRestore();
  });
});
