/**
 * The four account writes a support (impersonation) session may make, and the
 * `support_access_log` row each one writes BEFORE it mutates — fail closed.
 *
 *   PATCH  /api/v1/account/profile          → support_profile_updated
 *   POST   /api/v1/phone/verify/send        → support_phone_verification_sent
 *   POST   /api/v1/phone/verify/confirm     → support_phone_verified
 *                                             (support_phone_verification_failed on a bad code)
 *   DELETE /api/v1/account/delete           → support_deletion_cancelled
 *
 * The REAL `recordSupportAction` / `maskPhoneToLast4` / `getSupportScope` run
 * here; only the service-role client's insert, the services, and Twilio are
 * stubbed. Ordering is asserted with one shared `callOrder` log that the audit
 * insert and every mutation push into.
 *
 * The routes' pre-existing behaviour outside a support session is covered,
 * unchanged, by account/profile-route.test.ts, account/account-delete-route.test.ts
 * and emergency/phone-verify-routes.test.ts; the "without support" cases here
 * only pin that no support row is written and the mutation still runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  const callOrder: string[] = [];
  const auditInsertMock = vi.fn();
  const fromMock = vi.fn(() => ({ insert: auditInsertMock }));
  const updateUserByIdMock = vi.fn(async () => {
    callOrder.push('authSync');
    return { data: null, error: null };
  });
  return {
    callOrder,
    auditInsertMock,
    fromMock,
    updateUserByIdMock,
    requireAuthenticatedUserIdMock: vi.fn(),
    updateUserProfileMock: vi.fn(),
    getUserProfileSnapshotMock: vi.fn(),
    getUserOtpStateMock: vi.fn(),
    markOtpSentMock: vi.fn(),
    markOtpFailedMock: vi.fn(),
    markPhoneVerifiedMock: vi.fn(),
    findCoolingDeletionRequestForUserMock: vi.fn(),
    cancelUserDeletionMock: vi.fn(),
  };
});

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: h.requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { updateUserById: h.updateUserByIdMock } } }),
  createAdminTypedClient: () => ({ from: h.fromMock }),
}));

vi.mock('@/lib/services/user-profile-service', () => ({
  updateUserProfile: h.updateUserProfileMock,
  getUserProfileSnapshot: h.getUserProfileSnapshotMock,
}));

vi.mock('@/lib/services/phone-verification-service', () => ({
  getUserOtpState: h.getUserOtpStateMock,
  markOtpSent: h.markOtpSentMock,
  markOtpFailed: h.markOtpFailedMock,
  markPhoneVerified: h.markPhoneVerifiedMock,
}));

vi.mock('@/lib/api/reauth-guard', () => ({ requireFreshReauth: vi.fn() }));

vi.mock('@/lib/services/account-lifecycle-service', () => ({
  getLatestUserDeletionRequest: vi.fn(),
  requestUserDeletion: vi.fn(),
  findCoolingDeletionRequestForUser: h.findCoolingDeletionRequestForUserMock,
  cancelUserDeletion: h.cancelUserDeletionMock,
  RootOffboardingAckRequiredError: class extends Error {},
}));

import { PATCH as profilePATCH } from '../../src/app/api/v1/account/profile/route';
import { POST as sendPOST } from '../../src/app/api/v1/phone/verify/send/route';
import { POST as confirmPOST } from '../../src/app/api/v1/phone/verify/confirm/route';
import { DELETE as accountDELETE } from '../../src/app/api/v1/account/delete/route';

const TARGET = 'target-user-uuid';
const ADMIN = 'admin-uuid';
const SESSION_ID = 42;
const COMMUNITY = 7;

const SUPPORT_HEADERS: Record<string, string> = {
  'x-user-id': TARGET,
  'x-support-session': '1',
  'x-support-admin-id': ADMIN,
  'x-support-session-id': String(SESSION_ID),
  'x-support-community-id': String(COMMUNITY),
  'x-community-id': String(COMMUNITY),
};

function request(
  path: string,
  method: string,
  body: unknown,
  support: boolean | Record<string, string> = false,
): NextRequest {
  const supportHeaders =
    support === true ? SUPPORT_HEADERS : support === false ? {} : support;
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...supportHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function auditRows(): Record<string, unknown>[] {
  return h.auditInsertMock.mock.calls.map((call) => call[0] as Record<string, unknown>);
}

function expectAuditEnvelope(row: Record<string, unknown>, event: string): void {
  expect(row).toMatchObject({
    admin_user_id: ADMIN,
    community_id: COMMUNITY,
    session_id: SESSION_ID,
    event,
    resource_type: 'user',
    resource_id: TARGET,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  h.callOrder.length = 0;
  h.requireAuthenticatedUserIdMock.mockResolvedValue(TARGET);
  // Records only after a tick, like real I/O: a route that fired the audit
  // write without awaiting it would log its mutation FIRST, so the call-order
  // assertions below catch a lost `await`, not just a missing call.
  h.auditInsertMock.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.callOrder.push('audit');
    return { error: null };
  });
  h.getUserProfileSnapshotMock.mockImplementation(async () => {
    h.callOrder.push('snapshot');
    return { fullName: 'Olivia Owner', phone: '+13055550001', phoneVerifiedAt: null };
  });
  h.updateUserProfileMock.mockImplementation(async (_id: string, patch: Record<string, unknown>) => {
    h.callOrder.push('updateProfile');
    return { updatedAt: new Date('2026-09-29T12:00:00.000Z'), changedFields: patch };
  });
  h.getUserOtpStateMock.mockResolvedValue({
    otpLastSentAt: null,
    otpFailedAttempts: 1,
    otpLockedUntil: null,
  });
  h.markOtpSentMock.mockImplementation(async () => { h.callOrder.push('markOtpSent'); });
  h.markOtpFailedMock.mockImplementation(async () => { h.callOrder.push('markOtpFailed'); });
  h.markPhoneVerifiedMock.mockImplementation(async () => { h.callOrder.push('markPhoneVerified'); });
  h.findCoolingDeletionRequestForUserMock.mockResolvedValue(91);
  h.cancelUserDeletionMock.mockImplementation(async () => { h.callOrder.push('cancelDeletion'); });

  process.env.TWILIO_ACCOUNT_SID = 'AC_test';
  process.env.TWILIO_AUTH_TOKEN = 'auth_test';
  process.env.TWILIO_VERIFY_SERVICE_SID = 'VA_test';
  process.env.SMS_DISPATCH_ENABLED = 'true';
  fetchMock = vi.fn(async (url: string) => {
    h.callOrder.push(String(url).endsWith('/VerificationCheck') ? 'twilioCheck' : 'twilioSend');
    return new Response(JSON.stringify({ status: 'approved' }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_VERIFY_SERVICE_SID;
  delete process.env.SMS_DISPATCH_ENABLED;
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/account/profile
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/account/profile under a support session', () => {
  it('writes support_profile_updated with names in full and phones masked, BEFORE updating', async () => {
    const res = await profilePATCH(
      request('/api/v1/account/profile', 'PATCH', { fullName: 'Olivia Newname', phone: '(305) 555-9876' }, true),
    );

    expect(res.status).toBe(200);
    expect(h.callOrder).toEqual(['snapshot', 'audit', 'updateProfile', 'authSync']);
    expect(h.fromMock).toHaveBeenCalledWith('support_access_log');
    const [row] = auditRows();
    expectAuditEnvelope(row!, 'support_profile_updated');
    expect(row!.metadata).toEqual({
      changedFields: ['fullName', 'phone'],
      before: { fullName: 'Olivia Owner', phone: '***0001' },
      after: { fullName: 'Olivia Newname', phone: '***9876' },
    });
    // No full phone number anywhere in the row.
    const serialised = JSON.stringify(row);
    expect(serialised).not.toContain('3055550001');
    expect(serialised).not.toContain('555-9876');
    expect(serialised).not.toContain('5559876');
  });

  it('records only the fields sent (name-only update), and a phone clear as null', async () => {
    await profilePATCH(request('/api/v1/account/profile', 'PATCH', { phone: null }, true));
    expect(auditRows()[0]!.metadata).toEqual({
      changedFields: ['phone'],
      before: { phone: '***0001' },
      after: { phone: null },
    });
  });

  it('FAILS CLOSED: an insert error → 500 SUPPORT_AUDIT_FAILED and no update, no auth sync', async () => {
    h.auditInsertMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await profilePATCH(
      request('/api/v1/account/profile', 'PATCH', { fullName: 'Olivia Newname' }, true),
    );

    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('SUPPORT_AUDIT_FAILED');
    expect(h.updateUserProfileMock).not.toHaveBeenCalled();
    expect(h.updateUserByIdMock).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED: a thrown insert → 500 and no update', async () => {
    h.auditInsertMock.mockRejectedValueOnce(new Error('connection reset'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await profilePATCH(
      request('/api/v1/account/profile', 'PATCH', { fullName: 'Olivia Newname' }, true),
    );

    expect(res.status).toBe(500);
    expect(h.updateUserProfileMock).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED: an unreadable consented community → 403, nothing written, no update', async () => {
    // x-community-id disagreeing with x-support-community-id → scope.communityId null.
    const res = await profilePATCH(
      request('/api/v1/account/profile', 'PATCH', { fullName: 'Olivia Newname' }, {
        ...SUPPORT_HEADERS,
        'x-community-id': '8',
      }),
    );

    expect(res.status).toBe(403);
    expect(h.auditInsertMock).not.toHaveBeenCalled();
    expect(h.updateUserProfileMock).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED: a missing operator id → 403, nothing written, no update', async () => {
    const { 'x-support-admin-id': _omit, ...withoutAdmin } = SUPPORT_HEADERS;
    const res = await profilePATCH(
      request('/api/v1/account/profile', 'PATCH', { fullName: 'Olivia Newname' }, withoutAdmin),
    );

    expect(res.status).toBe(403);
    expect(h.auditInsertMock).not.toHaveBeenCalled();
    expect(h.updateUserProfileMock).not.toHaveBeenCalled();
  });

  it('without a support session: no snapshot read, no support row, update runs', async () => {
    const res = await profilePATCH(
      request('/api/v1/account/profile', 'PATCH', { fullName: 'Olivia Newname' }),
    );

    expect(res.status).toBe(200);
    expect(h.getUserProfileSnapshotMock).not.toHaveBeenCalled();
    expect(h.fromMock).not.toHaveBeenCalled();
    expect(h.callOrder).toEqual(['updateProfile', 'authSync']);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/phone/verify/send
// ---------------------------------------------------------------------------

describe('POST /api/v1/phone/verify/send under a support session', () => {
  it('writes support_phone_verification_sent (masked destination) BEFORE the SMS goes out', async () => {
    const res = await sendPOST(
      request('/api/v1/phone/verify/send', 'POST', { phone: '+13055559876' }, true),
    );

    expect(res.status).toBe(200);
    expect(h.callOrder).toEqual(['audit', 'twilioSend', 'markOtpSent']);
    const [row] = auditRows();
    expectAuditEnvelope(row!, 'support_phone_verification_sent');
    expect(row!.metadata).toEqual({
      changedFields: ['otpLastSentAt'],
      before: {},
      after: { phone: '***9876' },
    });
    expect(JSON.stringify(row)).not.toContain('3055559876');
  });

  it('FAILS CLOSED: an insert error → 500, no SMS sent, cooldown not stamped', async () => {
    h.auditInsertMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await sendPOST(
      request('/api/v1/phone/verify/send', 'POST', { phone: '+13055559876' }, true),
    );

    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.markOtpSentMock).not.toHaveBeenCalled();
  });

  it('without a support session: no support row, SMS sent as before', async () => {
    const res = await sendPOST(request('/api/v1/phone/verify/send', 'POST', { phone: '+13055559876' }));

    expect(res.status).toBe(200);
    expect(h.fromMock).not.toHaveBeenCalled();
    expect(h.callOrder).toEqual(['twilioSend', 'markOtpSent']);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/phone/verify/confirm
// ---------------------------------------------------------------------------

describe('POST /api/v1/phone/verify/confirm under a support session', () => {
  const CODE = '482913';

  it('writes support_phone_verified BEFORE markPhoneVerified; phones masked, the code never logged', async () => {
    h.getUserProfileSnapshotMock.mockImplementationOnce(async () => {
      h.callOrder.push('snapshot');
      return {
        fullName: 'Olivia Owner',
        phone: '+13055550001',
        phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
    });

    const res = await confirmPOST(
      request('/api/v1/phone/verify/confirm', 'POST', { phone: '+13055559876', code: CODE }, true),
    );

    expect(res.status).toBe(200);
    expect(h.callOrder).toEqual(['twilioCheck', 'snapshot', 'audit', 'markPhoneVerified']);
    const [row] = auditRows();
    expectAuditEnvelope(row!, 'support_phone_verified');
    expect(row!.metadata).toEqual({
      changedFields: ['phone', 'phoneVerifiedAt'],
      before: { phone: '***0001', phoneVerifiedAt: '2026-01-01T00:00:00.000Z' },
      after: { phone: '***9876', phoneVerified: true },
    });
    const serialised = JSON.stringify(row);
    expect(serialised).not.toContain(CODE);
    expect(serialised).not.toContain('3055559876');
    expect(serialised).not.toContain('3055550001');
  });

  it('FAILS CLOSED: an insert error → error response, markPhoneVerified never runs', async () => {
    h.auditInsertMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await confirmPOST(
      request('/api/v1/phone/verify/confirm', 'POST', { phone: '+13055559876', code: CODE }, true),
    );

    expect(res.status).toBe(500);
    expect(h.markPhoneVerifiedMock).not.toHaveBeenCalled();
  });

  it('a rejected code writes support_phone_verification_failed BEFORE bumping the attempt counter', async () => {
    fetchMock.mockImplementationOnce(async () => {
      h.callOrder.push('twilioCheck');
      return new Response(JSON.stringify({ status: 'pending' }), { status: 200 });
    });

    const res = await confirmPOST(
      request('/api/v1/phone/verify/confirm', 'POST', { phone: '+13055559876', code: CODE }, true),
    );

    expect(res.status).toBe(400);
    expect(h.callOrder).toEqual(['twilioCheck', 'audit', 'markOtpFailed']);
    const [row] = auditRows();
    expectAuditEnvelope(row!, 'support_phone_verification_failed');
    expect(row!.metadata).toEqual({
      changedFields: ['otpFailedAttempts'],
      before: { otpFailedAttempts: 1 },
      after: { otpFailedAttempts: 2 },
    });
    expect(JSON.stringify(row)).not.toContain(CODE);
    expect(h.markPhoneVerifiedMock).not.toHaveBeenCalled();
  });

  it('without a support session: no snapshot, no support row, verification persisted as before', async () => {
    const res = await confirmPOST(
      request('/api/v1/phone/verify/confirm', 'POST', { phone: '+13055559876', code: CODE }),
    );

    expect(res.status).toBe(200);
    expect(h.fromMock).not.toHaveBeenCalled();
    expect(h.getUserProfileSnapshotMock).not.toHaveBeenCalled();
    expect(h.callOrder).toEqual(['twilioCheck', 'markPhoneVerified']);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/account/delete
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/account/delete under a support session', () => {
  it('writes support_deletion_cancelled BEFORE cancelling', async () => {
    const res = await accountDELETE(request('/api/v1/account/delete', 'DELETE', undefined, true));

    expect(res.status).toBe(200);
    expect(h.callOrder).toEqual(['audit', 'cancelDeletion']);
    const [row] = auditRows();
    expectAuditEnvelope(row!, 'support_deletion_cancelled');
    expect(row!.metadata).toEqual({
      changedFields: ['status', 'cancelledAt', 'cancelledBy'],
      before: { deletionRequestId: 91, status: 'cooling' },
      after: { deletionRequestId: 91, status: 'cancelled' },
    });
    expect(h.cancelUserDeletionMock).toHaveBeenCalledWith(91, TARGET);
  });

  it('FAILS CLOSED: an insert error → 500 and the deletion is NOT cancelled', async () => {
    h.auditInsertMock.mockResolvedValueOnce({ error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await accountDELETE(request('/api/v1/account/delete', 'DELETE', undefined, true));

    expect(res.status).toBe(500);
    expect(h.cancelUserDeletionMock).not.toHaveBeenCalled();
  });

  it('no pending request → 404 and no support row (nothing was going to change)', async () => {
    h.findCoolingDeletionRequestForUserMock.mockResolvedValueOnce(null);
    const res = await accountDELETE(request('/api/v1/account/delete', 'DELETE', undefined, true));

    expect(res.status).toBe(404);
    expect(h.auditInsertMock).not.toHaveBeenCalled();
  });

  it('without a support session: no support row, cancellation runs', async () => {
    const res = await accountDELETE(request('/api/v1/account/delete', 'DELETE', undefined));

    expect(res.status).toBe(200);
    expect(h.fromMock).not.toHaveBeenCalled();
    expect(h.callOrder).toEqual(['cancelDeletion']);
  });
});
