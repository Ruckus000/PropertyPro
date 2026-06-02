/**
 * Route unit test — `POST /api/v1/communities/[id]/cancel` (A1 drain #155).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError, NotFoundError } from '../../src/lib/api/errors';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  getCommunityForCancelMock,
  getBillingGroupOwnerMock,
  softDeleteCommunityForCancellationMock,
  recalculateVolumeTierMock,
  stripeCancelMock,
  getStripeClientMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  getCommunityForCancelMock: vi.fn(),
  getBillingGroupOwnerMock: vi.fn(),
  softDeleteCommunityForCancellationMock: vi.fn(),
  recalculateVolumeTierMock: vi.fn(),
  stripeCancelMock: vi.fn(),
  getStripeClientMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/billing/billing-group-service', () => ({
  getCommunityForCancel: getCommunityForCancelMock,
  getBillingGroupOwner: getBillingGroupOwnerMock,
  softDeleteCommunityForCancellation: softDeleteCommunityForCancellationMock,
  recalculateVolumeTier: recalculateVolumeTierMock,
}));

vi.mock('@/lib/services/stripe-service', () => ({
  getStripeClient: getStripeClientMock,
}));

import { POST } from '../../src/app/api/v1/communities/[id]/cancel/route';

function buildReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/communities/42/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctx(id: number | string): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe('POST /api/v1/communities/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    getCommunityForCancelMock.mockResolvedValue({
      id: 42,
      name: 'Sunset Condos',
      billingGroupId: 7,
      stripeSubscriptionId: 'sub_abc',
    });
    getBillingGroupOwnerMock.mockResolvedValue('user-1');
    stripeCancelMock.mockResolvedValue({ id: 'sub_abc' });
    getStripeClientMock.mockReturnValue({
      subscriptions: { cancel: stripeCancelMock },
    });
    softDeleteCommunityForCancellationMock.mockResolvedValue(undefined);
    recalculateVolumeTierMock.mockResolvedValue(undefined);
  });

  it('cancels subscription, soft-deletes community, and recalculates tier', async () => {
    const res = await POST(
      buildReq({ reason: 'price', note: 'too expensive' }),
      ctx(42),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { canceled: true, communityId: 42 } });

    expect(stripeCancelMock).toHaveBeenCalledWith('sub_abc');
    expect(softDeleteCommunityForCancellationMock).toHaveBeenCalledWith(42, {
      reason: 'price',
      note: 'too expensive',
    });
    expect(recalculateVolumeTierMock).toHaveBeenCalledWith(7, {
      canceledCommunityName: 'Sunset Condos',
    });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValue(new UnauthorizedError());
    const res = await POST(buildReq({ reason: 'price' }), ctx(42));
    expect(res.status).toBe(401);
  });

  it('returns 404 when community is not found', async () => {
    getCommunityForCancelMock.mockResolvedValue(null);
    const res = await POST(buildReq({ reason: 'price' }), ctx(42));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.message).toBe('Community not found');
  });

  it('returns 403 when caller does not own the billing group', async () => {
    getBillingGroupOwnerMock.mockResolvedValue('other-user');
    const res = await POST(buildReq({ reason: 'price' }), ctx(42));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.message).toBe('You do not own this billing group');
    expect(stripeCancelMock).not.toHaveBeenCalled();
    expect(softDeleteCommunityForCancellationMock).not.toHaveBeenCalled();
  });

  it('returns 403 when community has no billing group', async () => {
    getCommunityForCancelMock.mockResolvedValue({
      id: 42,
      name: 'Sunset Condos',
      billingGroupId: null,
      stripeSubscriptionId: null,
    });
    const res = await POST(buildReq({ reason: 'price' }), ctx(42));
    expect(res.status).toBe(403);
    expect(getBillingGroupOwnerMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid community id param', async () => {
    const res = await POST(buildReq({ reason: 'price' }), ctx('abc'));
    expect(res.status).toBe(400);
    expect(getCommunityForCancelMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid cancellation reason', async () => {
    const res = await POST(buildReq({ reason: 'bogus' }), ctx(42));
    expect(res.status).toBe(400);
    expect(getCommunityForCancelMock).not.toHaveBeenCalled();
  });

  it('ignores Stripe 404 and proceeds with soft-delete', async () => {
    stripeCancelMock.mockRejectedValue({ statusCode: 404 });
    const res = await POST(buildReq({ reason: 'price' }), ctx(42));
    expect(res.status).toBe(200);
    expect(softDeleteCommunityForCancellationMock).toHaveBeenCalled();
  });
});
