/**
 * Unit tests for POST /api/v1/subscribe/change-plan.
 *
 * Covers reauth gate, downgrade rejection, missing-subscription rejection,
 * Stripe failure handling, and the happy upgrade path.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  requireFreshReauthMock,
  resolveEffectiveCommunityIdMock,
  resolveStripePriceMock,
  changeSubscriptionPlanMock,
  emitConversionEventMock,
  selectCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requireFreshReauthMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  resolveStripePriceMock: vi.fn(),
  changeSubscriptionPlanMock: vi.fn(),
  emitConversionEventMock: vi.fn(),
  selectCommunityMock: vi.fn(),
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
vi.mock('@/lib/api/reauth-guard', () => ({
  requireFreshReauth: requireFreshReauthMock,
}));
vi.mock('@/lib/services/stripe-service', () => ({
  resolveStripePrice: resolveStripePriceMock,
  changeSubscriptionPlan: changeSubscriptionPlanMock,
}));
vi.mock('@/lib/services/conversion-events', () => ({
  emitConversionEvent: emitConversionEventMock,
}));

// Pass-through wrapper so thrown errors propagate as rejections instead of
// being caught and serialized into JSON responses.
vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: <H extends (...args: unknown[]) => unknown>(handler: H): H => handler,
}));

// Drizzle chain mock: db.select(...).from(...).where(...).limit(...) → array
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: selectCommunityMock,
        }),
      }),
    }),
  }),
}));

vi.mock('@propertypro/db', () => ({
  communities: { id: 'communities.id' },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
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
    requireCommunityMembershipMock.mockResolvedValue({
      isAdmin: true,
      communityName: 'Sunset Condos',
    });
    requirePermissionMock.mockReturnValue(undefined);
    requireFreshReauthMock.mockResolvedValue(undefined);
    selectCommunityMock.mockResolvedValue([{
      id: 1,
      communityType: 'condo_718',
      stripeSubscriptionId: 'sub_abc',
      subscriptionPlan: 'essentials',
      subscriptionStatus: 'active',
    }]);
    resolveStripePriceMock.mockResolvedValue('price_new');
    changeSubscriptionPlanMock.mockResolvedValue({ id: 'sub_abc' });
    emitConversionEventMock.mockResolvedValue(undefined);
  });

  it('upgrades essentials → professional and records the conversion event', async () => {
    const res = await POST(buildRequest({ planId: 'professional', billingInterval: 'month' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, planId: 'professional', billingInterval: 'month' });
    expect(resolveStripePriceMock).toHaveBeenCalledWith('professional', 'condo_718', 'month');
    expect(changeSubscriptionPlanMock).toHaveBeenCalledWith('sub_abc', 'price_new');
    expect(emitConversionEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'self_service_plan_changed',
        metadata: expect.objectContaining({ fromPlan: 'essentials', toPlan: 'professional', billingInterval: 'month' }),
      }),
    );
  });

  it('allows same-plan annual switch (interval upgrade)', async () => {
    const res = await POST(buildRequest({ planId: 'essentials', billingInterval: 'year' }));
    expect(res.status).toBe(200);
    expect(resolveStripePriceMock).toHaveBeenCalledWith('essentials', 'condo_718', 'year');
    expect(changeSubscriptionPlanMock).toHaveBeenCalled();
  });

  it('rejects downgrades with DOWNGRADE_NOT_SUPPORTED', async () => {
    selectCommunityMock.mockResolvedValue([{
      id: 1,
      communityType: 'condo_718',
      stripeSubscriptionId: 'sub_abc',
      subscriptionPlan: 'professional',
      subscriptionStatus: 'active',
    }]);
    await expect(
      POST(buildRequest({ planId: 'essentials', billingInterval: 'month' })),
    ).rejects.toMatchObject({ code: 'DOWNGRADE_NOT_SUPPORTED', statusCode: 400 });
    expect(changeSubscriptionPlanMock).not.toHaveBeenCalled();
  });

  it('rejects when community has no active subscription', async () => {
    selectCommunityMock.mockResolvedValue([{
      id: 1,
      communityType: 'condo_718',
      stripeSubscriptionId: null,
      subscriptionPlan: null,
      subscriptionStatus: null,
    }]);
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
