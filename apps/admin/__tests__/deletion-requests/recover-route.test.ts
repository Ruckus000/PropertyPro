import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The recover route's orchestration: which op it calls, in what order with the
 * auth unban, what it answers and what it audits. The transactions themselves
 * (the claim over every request of the target, the stale / purged / too-recent
 * refusals, the finish, the release) are tested against a real database in
 * apps/web/__tests__/integration/deletion-recovery-lifecycle.integration.test.ts.
 */

const requirePlatformAdmin = vi.fn();
const updateUserById = vi.fn();
const sendEmail = vi.fn();
const claimDeletionRecoveryOp = vi.fn();
const completeUserRecoveryOp = vi.fn();
const emailLookup = vi.fn();
// The order the account-changing calls happened in.
const writes: string[] = [];

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  claimDeletionRecoveryOp: (...args: unknown[]) => {
    writes.push('claim');
    return claimDeletionRecoveryOp(...args);
  },
  completeUserRecoveryOp: (...args: unknown[]) => {
    writes.push('complete');
    return completeUserRecoveryOp(...args);
  },
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => {
      if (table !== 'users') throw new Error(`unexpected table ${table}`);
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          emailLookup(col, val);
          return chain;
        },
        maybeSingle: () => Promise.resolve(emailResult),
      };
      return chain;
    },
    auth: {
      admin: {
        updateUserById: (...args: unknown[]) => {
          const attrs = args[1] as { ban_duration?: string };
          writes.push(attrs.ban_duration === 'none' ? 'auth:unban' : `auth:ban:${attrs.ban_duration}`);
          return updateUserById(...args);
        },
      },
    },
  }),
}));

let emailResult: { data: unknown; error: unknown };

// Audit writes go through logAdminAction, which uses its OWN supabase client.
// Mock the helper so the call itself can be asserted — its own semantics are
// covered by __tests__/audit/log-admin-action.test.ts.
const logAdminAction = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  AdminAuditLogError: class AdminAuditLogError extends Error {},
}));

// Transport only; the template stub returns null and the assertions read the
// props off `react`.
vi.mock('@propertypro/email', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  AccountRecoveredEmail: () => null,
}));

interface SentEmail {
  to: string;
  category: string;
  idempotencyKey: string;
  react: { props: Record<string, unknown> };
}

interface AuditCall {
  action: string;
  communityId?: number | null;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  bestEffort?: boolean;
}

const audits = () => logAdminAction.mock.calls.map((c) => c[0] as AuditCall);

interface AuthCalls {
  liftBan: () => Promise<boolean>;
  reapplyBan: () => Promise<boolean>;
}

async function callRecover(id: string) {
  const mod = await import('@/app/api/admin/deletion-requests/[id]/recover/route');
  return mod.POST(new Request(`http://localhost/${id}`, { method: 'POST' }) as never, {
    params: Promise.resolve({ id }),
  });
}

const REQUEST = { id: 42, requestType: 'user', userId: 'user-uuid', communityId: null, status: 'recovered', recoveredAt: null };
const USER_CLAIM = {
  outcome: 'claimed',
  request: REQUEST,
  userId: 'user-uuid',
  claimedRequestIds: [42, 43],
  cancelledRequestIds: [44],
  resumed: false,
};
const COMMUNITY_RECOVERED = {
  outcome: 'recovered',
  request: { ...REQUEST, requestType: 'community', userId: 'requester-uuid', communityId: 99 },
  communityId: 99,
  claimedRequestIds: [42],
  cancelledRequestIds: [],
  resumed: false,
};

