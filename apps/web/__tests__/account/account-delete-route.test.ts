/**
 * Unit tests for GET/POST/DELETE /api/v1/account/delete (A1 drain #160).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ReauthRequiredError } from '../../src/lib/api/errors';
const {
  requireAuthenticatedUserIdMock,
  requireFreshReauthMock,
  getLatestUserDeletionRequestMock,
  requestUserDeletionMock,
  findCoolingDeletionRequestForUserMock,
  cancelUserDeletionMock,
  MockRootOffboardingAckRequiredError,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireFreshReauthMock: vi.fn(),
  getLatestUserDeletionRequestMock: vi.fn(),
  requestUserDeletionMock: vi.fn(),
  findCoolingDeletionRequestForUserMock: vi.fn(),
  cancelUserDeletionMock: vi.fn(),
  // The route does `err instanceof RootOffboardingAckRequiredError`, so the
  // class the test throws must be the SAME identity the route imports. Declared
  // here (not at top level) because vi.mock factories are hoisted above module
  // scope and would otherwise hit a TDZ ReferenceError.
  MockRootOffboardingAckRequiredError: class extends Error {
    communities: unknown[];
    constructor(communities: unknown[]) {
      super('Root-offboarding acknowledgement required.');
      this.name = 'RootOffboardingAckRequiredError';
      this.communities = communities;
    }
  },
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/reauth-guard', () => ({
  requireFreshReauth: requireFreshReauthMock,
}));

vi.mock('@/lib/services/account-lifecycle-service', () => ({
  getLatestUserDeletionRequest: getLatestUserDeletionRequestMock,
  requestUserDeletion: requestUserDeletionMock,
  findCoolingDeletionRequestForUser: findCoolingDeletionRequestForUserMock,
  cancelUserDeletion: cancelUserDeletionMock,
  RootOffboardingAckRequiredError: MockRootOffboardingAckRequiredError,
}));

import { DELETE, GET, POST } from '../../src/app/api/v1/account/delete/route';

const URL = 'http://localhost:3000/api/v1/account/delete';

const activeRequest = {
  id: 9,
  userId: 'user-1',
  status: 'cooling',
  coolingEndsAt: new Date('2026-06-15T00:00:00.000Z'),
};

describe('GET /api/v1/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
  });

  it('returns the active deletion request', async () => {
    getLatestUserDeletionRequestMock.mockResolvedValue(activeRequest);

    const res = await GET(new NextRequest(URL));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({
      id: 9,
      userId: 'user-1',
      status: 'cooling',
    });
    expect(json.data.coolingEndsAt).toBe(activeRequest.coolingEndsAt.toISOString());
    expect(getLatestUserDeletionRequestMock).toHaveBeenCalledWith('user-1');
  });

  it('returns null when there is no active request', async () => {
    getLatestUserDeletionRequestMock.mockResolvedValue(null);

    const res = await GET(new NextRequest(URL));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: null });
  });

  it('returns null when the latest request is cancelled', async () => {
    getLatestUserDeletionRequestMock.mockResolvedValue({
      ...activeRequest,
      status: 'cancelled',
    });

    const res = await GET(new NextRequest(URL));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: null });
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(new NextRequest(URL));
    expect(res.status).toBe(401);
    expect(getLatestUserDeletionRequestMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireFreshReauthMock.mockResolvedValue(undefined);
    requestUserDeletionMock.mockResolvedValue(activeRequest);
  });

  it('requests deletion after fresh reauth', async () => {
    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({
      id: 9,
      userId: 'user-1',
      status: 'cooling',
    });
    expect(json.data.coolingEndsAt).toBe(activeRequest.coolingEndsAt.toISOString());
    expect(requireFreshReauthMock).toHaveBeenCalledWith('user-1');
    expect(requestUserDeletionMock).toHaveBeenCalledWith('user-1', false);
  });

  // R3-03b: a root deleting their account orphans the community, so the first
  // attempt is refused with a CONFIRMABLE 409 rather than a 403 — the client
  // re-submits with the ack. 409 is load-bearing: 403 would read as "you may
  // not", which is wrong; erasure stays self-service.
  it('returns 409 with the affected communities when the caller is root and has not acknowledged', async () => {
    requestUserDeletionMock.mockRejectedValueOnce(
      new MockRootOffboardingAckRequiredError([
        { communityId: 42, name: 'Sunset Condos', hasSuccessor: true },
        { communityId: 99, name: 'Palm Shores HOA', hasSuccessor: false },
      ]),
    );

    const res = await POST(
      new NextRequest(URL, { method: 'POST', headers: { 'content-type': 'application/json' } }),
    );

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe('ROOT_OFFBOARDING_ACK_REQUIRED');
    // The prompt needs names, and needs to single out the community nobody can
    // take over — that one has no self-service recovery.
    expect(json.error.details.communities).toEqual([
      { communityId: 42, name: 'Sunset Condos', hasSuccessor: true },
      { communityId: 99, name: 'Palm Shores HOA', hasSuccessor: false },
    ]);
  });

  it('forwards the acknowledgement on re-submit', async () => {
    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acknowledgeRootOffboarding: true }),
      }),
    );

    expect(res.status).toBe(200);
    expect(requestUserDeletionMock).toHaveBeenCalledWith('user-1', true);
  });

  it('checks reauth BEFORE the root-offboarding gate', async () => {
    // Ordering matters: a stale session must not be able to enumerate which
    // communities the user is root of via the 409 payload.
    requireFreshReauthMock.mockRejectedValueOnce(new ReauthRequiredError());

    await POST(
      new NextRequest(URL, { method: 'POST', headers: { 'content-type': 'application/json' } }),
    ).catch(() => undefined);

    expect(requestUserDeletionMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated and does not call reauth or service', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(401);
    expect(requireFreshReauthMock).not.toHaveBeenCalled();
    expect(requestUserDeletionMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    findCoolingDeletionRequestForUserMock.mockResolvedValue(9);
    cancelUserDeletionMock.mockResolvedValue(undefined);
  });

  it('cancels the active deletion request', async () => {
    const res = await DELETE(
      new NextRequest(URL, {
        method: 'DELETE',
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { cancelled: true } });
    expect(cancelUserDeletionMock).toHaveBeenCalledWith(9, 'user-1');
  });

  it('returns 404 when no active request and does not cancel', async () => {
    findCoolingDeletionRequestForUserMock.mockResolvedValue(null);

    const res = await DELETE(
      new NextRequest(URL, {
        method: 'DELETE',
      }),
    );
    expect(res.status).toBe(404);
    expect(cancelUserDeletionMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated and does not cancel', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await DELETE(
      new NextRequest(URL, {
        method: 'DELETE',
      }),
    );
    expect(res.status).toBe(401);
    expect(findCoolingDeletionRequestForUserMock).not.toHaveBeenCalled();
    expect(cancelUserDeletionMock).not.toHaveBeenCalled();
  });
});
