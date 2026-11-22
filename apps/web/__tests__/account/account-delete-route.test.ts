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
  findCoolingDeletionRequestIdsForUserMock,
  cancelUserDeletionMock,
  getUserProfileSnapshotMock,
  sendEmailMock,
  MockRootOffboardingAckRequiredError,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireFreshReauthMock: vi.fn(),
  getLatestUserDeletionRequestMock: vi.fn(),
  requestUserDeletionMock: vi.fn(),
  findCoolingDeletionRequestIdsForUserMock: vi.fn(),
  cancelUserDeletionMock: vi.fn(),
  getUserProfileSnapshotMock: vi.fn(),
  sendEmailMock: vi.fn(),
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
  findCoolingDeletionRequestIdsForUser: findCoolingDeletionRequestIdsForUserMock,
  cancelUserDeletion: cancelUserDeletionMock,
  RootOffboardingAckRequiredError: MockRootOffboardingAckRequiredError,
}));

// The address comes from the caller's own users row.
vi.mock('@/lib/services/user-profile-service', () => ({
  getUserProfileSnapshot: (userId: string) => getUserProfileSnapshotMock(userId),
}));

// The deletion-email helper runs for real; only the transport is mocked. The
// template stubs return null — the assertions read the props off `react`.
vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  AccountDeletionInitiatedEmail: () => null,
  AccountDeletionExecutedEmail: () => null,
  AccountRecoveredEmail: () => null,
}));

interface SentEmail {
  to: string;
  subject: string;
  category: string;
  idempotencyKey: string;
  react: { props: Record<string, unknown> };
}

