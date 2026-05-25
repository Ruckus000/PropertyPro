/**
 * Route unit test — `GET /api/v1/billing-groups/[id]/preview`.
 *
 * Added alongside Plan A1 drain #21. Covers the billing-group ownership
 * auth chain (auth → owner-side group lookup → 403 on missing/mismatch →
 * sibling-plan list → pricing impact), the runner's params and query
 * validation envelopes, and the concrete `calculatePricingImpact`
 * invocation shape (drain #18 review lesson: assert concrete arrays, not
 * `expect.any(Array)`).
 *
 * `PLAN_MONTHLY_PRICES_USD` is intentionally NOT mocked — the test asserts
 * concrete prices flowing through the route (essentials=199, professional=349)
 * to lock in the wire behavior.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  getBillingGroupByOwnerMock,
  listSiblingCommunityPlansMock,
  calculatePricingImpactMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  getBillingGroupByOwnerMock: vi.fn(),
  listSiblingCommunityPlansMock: vi.fn(),
  calculatePricingImpactMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/billing/billing-group-service', () => ({
  getBillingGroupByOwner: getBillingGroupByOwnerMock,
  listSiblingCommunityPlans: listSiblingCommunityPlansMock,
}));

vi.mock('@/lib/billing/pricing-preview', () => ({
  calculatePricingImpact: calculatePricingImpactMock,
}));

import { GET } from '../../src/app/api/v1/billing-groups/[id]/preview/route';

interface EnvelopeJson<T> {
  data: T;
}

function buildReq(url: string): NextRequest {
  return new NextRequest(url);
}

function ctx(id: number | string): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe('GET /api/v1/billing-groups/[id]/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  });

  it('returns the calculated pricing impact when the actor owns the billing group', async () => {
    getBillingGroupByOwnerMock.mockResolvedValue({ id: 7, ownerUserId: 'user-1' });
    listSiblingCommunityPlansMock.mockResolvedValue([
      { planKey: 'essentials' },
      { planKey: null },
    ]);
    const impact = {
      previousTier: 'tier_1',
      newTier: 'tier_2',
      perCommunityBreakdown: [
        { basePriceUsd: 199, discountedPriceUsd: 199, discountPercent: 0 },
      ],
      portfolioMonthlyDeltaUsd: 349,
    };
    calculatePricingImpactMock.mockReturnValue(impact);

    const res = await GET(
      buildReq(
        'http://localhost:3000/api/v1/billing-groups/7/preview?planId=professional&communityType=condo_718',
      ),
      ctx(7),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson<typeof impact>;
    expect(json.data).toEqual(impact);

    expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
    expect(getBillingGroupByOwnerMock).toHaveBeenCalledWith('user-1');
    expect(listSiblingCommunityPlansMock).toHaveBeenCalledWith(7);
    // existing: [{planKey:'essentials'}, {planKey:null}] → basePrices = [199, 0]
    // query.planId = 'professional' → newPrice = 349
    // basePricesUsd = [...existing, newPrice] = [199, 0, 349]
    // currentGroupSize = existing.length = 2
    expect(calculatePricingImpactMock).toHaveBeenCalledWith({
      basePricesUsd: [199, 0, 349],
      currentGroupSize: 2,
      changeType: 'add',
    });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      buildReq(
        'http://localhost:3000/api/v1/billing-groups/7/preview?planId=essentials&communityType=condo_718',
      ),
      ctx(7),
    );

    expect(res.status).toBe(401);
    expect(getBillingGroupByOwnerMock).not.toHaveBeenCalled();
    expect(listSiblingCommunityPlansMock).not.toHaveBeenCalled();
    expect(calculatePricingImpactMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the actor owns no billing group', async () => {
    getBillingGroupByOwnerMock.mockResolvedValue(null);

    const res = await GET(
      buildReq(
        'http://localhost:3000/api/v1/billing-groups/7/preview?planId=essentials&communityType=condo_718',
      ),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(listSiblingCommunityPlansMock).not.toHaveBeenCalled();
    expect(calculatePricingImpactMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the actor owns a different billing group than the path param', async () => {
    getBillingGroupByOwnerMock.mockResolvedValue({ id: 99, ownerUserId: 'user-1' });

    const res = await GET(
      buildReq(
        'http://localhost:3000/api/v1/billing-groups/7/preview?planId=essentials&communityType=condo_718',
      ),
      ctx(7),
    );

    expect(res.status).toBe(403);
    expect(listSiblingCommunityPlansMock).not.toHaveBeenCalled();
    expect(calculatePricingImpactMock).not.toHaveBeenCalled();
  });

  it('returns 400 with VALIDATION_ERROR when the path param is not a positive integer', async () => {
    const res = await GET(
      buildReq(
        'http://localhost:3000/api/v1/billing-groups/abc/preview?planId=essentials&communityType=condo_718',
      ),
      ctx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(getBillingGroupByOwnerMock).not.toHaveBeenCalled();
  });

  it('returns 400 with VALIDATION_ERROR when planId is missing', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/billing-groups/7/preview?communityType=condo_718'),
      ctx(7),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(getBillingGroupByOwnerMock).not.toHaveBeenCalled();
  });

  it('returns 400 with VALIDATION_ERROR when planId is not one of the allowed values', async () => {
    const res = await GET(
      buildReq(
        'http://localhost:3000/api/v1/billing-groups/7/preview?planId=foo&communityType=condo_718',
      ),
      ctx(7),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(getBillingGroupByOwnerMock).not.toHaveBeenCalled();
  });

  it('returns 400 with VALIDATION_ERROR when communityType is missing', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/billing-groups/7/preview?planId=essentials'),
      ctx(7),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(getBillingGroupByOwnerMock).not.toHaveBeenCalled();
  });

  it('returns 400 with VALIDATION_ERROR when communityType is not one of the allowed values', async () => {
    const res = await GET(
      buildReq(
        'http://localhost:3000/api/v1/billing-groups/7/preview?planId=essentials&communityType=mansion',
      ),
      ctx(7),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(getBillingGroupByOwnerMock).not.toHaveBeenCalled();
  });

  // Sanity guard — verify ForbiddenError still exports with its canonical
  // class identity (defends against a future refactor of `@/lib/api/errors`).
  it('preserves ForbiddenError class identity', () => {
    expect(new ForbiddenError('y').message).toBe('y');
  });
});
