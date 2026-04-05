import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/services/stripe-service', async (original) => {
  const actual = await original<typeof import('@/lib/services/stripe-service')>();
  return {
    ...actual,
    createAddCommunityCheckout: vi.fn().mockResolvedValue({
      clientSecret: 'cs_test_secret',
      sessionId: 'cs_test_123',
    }),
  };
});

vi.mock('@/lib/billing/billing-group-service', async (original) => {
  const actual = await original<typeof import('@/lib/billing/billing-group-service')>();
  return {
    ...actual,
    getOrCreateBillingGroupForPm: vi.fn().mockResolvedValue({
      billingGroupId: 42,
      stripeCustomerId: 'cus_test_pm',
    }),
    createPendingAddToGroupSignup: vi.fn().mockResolvedValue(7),
  };
});

vi.mock('@propertypro/db/unsafe', async (original) => {
  const actual = await original<typeof import('@propertypro/db/unsafe')>();
  return {
    ...actual,
    isPmAdminInAnyCommunity: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: vi.fn().mockResolvedValue('00000000-0000-0000-0000-000000000042'),
}));

vi.mock('@/lib/auth/signup', () => ({
  checkSignupSubdomainAvailability: vi.fn().mockResolvedValue({
    available: true,
    normalizedSubdomain: 'test-condo-gated',
  }),
}));

import { POST } from '@/app/api/v1/pm/communities/route';
import { NextRequest } from 'next/server';

describe('POST /api/v1/pm/communities (gated)', () => {
  it('returns 202 with checkout clientSecret (does NOT create community directly)', async () => {
    const req = new NextRequest('http://localhost/api/v1/pm/communities', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Condo',
        communityType: 'condo_718',
        planId: 'essentials',
        addressLine1: '123 Main St',
        city: 'Miami',
        state: 'FL',
        zipCode: '33101',
        subdomain: 'test-condo-gated',
        timezone: 'America/New_York',
        unitCount: 20,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.clientSecret).toBe('cs_test_secret');
    expect(body.data.pendingSignupId).toBe(7);
    expect(body.data.billingGroupId).toBe(42);
  });
});