function lastSentEmail(): SentEmail {
  return sendEmailMock.mock.calls.at(-1)![0] as SentEmail;
}

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
    requestUserDeletionMock.mockResolvedValue({ request: activeRequest, created: true });
    getUserProfileSnapshotMock.mockResolvedValue({ email: 'marisol@example.com', fullName: 'Marisol' });
    sendEmailMock.mockResolvedValue({ id: 'test_1' });
  });

  // A second POST (two tabs, a retry after a slow response) gets the pending
  // request back. It was already announced, so no second "initiated" email.
  it('returns the pending request on a repeat, and does not email again', async () => {
    requestUserDeletionMock.mockResolvedValueOnce({ request: activeRequest, created: true });
    requestUserDeletionMock.mockResolvedValueOnce({ request: activeRequest, created: false });

    const first = await post();
    const second = await post();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await second.json()).data).toMatchObject({ id: 9, status: 'cooling' });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  function post() {
    return POST(new NextRequest(URL, { method: 'POST', headers: { 'content-type': 'application/json' } }));
  }

  it('emails the account holder that deletion was requested, with the real timeline', async () => {
    const res = await post();

    expect(res.status).toBe(200);
    expect(getUserProfileSnapshotMock).toHaveBeenCalledWith('user-1');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sent = lastSentEmail();
    expect(sent.to).toBe('marisol@example.com');
    expect(sent.category).toBe('transactional');
    expect(sent.idempotencyKey).toBe('account-deletion/initiated/9');
    // coolingEndsAt is 2026-06-15T00:00Z, which is the evening of June 14 in
    // Florida; the purge is 6 months after the account is turned off.
    expect(sent.react.props).toMatchObject({
      recipientName: 'Marisol',
      coolingEndDate: 'June 14, 2026',
      purgeDate: 'December 14, 2026',
      cancelUrl: expect.stringMatching(/\/settings\/account$/),
    });
  });

  it('still succeeds when the email cannot be sent', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('Resend API error: 500'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await post();
    consoleErrorSpy.mockRestore();

    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: 9, status: 'cooling' });
  });

  it('still succeeds when the recipient lookup fails, and sends nothing', async () => {
    getUserProfileSnapshotMock.mockRejectedValueOnce(new Error('db down'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await post();
    consoleErrorSpy.mockRestore();

    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('never emails a purged @redacted address', async () => {
    getUserProfileSnapshotMock.mockResolvedValueOnce({ email: 'deleted-user-1@redacted', fullName: 'Deleted User' });

    const res = await post();

    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the request is refused for a root acknowledgement', async () => {
    requestUserDeletionMock.mockRejectedValueOnce(new MockRootOffboardingAckRequiredError([]));

    const res = await post();

    expect(res.status).toBe(409);
    expect(sendEmailMock).not.toHaveBeenCalled();
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
    findCoolingDeletionRequestIdsForUserMock.mockResolvedValue([9]);
    cancelUserDeletionMock.mockResolvedValue({
      outcome: 'cancelled',
      requests: [{ id: 9, status: 'cancelled' }],
    });
    getUserProfileSnapshotMock.mockResolvedValue({ email: 'marisol@example.com', fullName: 'Marisol' });
    sendEmailMock.mockResolvedValue({ id: 'test_1' });
  });

  it('emails that the deletion was cancelled, without saying who cancelled it', async () => {
    const res = await DELETE(new NextRequest(URL, { method: 'DELETE' }));

    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sent = lastSentEmail();
    expect(sent.to).toBe('marisol@example.com');
    expect(sent.idempotencyKey).toBe('account-deletion/cancelled/9');
    // The account was never turned off, so this is the "not deleted" variant.
    // A support session can make this same call, so the copy is passive.
    expect(sent.react.props).toMatchObject({ recipientName: 'Marisol', wasDeactivated: false });
  });

  it('still cancels when the email cannot be sent', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('Resend API error: 500'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await DELETE(new NextRequest(URL, { method: 'DELETE' }));
    consoleErrorSpy.mockRestore();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { cancelled: true } });
    expect(cancelUserDeletionMock).toHaveBeenCalledWith('user-1', 'user-1', 9);
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
    expect(cancelUserDeletionMock).toHaveBeenCalledWith('user-1', 'user-1', 9);
  });

  it('sends ONE cancelled email when two cooling requests are stopped together', async () => {
    cancelUserDeletionMock.mockResolvedValueOnce({
      outcome: 'cancelled',
      requests: [
        { id: 9, status: 'cancelled' },
        { id: 12, status: 'cancelled' },
      ],
    });

    const res = await DELETE(new NextRequest(URL, { method: 'DELETE' }));

    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(lastSentEmail().idempotencyKey).toBe('account-deletion/cancelled/9');
  });

  // The 04:00 UTC cron soft-deleted the request between the lookup and the
  // cancel. The account is deleted and banned; saying it stays open is false.
  it('returns 409 and sends no email when the request was soft-deleted before the cancel landed', async () => {
    cancelUserDeletionMock.mockResolvedValueOnce({ outcome: 'too_late', status: 'soft_deleted' });

    const res = await DELETE(new NextRequest(URL, { method: 'DELETE' }));

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe('CONFLICT');
    expect(json.error.message).toMatch(/already been deleted/);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  // Two DELETEs at once (two tabs, a retry, an admin intervention): both find
  // request 9, the other one cancels it first, and this one updates nothing.
  // The account is open and the deletion is cancelled, so this is a success.
  // It emails too: an admin's intervene sends nothing, and when the winner was
  // another tab the shared idempotency key makes the provider deliver once.
  it('returns 200 and emails under the same key when a concurrent cancel got there first', async () => {
    cancelUserDeletionMock.mockResolvedValueOnce({ outcome: 'already_cancelled' });

    const res = await DELETE(new NextRequest(URL, { method: 'DELETE' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { cancelled: true } });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    // The same key the winning tab used, so the two collapse to one delivery.
    expect(lastSentEmail().idempotencyKey).toBe('account-deletion/cancelled/9');
  });

  it('returns 404 when no active request and does not cancel', async () => {
    findCoolingDeletionRequestIdsForUserMock.mockResolvedValue([]);

    const res = await DELETE(
      new NextRequest(URL, {
        method: 'DELETE',
      }),
    );
    expect(res.status).toBe(404);
    expect(cancelUserDeletionMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated and does not cancel', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await DELETE(
      new NextRequest(URL, {
        method: 'DELETE',
      }),
    );
    expect(res.status).toBe(401);
    expect(findCoolingDeletionRequestIdsForUserMock).not.toHaveBeenCalled();
    expect(cancelUserDeletionMock).not.toHaveBeenCalled();
  });
});
