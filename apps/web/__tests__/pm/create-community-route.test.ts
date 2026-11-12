import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: vi.fn().mockResolvedValue('user-123'),
}));
const gates = vi.hoisted(() => ({
  requireAddCommunityAccess: vi.fn(),
  requireFreshReauth: vi.fn(),
}));
vi.mock('@/lib/api/pm-communities', () => ({
  isPmAdminInAnyCommunity: vi.fn().mockResolvedValue(true),
  requireAddCommunityAccess: gates.requireAddCommunityAccess,
}));
vi.mock('@/lib/api/reauth-guard', () => ({ requireFreshReauth: gates.requireFreshReauth }));
vi.mock('@propertypro/db/unsafe', () => ({
  isPmAdminInAnyCommunity: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/auth/signup', () => ({
  checkSignupSubdomainAvailability: vi.fn().mockResolvedValue({
    available: true,
    normalizedSubdomain: 'oceanview-towers',
    reason: 'available',
    message: 'Available',
  }),
}));
vi.mock('@/lib/pm/create-community', () => ({
  createCommunityForPm: vi.fn(),
}));
vi.mock('@/lib/services/stripe-service', () => ({
  createAddCommunityCheckout: vi.fn().mockResolvedValue({
    clientSecret: 'cs_test_secret_123',
    sessionId: 'cs_test_session_123',
  }),
}));
vi.mock('@/lib/billing/billing-group-service', () => ({
  getOrCreateBillingGroupForPm: vi.fn().mockResolvedValue({
    billingGroupId: 42,
    stripeCustomerId: 'cus_test_123',
  }),
  createPendingAddToGroupSignup: vi.fn().mockResolvedValue(7),
  recordAddToGroupCheckoutSession: vi.fn().mockResolvedValue(undefined),
  retireOwnAddToGroupSignup: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/v1/pm/communities/route';
import { createAddCommunityCheckout } from '@/lib/services/stripe-service';
import {
  getOrCreateBillingGroupForPm,
  recordAddToGroupCheckoutSession,
  retireOwnAddToGroupSignup,
} from '@/lib/billing/billing-group-service';
import { checkSignupSubdomainAvailability } from '@/lib/auth/signup';
import { ForbiddenError } from '@/lib/api/errors';
import { ReauthRequiredError } from '@/lib/api/errors/ReauthRequiredError';

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/v1/pm/communities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: 'Oceanview Towers',
  communityType: 'condo_718',
  planId: 'essentials',
  addressLine1: '123 Ocean Blvd',
  city: 'Miami',
  state: 'FL',
  zipCode: '33139',
  subdomain: 'oceanview-towers',
  timezone: 'America/New_York',
  unitCount: 48,
};

describe('POST /api/v1/pm/communities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gates.requireAddCommunityAccess.mockResolvedValue(42);
    gates.requireFreshReauth.mockResolvedValue(undefined);
  });

  // #1115: the PM's own abandoned checkout for this subdomain is released
  // before availability is judged, or it reports their own subdomain as taken.
  it('retires the PM\'s own abandoned checkout before checking the subdomain', async () => {
    await POST(makeRequest({ ...validBody, subdomain: 'Oceanview-Towers' }));
    expect(retireOwnAddToGroupSignup).toHaveBeenCalledWith('user-123', 'oceanview-towers');
    expect(vi.mocked(retireOwnAddToGroupSignup).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(checkSignupSubdomainAvailability).mock.invocationCallOrder[0]!,
    );
  });

  it('starts a Stripe checkout session with valid input', async () => {
    const res = await POST(makeRequest(validBody));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      clientSecret: 'cs_test_secret_123',
      pendingSignupId: 7,
      billingGroupId: 42,
    });
    expect(getOrCreateBillingGroupForPm).toHaveBeenCalledWith('user-123');
    expect(createAddCommunityCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        billingGroupId: 42,
        stripeCustomerId: 'cus_test_123',
        pendingSignupId: 7,
        communityType: 'condo_718',
        planId: 'essentials',
      }),
    );
  });

  it("returns the PM to the host they are signed in on, never localhost", async () => {
    const req = new NextRequest('https://pm.getpropertypro.com/api/v1/pm/communities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', host: 'pm.getpropertypro.com' },
      body: JSON.stringify(validBody),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(createAddCommunityCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ returnBaseUrl: 'https://pm.getpropertypro.com' }),
    );
  });

  // `createAddCommunityCheckout` has always returned a sessionId and this route
  // discarded it, so `payload.stripeCheckoutSessionId` was never written. That
  // is the only key `reconcileLostCheckoutSignups` can look a signup up by, so a
  // PM who genuinely PAID but whose webhook was lost could never be recovered.
  it('persists the Stripe session id so a lost webhook is recoverable', async () => {
    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(200);
    expect(recordAddToGroupCheckoutSession).toHaveBeenCalledWith({
      pendingSignupId: 7,
      sessionId: 'cs_test_session_123',
    });
  });

  it('rejects missing required fields', async () => {
    const res = await POST(makeRequest({ name: 'Test' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid community type', async () => {
    const res = await POST(makeRequest({ ...validBody, communityType: 'invalid' }));
    expect(res.status).toBe(400);
  });

  describe('who may add', () => {
    it('refuses anyone the add-community rule refuses, before any checkout work', async () => {
      gates.requireAddCommunityAccess.mockRejectedValue(
        new ForbiddenError('Only the root manager who pays for this portfolio can add a community.'),
      );

      const res = await POST(makeRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error.message).toBe('Only the root manager who pays for this portfolio can add a community.');
      expect(gates.requireAddCommunityAccess).toHaveBeenCalledWith('user-123');
      expect(retireOwnAddToGroupSignup).not.toHaveBeenCalled();
      expect(getOrCreateBillingGroupForPm).not.toHaveBeenCalled();
      expect(createAddCommunityCheckout).not.toHaveBeenCalled();
    });

    it('asks for a fresh password, like a plan change', async () => {
      gates.requireFreshReauth.mockRejectedValue(new ReauthRequiredError());

      const res = await POST(makeRequest(validBody));
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error.code).toBe('REAUTH_REQUIRED');
      expect(gates.requireFreshReauth).toHaveBeenCalledWith('user-123');
      expect(getOrCreateBillingGroupForPm).not.toHaveBeenCalled();
      expect(createAddCommunityCheckout).not.toHaveBeenCalled();
    });
  });

  describe('what may be added', () => {
    it('refuses a plan the community type does not offer', async () => {
      const res = await POST(makeRequest({ ...validBody, communityType: 'apartment', planId: 'essentials' }));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error.message).toMatch(/plan is not available/i);
      expect(createAddCommunityCheckout).not.toHaveBeenCalled();
    });

    it('accepts the apartment plan for an apartment community', async () => {
      const res = await POST(makeRequest({ ...validBody, communityType: 'apartment', planId: 'operations_plus' }));
      expect(res.status).toBe(200);
    });

    it('refuses a state other than Florida', async () => {
      const res = await POST(makeRequest({ ...validBody, state: 'GA' }));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error.message).toMatch(/Florida/);
      expect(createAddCommunityCheckout).not.toHaveBeenCalled();
    });

    it('refuses a ZIP outside Florida even with FL as the state', async () => {
      const res = await POST(makeRequest({ ...validBody, zipCode: '30301' }));
      expect(res.status).toBe(400);
      expect(createAddCommunityCheckout).not.toHaveBeenCalled();
    });

    it('accepts a Florida ZIP+4 and a lower-case state', async () => {
      const res = await POST(makeRequest({ ...validBody, state: 'fl', zipCode: '33139-1234' }));
      expect(res.status).toBe(200);
    });
  });
});
