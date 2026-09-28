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
  requireCommunityMembershipMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  getCommunityForCancelMock: vi.fn(),
  getBillingGroupOwnerMock: vi.fn(),
  softDeleteCommunityForCancellationMock: vi.fn(),
  recalculateVolumeTierMock: vi.fn(),
  stripeCancelMock: vi.fn(),
  getStripeClientMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  logAuditEventMock: vi.fn(),
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

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
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
    requireCommunityMembershipMock.mockResolvedValue({ role: 'property_manager' });
    logAuditEventMock.mockResolvedValue(undefined);
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

  // A removed manager keeps billing-group ownership: nothing detaches a
  // community from its group or changes the owner. Before this gate, such an
  // owner could still cancel the subscription and soft-delete the community.
  it('refuses a billing-group owner who no longer manages the community (not a member)', async () => {
    requireCommunityMembershipMock.mockRejectedValue(
      new ForbiddenError('User is not a member of this community'),
    );
    const res = await POST(buildReq({ reason: 'price' }), ctx(42));
    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(stripeCancelMock).not.toHaveBeenCalled();
    expect(softDeleteCommunityForCancellationMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('refuses a billing-group owner who is now only a resident of the community', async () => {
    requireCommunityMembershipMock.mockResolvedValue({ role: 'resident' });
    const res = await POST(buildReq({ reason: 'price' }), ctx(42));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.message).toBe('Only a current manager of this community can cancel it');
    expect(stripeCancelMock).not.toHaveBeenCalled();
    expect(softDeleteCommunityForCancellationMock).not.toHaveBeenCalled();
  });

  it('allows an owner who is root_manager of the community', async () => {
    requireCommunityMembershipMock.mockResolvedValue({ role: 'root_manager' });
    const res = await POST(buildReq({ reason: 'price' }), ctx(42));
    expect(res.status).toBe(200);
    expect(softDeleteCommunityForCancellationMock).toHaveBeenCalled();
  });

  it('records a community_canceled audit event for the cancellation', async () => {
    await POST(buildReq({ reason: 'price', note: 'too expensive' }), ctx(42));
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'community_canceled',
      resourceType: 'community',
      resourceId: '42',
      communityId: 42,
      newValues: { reason: 'price', note: 'too expensive' },
      metadata: { billingGroupId: 7, stripeSubscriptionId: 'sub_abc' },
    });
  });
});
