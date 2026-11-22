import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every PostgREST call the route makes is recorded as an `Op` and answered by
 * `respond`, so a test can say what each one returns and assert on what was
 * sent and in what order.
 */
interface Op {
  table: string;
  kind: 'update' | 'select';
  payload?: Record<string, unknown>;
  filters: Array<[string, string, unknown]>;
  terminal: 'maybeSingle' | 'many';
}
type Result = { data: unknown; error: unknown };

const ops: Op[] = [];
let respond: (op: Op) => Result;

const requirePlatformAdmin = vi.fn();
const updateUserById = vi.fn();
const sendEmail = vi.fn();
// The order the account-changing calls happened in.
const writes: string[] = [];

function from(table: string) {
  const make = (kind: Op['kind'], payload?: Record<string, unknown>) => {
    const op: Op = { table, kind, payload, filters: [], terminal: 'many' };
    const run = () => {
      ops.push(op);
      if (kind === 'update') writes.push(`${table}:${String(payload?.status ?? 'deleted_at')}`);
      return Promise.resolve(respond(op));
    };
    const chain = {
      eq: (col: string, val: unknown) => (op.filters.push(['eq', col, val]), chain),
      in: (col: string, val: unknown) => (op.filters.push(['in', col, val]), chain),
      not: (col: string, operator: string, val: unknown) => (op.filters.push(['not', col, `${operator} ${String(val)}`]), chain),
      select: () => chain,
      maybeSingle: () => {
        op.terminal = 'maybeSingle';
        return run();
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return chain;
  };
  return {
    update: (payload: Record<string, unknown>) => make('update', payload),
    select: () => make('select'),
  };
}

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => from(table),
    auth: {
      admin: {
        updateUserById: (...args: unknown[]) => {
          writes.push('auth:unban');
          return updateUserById(...args);
        },
      },
    },
  }),
}));

// Audit writes go through logAdminAction, which uses its OWN supabase client
// (createAdminClient) rather than the one these tests stub. Mock the helper so
// the route tests stay focused, and so the call itself can be asserted — the
// helper's own semantics are covered by __tests__/audit/log-admin-action.test.ts.
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
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  bestEffort?: boolean;
}

const audits = () => logAdminAction.mock.calls.map((c) => c[0] as AuditCall);

async function callRecover(id: string) {
  const mod = await import('@/app/api/admin/deletion-requests/[id]/recover/route');
  return mod.POST(new Request(`http://localhost/${id}`, { method: 'POST' }) as never, {
    params: Promise.resolve({ id }),
  });
}

const USER_ROW = { id: 42, status: 'recovered', request_type: 'user', user_id: 'user-uuid', community_id: null };
const COMMUNITY_ROW = { id: 42, status: 'recovered', request_type: 'community', user_id: null, community_id: 99 };

const has = (op: Op, kind: string, col: string) => op.filters.some(([k, c]) => k === kind && c === col);
const isClaim = (op: Op) =>
  op.table === 'account_deletion_requests' && op.kind === 'update' && op.payload?.status === 'recovered' && has(op, 'eq', 'id');
const isDuplicateClaim = (op: Op) =>
  op.table === 'account_deletion_requests' && op.kind === 'update' && op.payload?.status === 'recovered' && has(op, 'eq', 'user_id');
const isCoolingCancel = (op: Op) =>
  op.table === 'account_deletion_requests' && op.kind === 'update' && op.payload?.status === 'cancelled';
const isRelease = (op: Op) =>
  op.table === 'account_deletion_requests' && op.kind === 'update' && op.payload?.status === 'soft_deleted';
const isReRead = (op: Op) => op.table === 'account_deletion_requests' && op.kind === 'select';
const isUserRestore = (op: Op) => op.table === 'users' && op.kind === 'update';
const isEmailLookup = (op: Op) => op.table === 'users' && op.kind === 'select';
const isCommunityRestore = (op: Op) => op.table === 'communities' && op.kind === 'update';

