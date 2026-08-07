/**
 * Authorization tests for the Stripe Customer Portal route.
 *
 * The portal exposes invoices and payment methods and lets the visitor CANCEL
 * the subscription. The route verified membership but never checked billing
 * authority, so any member who could pass the reauth prompt — including a
 * tenant — could cancel the community's subscription.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireFreshReauthMock,
  requireCommunityMembershipMock,
  createBillingPortalSessionMock,
  redirectMock,
  limitMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireFreshReauthMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  createBillingPortalSessionMock: vi.fn(),
  redirectMock: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  limitMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/headers', () => ({ headers: async () => new Map() }));
vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/reauth-guard', () => ({ requireFreshReauth: requireFreshReauthMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/services/stripe-service', () => ({
  createBillingPortalSession: createBillingPortalSessionMock,
}));
vi.mock('@/lib/tenant/resolve-community-context', () => ({
  resolveCommunityContext: () => ({ communityId: 42 }),
}));
vi.mock('@/lib/tenant/community-resolution', () => ({ toUrlSearchParams: () => new URLSearchParams() }));
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: limitMock }) }) }),
  }),
}));
vi.mock('@propertypro/db', () => ({
  communities: { id: 'communities.id', stripeCustomerId: 'communities.stripe_customer_id' },
}));
vi.mock('@propertypro/db/filters', () => ({ eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }) }));

import { GET } from '@/app/(authenticated)/billing/portal/route';
import { NextRequest } from 'next/server';

function membership(role: string, isUnitOwner = false) {
  return {
    communityId: 42,
    communityName: 'Test',
    communityType: 'condo_718',
    role,
    isUnitOwner,
    isAdmin: role === 'property_manager' || role === 'root_manager',
  };
}

const req = () => new NextRequest('http://localhost:3000/billing/portal?communityId=42');

describe('GET /billing/portal — authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireFreshReauthMock.mockResolvedValue(undefined);
    limitMock.mockResolvedValue([{ stripeCustomerId: 'cus_abc' }]);
    createBillingPortalSessionMock.mockResolvedValue({ url: 'https://billing.stripe.com/s/x' });
  });

  it.each([
    ['resident (tenant)', 'resident', false],
    ['resident (unit owner)', 'resident', true],
  ])('rejects a %s who passes reauth', async (_label, role, isUnitOwner) => {
    // REGRESSION: this previously reached Stripe and let them cancel billing.
    requireCommunityMembershipMock.mockResolvedValue(membership(role, isUnitOwner));

    // Denied via redirect, not a raw throw — this handler has no
    // withErrorHandler, so a ForbiddenError would surface as an opaque 500.
    await expect(GET(req())).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith(
      '/settings/billing?communityId=42&forbidden=root',
    );
    // The security guarantee: no Stripe session is ever minted for them.
    expect(createBillingPortalSessionMock).not.toHaveBeenCalled();
  });

  // R3-03: the Stripe Customer Portal lets the visitor CANCEL the subscription,
  // so it is root-exclusive. Before the narrowing a property_manager reached
  // Stripe here via `settings:write`.
  it('rejects a property_manager and never mints a Stripe session', async () => {
    requireCommunityMembershipMock.mockResolvedValue(membership('property_manager'));

    await expect(GET(req())).rejects.toThrow('NEXT_REDIRECT');
    expect(createBillingPortalSessionMock).not.toHaveBeenCalled();
  });

  it('tells a bounced property_manager why, via forbidden=root', async () => {
    // Without the param a PM clicking a dunning-email link lands on an
    // unchanged billing page with no account of what happened.
    requireCommunityMembershipMock.mockResolvedValue(membership('property_manager'));

    await expect(GET(req())).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith(
      '/settings/billing?communityId=42&forbidden=root',
    );
  });

  it('allows root_manager', async () => {
    requireCommunityMembershipMock.mockResolvedValue(membership('root_manager'));

    // The handler ends in redirect(), which our mock throws to unwind.
    await expect(GET(req())).rejects.toThrow('NEXT_REDIRECT');
    expect(createBillingPortalSessionMock).toHaveBeenCalledWith(
      'cus_abc',
      expect.any(String),
    );
    expect(redirectMock).toHaveBeenCalledWith('https://billing.stripe.com/s/x');
  });

  it('still requires fresh reauth before anything else', async () => {
    requireCommunityMembershipMock.mockResolvedValue(membership('root_manager'));
    await expect(GET(req())).rejects.toThrow('NEXT_REDIRECT');
    expect(requireFreshReauthMock).toHaveBeenCalledWith('user-1');
  });
});
