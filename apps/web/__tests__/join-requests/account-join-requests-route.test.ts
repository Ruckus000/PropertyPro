import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const requireAuthenticatedUserIdMock = vi.fn();
const checkJoinRequestEligibilityMock = vi.fn();
const createJoinRequestMock = vi.fn();
const listJoinRequestsForUserMock = vi.fn();
const rateLimiterCheckMock = vi.fn();

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: () => requireAuthenticatedUserIdMock(),
}));

vi.mock('@/lib/join-requests/eligibility', () => ({
  checkJoinRequestEligibility: (...args: unknown[]) =>
    checkJoinRequestEligibilityMock(...args),
}));

vi.mock('@/lib/join-requests/approve-request', () => ({
  createJoinRequest: (...args: unknown[]) => createJoinRequestMock(...args),
  listJoinRequestsForUser: (...args: unknown[]) => listJoinRequestsForUserMock(...args),
}));

vi.mock('@/lib/middleware/rate-limiter', () => ({
  getRateLimiter: () => ({
    check: (...args: unknown[]) => rateLimiterCheckMock(...args),
  }),
}));

import { GET, POST } from '@/app/api/v1/account/join-requests/route';

const USER_ID = 'user-abc';

function postRequest(body: unknown): NextRequest {
  return new NextRequest('https://app.test/api/v1/account/join-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('account/join-requests route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue(USER_ID);
    rateLimiterCheckMock.mockReturnValue({ allowed: true, retryAfter: 0 });
    checkJoinRequestEligibilityMock.mockResolvedValue({ eligible: true });
    createJoinRequestMock.mockResolvedValue({ id: 99, status: 'pending' });
    listJoinRequestsForUserMock.mockResolvedValue([
      { id: 1, communityId: 5, status: 'pending' },
    ]);
  });

  describe('POST', () => {
    it('creates a join request and returns canonical envelope', async () => {
      const res = await POST(
        postRequest({
          communityId: 5,
          unitIdentifier: '12A',
          residentType: 'owner',
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        data: { requestId: 99, status: 'pending' },
      });
      expect(createJoinRequestMock).toHaveBeenCalledWith({
        userId: USER_ID,
        communityId: 5,
        unitIdentifier: '12A',
        residentType: 'owner',
      });
    });

    it('returns 401 when unauthenticated', async () => {
      const { UnauthorizedError } = await import('@/lib/api/errors');
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
      const res = await POST(
        postRequest({
          communityId: 5,
          unitIdentifier: '12A',
          residentType: 'owner',
        }),
      );
      expect(res.status).toBe(401);
      expect(createJoinRequestMock).not.toHaveBeenCalled();
    });

    it('returns 429 when rate limited', async () => {
      rateLimiterCheckMock.mockReturnValueOnce({ allowed: false, retryAfter: 120 });
      const res = await POST(
        postRequest({
          communityId: 5,
          unitIdentifier: '12A',
          residentType: 'owner',
        }),
      );
      expect(res.status).toBe(429);
      expect(checkJoinRequestEligibilityMock).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid body', async () => {
      const res = await POST(postRequest({ communityId: 5 }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error?.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 when not eligible', async () => {
      checkJoinRequestEligibilityMock.mockResolvedValueOnce({
        eligible: false,
        reason: 'pending_request',
      });
      const res = await POST(
        postRequest({
          communityId: 5,
          unitIdentifier: '12A',
          residentType: 'tenant',
        }),
      );
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error?.details?.reason).toBe('pending_request');
    });
  });

  describe('GET', () => {
    it('lists join requests for the authenticated user', async () => {
      const res = await GET(
        new NextRequest('https://app.test/api/v1/account/join-requests'),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        data: [{ id: 1, communityId: 5, status: 'pending' }],
      });
      expect(listJoinRequestsForUserMock).toHaveBeenCalledWith(USER_ID);
    });

    it('returns 401 when unauthenticated', async () => {
      const { UnauthorizedError } = await import('@/lib/api/errors');
      requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
      const res = await GET(
        new NextRequest('https://app.test/api/v1/account/join-requests'),
      );
      expect(res.status).toBe(401);
    });
  });
});