describe('POST /api/admin/deletion-requests/[id]/recover', () => {
  beforeEach(() => {
    writes.length = 0;
    vi.clearAllMocks();
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1' });
    sendEmail.mockResolvedValue({ id: 'test_1' });
    updateUserById.mockResolvedValue({ data: {}, error: null });
    claimDeletionRecoveryOp.mockResolvedValue(USER_CLAIM);
    // Stands in for the op's own control flow (tested on a real database):
    // lift the ban; on failure re-apply it, and give the claim back only then.
    completeUserRecoveryOp.mockImplementation(async (_userId: string, auth: AuthCalls) => {
      if (!(await auth.liftBan())) {
        const banReapplied = await auth.reapplyBan();
        return { outcome: 'unban_failed', banReapplied, released: banReapplied, releasedRequestIds: banReapplied ? [42, 43] : [] };
      }
      return { outcome: 'recovered', finishedRequestIds: [42, 43] };
    });
    emailResult = { data: { email: 'marisol@example.com', full_name: 'Marisol' }, error: null };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a non-numeric id before touching anything', async () => {
    const response = await callRecover('abc');

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it('claims as the platform admin, then completes with ban calls that lift and re-apply the right ban', async () => {
    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(claimDeletionRecoveryOp).toHaveBeenCalledWith(42, { adminUserId: 'admin-1' });
    expect(writes).toEqual(['claim', 'complete', 'auth:unban']);
    expect(completeUserRecoveryOp).toHaveBeenCalledWith('user-uuid', expect.any(Object), { now: expect.any(Date) });
    expect(updateUserById).toHaveBeenCalledWith('user-uuid', {
      ban_duration: 'none',
      user_metadata: { soft_deleted: null },
    });

    // The re-apply callback puts back exactly the cron's soft-delete ban.
    const auth = completeUserRecoveryOp.mock.calls[0]![1] as AuthCalls;
    updateUserById.mockClear();
    await expect(auth.reapplyBan()).resolves.toBe(true);
    expect(updateUserById).toHaveBeenCalledWith('user-uuid', {
      ban_duration: '876600h',
      user_metadata: { soft_deleted: true },
    });
  });

  it('the ban callbacks report failure as false, never as a throw', async () => {
    await callRecover('42');
    const auth = completeUserRecoveryOp.mock.calls[0]![1] as AuthCalls;

    updateUserById.mockResolvedValueOnce({ data: null, error: { message: 'GoTrue down' } });
    await expect(auth.liftBan()).resolves.toBe(false);
    updateUserById.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(auth.reapplyBan()).resolves.toBe(false);
  });

  it('audits every request it recovered and cancelled, best effort once the recovery has committed', async () => {
    await callRecover('42');

    expect(audits()).toEqual([
      expect.objectContaining({
        action: 'deletion_request_recovered',
        communityId: null,
        oldValues: { status: 'soft_deleted' },
        newValues: expect.objectContaining({
          status: 'recovered',
          request_type: 'user',
          recovered_request_ids: [42, 43],
          cancelled_request_ids: [44],
          resumed: false,
        }),
        bestEffort: true,
      }),
    ]);
  });

  it('a community is recovered by the claim alone: no unban, no finish', async () => {
    claimDeletionRecoveryOp.mockResolvedValue(COMMUNITY_RECOVERED);

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(writes).toEqual(['claim']);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(audits()[0]).toMatchObject({
      action: 'deletion_request_recovered',
      communityId: 99,
      newValues: { request_type: 'community', restored_community_id: 99 },
      bestEffort: true,
    });
  });

  it('resumes an unfinished recovery, and says so in the audit row', async () => {
    claimDeletionRecoveryOp.mockResolvedValue({ ...USER_CLAIM, resumed: true });

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(writes).toEqual(['claim', 'complete', 'auth:unban']);
    expect(audits()[0]).toMatchObject({ oldValues: { status: 'recovered' }, newValues: { resumed: true } });
  });

  it.each([['not_found'], ['not_recoverable']])('returns 404, and changes nothing, on %s', async (outcome) => {
    claimDeletionRecoveryOp.mockResolvedValue({ outcome, request: REQUEST });

    const response = await callRecover('42');

    expect(response.status).toBe(404);
    expect(writes).toEqual(['claim']);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('returns 409 with a failure audit row when a purge claimed the target first', async () => {
    claimDeletionRecoveryOp.mockResolvedValue({ outcome: 'purged', request: REQUEST });

    const response = await callRecover('42');

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('ALREADY_PURGED');
    expect(writes).toEqual(['claim']);
    expect(audits()[0]).toMatchObject({
      action: 'deletion_request_recover_failed',
      metadata: { stage: 'claim', code: 'ALREADY_PURGED' },
      bestEffort: true,
    });
  });

  // A stale row's account is open: recovering it must not cancel the user's
  // newer live request (the op wrote nothing).
  it('returns 409 NOT_DELETED for a stale request, and unbans nothing', async () => {
    claimDeletionRecoveryOp.mockResolvedValue({ outcome: 'stale', request: { ...REQUEST, status: 'soft_deleted' } });

    const response = await callRecover('42');

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('NOT_DELETED');
    expect(writes).toEqual(['claim']);
  });

  it('returns 409 RECENTLY_DELETED while the cron ban may still land', async () => {
    claimDeletionRecoveryOp.mockResolvedValue({
      outcome: 'too_recent',
      request: REQUEST,
      retryAfter: new Date('2026-11-22T04:15:00.000Z'),
    });

    const response = await callRecover('42');

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('RECENTLY_DELETED');
    expect(body.error.message).toContain('2026-11-22T04:15:00.000Z');
    expect(writes).toEqual(['claim']);
  });

  it('returns 409 TARGET_MISSING, naming what is gone', async () => {
    claimDeletionRecoveryOp.mockResolvedValue({ outcome: 'target_missing', request: REQUEST });
    const user = await callRecover('42');
    expect(user.status).toBe(409);
    expect((await user.json()).error.message).toMatch(/^The account this request names/);

    claimDeletionRecoveryOp.mockResolvedValue({ outcome: 'target_missing', request: { ...REQUEST, requestType: 'community' } });
    expect((await (await callRecover('42')).json()).error.message).toMatch(/^The community this request names/);
  });

  it('reports a failed unban whose claim was given back, after the ban was re-applied', async () => {
    updateUserById
      .mockResolvedValueOnce({ data: null, error: { message: 'GoTrue down' } })
      .mockResolvedValueOnce({ data: {}, error: null });

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('USER_UNBAN_FAILED');
    expect(body.error.message).toMatch(/Nothing was restored/);
    expect(writes).toEqual(['claim', 'complete', 'auth:unban', 'auth:ban:876600h']);
    expect(audits()[0]).toMatchObject({
      action: 'deletion_request_recover_failed',
      metadata: {
        stage: 'unban_user',
        code: 'USER_UNBAN_FAILED',
        ban_reapplied: true,
        claim_released: true,
        released_request_ids: [42, 43],
        completed: ['claim'],
      },
      bestEffort: true,
    });
  });

  it('says the recovery is unfinished and resumable when the claim could not be given back', async () => {
    updateUserById.mockResolvedValue({ data: null, error: { message: 'GoTrue down' } });

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toMatch(/unfinished recovery; retry/);
    expect(audits()[0]!.metadata).toMatchObject({ ban_reapplied: false, claim_released: false });
  });

  // Another attempt on the same account held the lock and settled it; this
  // one must change nothing and say so, not report a recovery or a failure.
  it('returns 409 RECOVERY_CONCURRENT, auditing nothing, when another attempt settled the claim first', async () => {
    completeUserRecoveryOp.mockResolvedValue({ outcome: 'not_claimed' });

    const response = await callRecover('42');

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('RECOVERY_CONCURRENT');
    expect(logAdminAction).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('reports an unfinished recovery when completing throws', async () => {
    completeUserRecoveryOp.mockRejectedValue(new Error('db down'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await callRecover('42');
    consoleErrorSpy.mockRestore();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('USER_RESTORE_FAILED');
    expect(body.error.message).toMatch(/unfinished recovery; retry/);
    expect(audits()[0]).toMatchObject({
      action: 'deletion_request_recover_failed',
      metadata: { stage: 'restore_user', completed: ['claim'] },
    });
  });

  it('returns 409 when completing finds the row scrubbed', async () => {
    completeUserRecoveryOp.mockResolvedValue({ outcome: 'purged' });

    const response = await callRecover('42');

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('ALREADY_PURGED');
    expect(audits().map((a) => a.action)).toEqual(['deletion_request_recover_failed']);
  });

  // The success audit is best effort: the recovery has committed, and a 500
  // would send the operator to retry a recovery that already happened.
  it('still returns 200 when the success audit cannot be written', async () => {
    logAdminAction.mockImplementationOnce(async (...args: unknown[]) => {
      expect((args[0] as AuditCall).bestEffort).toBe(true);
    });

    expect((await callRecover('42')).status).toBe(200);
  });

  describe('account restored email', () => {
    it('emails the restored user, without claiming they cancelled anything', async () => {
      const response = await callRecover('42');

      expect(response.status).toBe(200);
      expect(emailLookup).toHaveBeenCalledWith('id', 'user-uuid');
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const sent = sendEmail.mock.calls[0]![0] as SentEmail;
      expect(sent.to).toBe('marisol@example.com');
      expect(sent.category).toBe('transactional');
      expect(sent.idempotencyKey).toBe('account-deletion/recovered/42');
      expect(sent.react.props).toMatchObject({ recipientName: 'Marisol', wasDeactivated: true });
      // Audited before the best-effort send.
      expect(logAdminAction).toHaveBeenCalledTimes(1);
    });

    it('still returns 200 when the email cannot be sent', async () => {
      sendEmail.mockRejectedValueOnce(new Error('Resend API error: 500'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await callRecover('42');
      consoleErrorSpy.mockRestore();

      expect(response.status).toBe(200);
    });

    it('still returns 200 when the address lookup fails, and sends nothing', async () => {
      emailResult = { data: null, error: { message: 'boom' } };
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await callRecover('42');
      consoleErrorSpy.mockRestore();

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('never emails a purged @redacted address', async () => {
      emailResult = { data: { email: 'deleted-user-uuid@redacted', full_name: 'Deleted User' }, error: null };

      const response = await callRecover('42');

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends nothing for a community recovery', async () => {
      claimDeletionRecoveryOp.mockResolvedValue(COMMUNITY_RECOVERED);

      const response = await callRecover('42');

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });
});
