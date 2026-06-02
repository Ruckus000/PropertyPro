/**
 * Unit tests for POST /api/v1/demo/[slug]/self-service-upgrade (A1 drain #149).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getUserMock,
  getDemoInstanceForUpgradeMock,
  resolveStripePriceMock,
  emitConversionEventMock,
  checkoutCreateMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getDemoInstanceForUpgradeMock: vi.fn(),
  resolveStripePriceMock: vi.fn(),
  emitConversionEventMock: vi.fn(),
  checkoutCreateMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock('@/lib/services/demo-conversion', () => ({
  getDemoInstanceForUpgrade: getDemoInstanceForUpgradeMock,
}));

vi.mock('@/lib/services/stripe-service', () => ({
  resolveStripePrice: resolveStripePriceMock,
}));

vi.mock('@/lib/services/conversion-events', () => ({
  emitConversionEvent: emitConversionEventMock,
}));

vi.mock('@/lib/auth/signup-schema', () => ({
  isPlanAvailableForCommunityType: () => true,
}));

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { create: checkoutCreateMock } },
  })),
}));

import { POST } from '../../src/app/api/v1/demo/[slug]/self-service-upgrade/route';

const DEMO_FIXTURE = {
  id: 5,
  communityId: 42,
  communityType: 'condo_718' as const,
  isDemo: true,
  trialEndsAt: new Date('2099-01-01'),
  demoExpiresAt: new Date('2099-06-01'),
  deletedAt: null,
  demoResidentUserId: 'resident-1',
  demoBoardUserId: 'board-1',
};

function buildRequest(slug: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/demo/${slug}/self-service-upgrade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  planId: 'essentials',
  customerEmail: 'owner@example.com',
  customerName: 'Sunset Condos',
};

describe('POST /api/v1/demo/[slug]/self-service-upgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: 'board-1' } } });
    getDemoInstanceForUpgradeMock.mockResolvedValue(DEMO_FIXTURE);
    resolveStripePriceMock.mockResolvedValue('price_essentials');
    checkoutCreateMock.mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.test/session',
    });
    emitConversionEventMock.mockResolvedValue(undefined);
  });

  it('returns canonical checkout URL for authorized demo user', async () => {
    const res = await POST(buildRequest('sunset-condos', VALID_BODY), {
      params: Promise.resolve({ slug: 'sunset-condos' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { checkoutUrl: string } };
    expect(json).toEqual({
      data: { checkoutUrl: 'https://checkout.stripe.test/session' },
    });
    expect(getDemoInstanceForUpgradeMock).toHaveBeenCalledWith('sunset-condos');
    expect(checkoutCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer_email: 'owner@example.com',
        metadata: expect.objectContaining({
          demoId: '5',
          communityId: '42',
          planId: 'essentials',
        }),
      }),
    );
    expect(emitConversionEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'self_service_upgrade_started', communityId: 42 }),
    );
  });

  it('rejects unauthenticated callers', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(buildRequest('sunset-condos', VALID_BODY), {
      params: Promise.resolve({ slug: 'sunset-condos' }),
    });
    expect(res.status).toBe(403);
    expect(getDemoInstanceForUpgradeMock).not.toHaveBeenCalled();
  });

  it('rejects users who are not demo instance members', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'outsider' } } });
    const res = await POST(buildRequest('sunset-condos', VALID_BODY), {
      params: Promise.resolve({ slug: 'sunset-condos' }),
    });
    expect(res.status).toBe(403);
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });

  it('returns 404 when demo slug is unknown', async () => {
    getDemoInstanceForUpgradeMock.mockResolvedValue(null);
    const res = await POST(buildRequest('missing', VALID_BODY), {
      params: Promise.resolve({ slug: 'missing' }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects invalid request body via contract validation', async () => {
    const res = await POST(
      buildRequest('sunset-condos', { planId: 'essentials', customerEmail: 'not-an-email' }),
      { params: Promise.resolve({ slug: 'sunset-condos' }) },
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });
});
