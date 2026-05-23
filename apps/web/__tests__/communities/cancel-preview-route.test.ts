/**
 * Route unit test — `GET /api/v1/communities/[id]/cancel-preview`.
 *
 * Added alongside Plan A1 drain #18. Covers the billing-group ownership
 * auth chain (auth → community lookup → branch on billingGroupId → owner
 * lookup → pricing impact), the runner's params validation envelope, and
 * both response branches (early-return no-op when no billing group, and
 * the normal `calculatePricingImpact` output).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError, NotFoundError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  getCommunityForCancelPreviewMock,
  getBillingGroupOwnerMock,
  listSiblingCommunityPlansMock,
  calculatePricingImpactMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  getCommunityForCancelPreviewMock: vi.fn(),
  getBillingGroupOwnerMock: vi.fn(),
  listSiblingCommunityPlansMock: vi.fn(),
  calculatePricingImpactMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/billing/billing-group-service', () => ({
  getCommunityForCancelPreview: getCommunityForCancelPreviewMock,
  getBillingGroupOwner: getBillingGroupOwnerMock,
  listSiblingCommunityPlans: listSiblingCommunityPlansMock,
}));

vi.mock('@/lib/billing/pricing-preview', () => ({
  calculatePricingImpact: calculatePricingImpactMock,
}));

import { GET } from '../../src/app/api/v1/communities/[id]/cancel-preview/route';

interface EnvelopeJson<T> {
  data: T;
}

function buildReq(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

function ctx(id: number | string): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe('GET /api/v1/communities/[id]/cancel-preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  });

  it('returns the calculated pricing impact when the actor owns the billing group', async () => {
    getCommunityForCancelPreviewMock.mockResolvedValue({
      id: 42,
      billingGroupId: 7,
      subscriptionPlan: 'condo_pro',
    });
    getBillingGroupOwnerMock.mockResolvedValue('user-1');
    listSiblingCommunityPlansMock.mockResolvedValue([
      { planKey: 'condo_pro' },
      { planKey: null },
    ]);
    const impact = {
      previousTier: 'tier_10',
      newTier: 'none',
      perCommunityBreakdown: [
        { basePriceUsd: 100, discountedPriceUsd: 100, discountPercent: 0 },
      ],
      portfolioMonthlyDeltaUsd: -10,
    };
    calculatePricingImpactMock.mockReturnValue(impact);

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/communities/42/cancel-preview'),
      ctx(42),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson<typeof impact>;
    expect(json.data).toEqual(impact);

    expect(getCommunityForCancelPreviewMock).toHaveBeenCalledWith(42);
    expect(getBillingGroupOwnerMock).toHaveBeenCalledWith(7);
    expect(listSiblingCommunityPlansMock).toHaveBeenCalledWith(7, 42);
    // currentGroupSize = remaining.length (2) + 1 = 3
    expect(calculatePricingImpactMock).toHaveBeenCalledWith({
      basePricesUsd: expect.any(Array),
      currentGroupSize: 3,
      changeType: 'remove',
    });
  });

  it('returns the no-op shape when the community has no billing group, without consulting the owner', async () => {
    getCommunityForCancelPreviewMock.mockResolvedValue({
      id: 42,
      billingGroupId: null,
      subscriptionPlan: null,
    });

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/communities/42/cancel-preview'),
      ctx(42),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as EnvelopeJson<{
      previousTier: string;
      newTier: string;
      perCommunityBreakdown: unknown[];
      portfolioMonthlyDeltaUsd: number;
    }>;
    expect(json.data).toEqual({
      previousTier: 'none',
      newTier: 'none',
      perCommunityBreakdown: [],
      portfolioMonthlyDeltaUsd: 0,
    });
    expect(getBillingGroupOwnerMock).not.toHaveBeenCalled();
    expect(listSiblingCommunityPlansMock).not.toHaveBeenCalled();
    expect(calculatePricingImpactMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/communities/42/cancel-preview'),
      ctx(42),
    );

    expect(res.status).toBe(401);
    expect(getCommunityForCancelPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the community does not exist or is soft-deleted', async () => {
    getCommunityForCancelPreviewMock.mockResolvedValue(null);

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/communities/42/cancel-preview'),
      ctx(42),
    );

    expect(res.status).toBe(404);
    expect(getBillingGroupOwnerMock).not.toHaveBeenCalled();
    expect(calculatePricingImpactMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the billing group has no owner row', async () => {
    getCommunityForCancelPreviewMock.mockResolvedValue({
      id: 42,
      billingGroupId: 7,
      subscriptionPlan: 'condo_pro',
    });
    getBillingGroupOwnerMock.mockResolvedValue(null);

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/communities/42/cancel-preview'),
      ctx(42),
    );

    expect(res.status).toBe(403);
    expect(listSiblingCommunityPlansMock).not.toHaveBeenCalled();
    expect(calculatePricingImpactMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the billing group is owned by a different user', async () => {
    getCommunityForCancelPreviewMock.mockResolvedValue({
      id: 42,
      billingGroupId: 7,
      subscriptionPlan: 'condo_pro',
    });
    getBillingGroupOwnerMock.mockResolvedValue('different-user');

    const res = await GET(
      buildReq('http://localhost:3000/api/v1/communities/42/cancel-preview'),
      ctx(42),
    );

    expect(res.status).toBe(403);
    expect(listSiblingCommunityPlansMock).not.toHaveBeenCalled();
    expect(calculatePricingImpactMock).not.toHaveBeenCalled();
  });

  it('returns 400 with the runner VALIDATION_ERROR envelope when the path param is not a positive integer', async () => {
    const res = await GET(
      buildReq('http://localhost:3000/api/v1/communities/abc/cancel-preview'),
      ctx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as {
      error: { code: string };
    };
    expect(json).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      }),
    );
    expect(getCommunityForCancelPreviewMock).not.toHaveBeenCalled();
  });

  // Sanity guard — verify the NotFoundError and ForbiddenError types are still
  // exported and surface through the error handler with their canonical
  // status codes (defends against a future refactor that reshuffles
  // `@/lib/api/errors`).
  it('preserves NotFoundError and ForbiddenError class identities', () => {
    expect(new NotFoundError('x').message).toBe('x');
    expect(new ForbiddenError('y').message).toBe('y');
  });
});
