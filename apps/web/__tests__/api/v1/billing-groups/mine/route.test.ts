/**
 * Route unit test — `GET /api/v1/billing-groups/mine`.
 *
 * Added alongside the Plan A1 drain #6 (session-anchored, single-object
 * payload; mirrors drain #1's shape with a `z.object` response instead of
 * `z.array`). The previous implementation had no route-level unit test;
 * this fills the gap and locks in:
 *
 *   - the canonical `{ data: { billingGroupId } }` envelope
 *   - the PM gate (`isPmAdminInAnyCommunity` returning false → 403)
 *   - the 401 unauthenticated path
 *   - the on-demand creation side effect via
 *     `getOrCreateBillingGroupForPm` being invoked exactly once with the
 *     authenticated user id
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../../../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  isPmAdminInAnyCommunityMock,
  getOrCreateBillingGroupForPmMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  isPmAdminInAnyCommunityMock: vi.fn(),
  getOrCreateBillingGroupForPmMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock,
}));

vi.mock('@/lib/billing/billing-group-service', () => ({
  getOrCreateBillingGroupForPm: getOrCreateBillingGroupForPmMock,
}));

import { GET } from '../../../../../src/app/api/v1/billing-groups/mine/route';

interface EnvelopeJson {
  data: { billingGroupId: number };
}

interface ErrorJson {
  error: { code: string; message: string };
}

describe('billing-groups/mine route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
  });

  it('returns the canonical { data: { billingGroupId } } envelope for a PM (happy path)', async () => {
    isPmAdminInAnyCommunityMock.mockResolvedValueOnce(true);
    getOrCreateBillingGroupForPmMock.mockResolvedValueOnce({ billingGroupId: 42 });

    const req = new NextRequest('http://localhost:3000/api/v1/billing-groups/mine');
    const res = await GET(req);
    const json = (await res.json()) as EnvelopeJson;

    expect(res.status).toBe(200);
    expect(json).toEqual({ data: { billingGroupId: 42 } });
    // Side-effect smoke: on-demand-create invoked exactly once with the
    // authenticated user id, proving the creation path is wired through
    // the runner. (Drain is behavior-preserving.)
    expect(getOrCreateBillingGroupForPmMock).toHaveBeenCalledTimes(1);
    expect(getOrCreateBillingGroupForPmMock).toHaveBeenCalledWith('user-123');
    expect(isPmAdminInAnyCommunityMock).toHaveBeenCalledWith('user-123');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/billing-groups/mine');
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(isPmAdminInAnyCommunityMock).not.toHaveBeenCalled();
    expect(getOrCreateBillingGroupForPmMock).not.toHaveBeenCalled();
  });

  it('returns 403 with the literal PM-only message when the user is not a PM admin in any community', async () => {
    isPmAdminInAnyCommunityMock.mockResolvedValueOnce(false);

    const req = new NextRequest('http://localhost:3000/api/v1/billing-groups/mine');
    const res = await GET(req);
    const json = (await res.json()) as ErrorJson;

    expect(res.status).toBe(403);
    expect(json.error.message).toBe('This endpoint is only available to property managers');
    expect(getOrCreateBillingGroupForPmMock).not.toHaveBeenCalled();
  });
});