/** The happy path; a test overrides the calls it is about. */
function happy(claimRow: unknown = USER_ROW, overrides: (op: Op) => Result | undefined = () => undefined) {
  respond = (op) => {
    const o = overrides(op);
    if (o) return o;
    if (isClaim(op)) return { data: claimRow, error: null };
    if (isDuplicateClaim(op) || isCoolingCancel(op)) return { data: [], error: null };
    if (isUserRestore(op)) return { data: [{ id: 'user-uuid' }], error: null };
    if (isEmailLookup(op)) return { data: { email: 'marisol@example.com', full_name: 'Marisol' }, error: null };
    return { data: null, error: null };
  };
}

describe('POST /api/admin/deletion-requests/[id]/recover', () => {
  beforeEach(() => {
    ops.length = 0;
    writes.length = 0;
    requirePlatformAdmin.mockReset();
    updateUserById.mockReset();
    sendEmail.mockReset();
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1' });
    sendEmail.mockResolvedValue({ id: 'test_1' });
    updateUserById.mockResolvedValue({ data: {}, error: null });
    happy();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('claims, then clears users.deleted_at and lifts the ban for a user-type request', async () => {
    const response = await callRecover('42');

    expect(response.status).toBe(200);
    const claim = ops.find(isClaim)!;
    expect(claim.filters).toEqual([['eq', 'id', 42], ['eq', 'status', 'soft_deleted']]);
    expect(ops.find(isUserRestore)!.payload).toEqual({ deleted_at: null });
    // The lifecycle cron banned the login at soft delete; recovery must lift it.
    expect(updateUserById).toHaveBeenCalledWith('user-uuid', {
      ban_duration: 'none',
      user_metadata: { soft_deleted: null },
    });
    expect(ops.some(isCommunityRestore)).toBe(false);
  });

  it('clears communities.deleted_at for a community-type request, touching no other request', async () => {
    happy(COMMUNITY_ROW);

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(ops.find(isCommunityRestore)!.filters).toEqual([['eq', 'id', 99]]);
    expect(ops.some(isUserRestore)).toBe(false);
    expect(ops.some(isDuplicateClaim)).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  // The lock: the request's status. Nothing about the account may change
  // before this route has moved the request out of soft_deleted.
  it('claims the request BEFORE restoring anything', async () => {
    await callRecover('42');

    expect(writes).toEqual([
      'account_deletion_requests:recovered',
      'account_deletion_requests:recovered',
      'account_deletion_requests:cancelled',
      'users:deleted_at',
      'auth:unban',
    ]);
  });

  it('returns 404, and changes nothing, when the request is not soft_deleted and not purged', async () => {
    happy(null, (op) => (isReRead(op) ? { data: { status: 'cancelled', community_id: null }, error: null } : undefined));

    const response = await callRecover('42');

    expect(response.status).toBe(404);
    expect(ops.some(isUserRestore)).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  // The purge claimed it first: finished, or failing part way and retried
  // nightly with purged_at still null. Either way it is not recoverable.
  it('returns 409 with a failure audit row when the purge claimed the request first', async () => {
    happy(null, (op) => (isReRead(op) ? { data: { status: 'purged', community_id: null }, error: null } : undefined));

    const response = await callRecover('42');

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('ALREADY_PURGED');
    expect(ops.some(isUserRestore)).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
    const [audit] = audits();
    expect(audit!.action).toBe('deletion_request_recover_failed');
    expect(audit!.metadata).toMatchObject({ stage: 'claim', code: 'ALREADY_PURGED' });
  });

  it("claims the user's other soft_deleted requests and cancels cooling ones, auditing every id", async () => {
    happy(USER_ROW, (op) => {
      if (isDuplicateClaim(op)) return { data: [{ id: 43 }], error: null };
      if (isCoolingCancel(op)) return { data: [{ id: 50 }], error: null };
      return undefined;
    });

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(ops.find(isDuplicateClaim)!.filters).toEqual([
      ['eq', 'user_id', 'user-uuid'],
      ['eq', 'request_type', 'user'],
      ['eq', 'status', 'soft_deleted'],
    ]);
    const cancel = ops.find(isCoolingCancel)!;
    expect(cancel.payload).toMatchObject({ status: 'cancelled', cancelled_by: 'admin-1' });
    expect(cancel.filters).toContainEqual(['eq', 'status', 'cooling']);
    const [audit] = audits();
    expect(audit!.action).toBe('deletion_request_recovered');
    expect(audit!.newValues).toMatchObject({ recovered_request_ids: [42, 43], cancelled_request_ids: [50] });
  });

  // A purge of ANOTHER request of the same user (a duplicate) already
  // scrubbed the row: the restore is conditional on the row being unscrubbed.
  it('refuses to restore a users row that a purge already scrubbed, and gives the claim back', async () => {
    happy(USER_ROW, (op) => {
      if (isDuplicateClaim(op)) return { data: [{ id: 43 }], error: null };
      if (isUserRestore(op)) return { data: [], error: null };
      return undefined;
    });

    const response = await callRecover('42');

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('ALREADY_PURGED');
    expect(ops.find(isUserRestore)!.filters).toContainEqual(['not', 'email', 'like %@redacted']);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(ops.find(isRelease)!.filters).toEqual([['in', 'id', [42, 43]], ['eq', 'status', 'recovered']]);
  });

  it('gives the claim back and audits it when the restore fails, so a retry works', async () => {
    happy(USER_ROW, (op) => (isUserRestore(op) ? { data: null, error: { message: 'rls denied' } } : undefined));

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('USER_RESTORE_FAILED');
    expect(body.error.message).toMatch(/retry the recovery/);
    const release = ops.find(isRelease)!;
    expect(release.payload).toEqual({ status: 'soft_deleted', recovered_at: null });
    expect(release.filters).toEqual([['in', 'id', [42]], ['eq', 'status', 'recovered']]);
    const [audit] = audits();
    expect(audit!.action).toBe('deletion_request_recover_failed');
    expect(audit!.metadata).toMatchObject({
      stage: 'restore_user',
      completed: ['claim', 'claim_duplicates', 'cancel_cooling'],
      claim_released: true,
    });
    expect(audit!.bestEffort).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('gives the claim back and audits it when lifting the ban fails', async () => {
    updateUserById.mockResolvedValue({ data: null, error: { message: 'GoTrue down' } });

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('USER_UNBAN_FAILED');
    expect(ops.some(isRelease)).toBe(true);
    expect(audits()[0]!.metadata).toMatchObject({
      stage: 'unban_user',
      completed: ['claim', 'claim_duplicates', 'cancel_cooling', 'restore_user'],
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('says so loudly when giving the claim back fails too', async () => {
    happy(USER_ROW, (op) => {
      if (isUserRestore(op)) return { data: null, error: { message: 'rls denied' } };
      if (isRelease(op)) return { data: null, error: { message: 'still down' } };
      return undefined;
    });

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('RECOVERY_UNDO_FAILED');
    expect(body.error.message).toMatch(/read "recovered" but the account is still deleted/);
    expect(audits()[0]!.metadata).toMatchObject({ claim_released: false });
  });

  it('gives the claim back when a community restore fails', async () => {
    happy(COMMUNITY_ROW, (op) => (isCommunityRestore(op) ? { data: null, error: { message: 'boom' } } : undefined));

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('COMMUNITY_RESTORE_FAILED');
    expect(ops.find(isRelease)!.filters).toEqual([['in', 'id', [42]], ['eq', 'status', 'recovered']]);
  });

  describe('account restored email', () => {
    it('emails the restored user, without claiming they cancelled anything', async () => {
      const response = await callRecover('42');

      expect(response.status).toBe(200);
      expect(ops.find(isEmailLookup)!.filters).toEqual([['eq', 'id', 'user-uuid']]);
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
      expect(logAdminAction).toHaveBeenCalledTimes(1);
    });

    it('still returns 200 when the address lookup fails, and sends nothing', async () => {
      happy(USER_ROW, (op) => (isEmailLookup(op) ? { data: null, error: { message: 'boom' } } : undefined));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await callRecover('42');
      consoleErrorSpy.mockRestore();

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('never emails a purged @redacted address', async () => {
      happy(USER_ROW, (op) =>
        isEmailLookup(op)
          ? { data: { email: 'deleted-user-uuid@redacted', full_name: 'Deleted User' }, error: null }
          : undefined,
      );

      const response = await callRecover('42');

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends nothing for a community recovery', async () => {
      happy({ ...COMMUNITY_ROW, user_id: 'requester-uuid' });

      const response = await callRecover('42');

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });
});
