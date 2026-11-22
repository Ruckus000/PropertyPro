import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requirePlatformAdmin = vi.fn();
const requestUpdate = vi.fn();
// The second account_deletion_requests update: every other soft_deleted
// request of the same user. Receives the payload and the .eq() filters.
const duplicatesUpdate = vi.fn();
const usersUpdate = vi.fn();
const communitiesUpdate = vi.fn();
const updateUserById = vi.fn();
const usersSelect = vi.fn();
const sendEmail = vi.fn();

function makeFromMock(table: string) {
  switch (table) {
    case 'account_deletion_requests':
      return {
        // `.single()` ends the by-id update; awaiting `.select()` directly is
        // the update of the user's other soft_deleted requests.
        update: (payload: unknown) => {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            select: () => ({
              single: () => requestUpdate(payload),
              then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
                Promise.resolve(duplicatesUpdate(payload, { ...filters })).then(resolve, reject),
            }),
          };
          return chain;
        },
      };
    case 'users':
      return {
        update: (payload: unknown) => ({
          eq: (_col: string, val: unknown) => usersUpdate(payload, val),
        }),
        select: (cols: string) => ({
          eq: (_col: string, val: unknown) => ({
            maybeSingle: () => usersSelect(cols, val),
          }),
        }),
      };
    case 'communities':
      return {
        update: (payload: unknown) => ({
          eq: (_col: string, val: unknown) => communitiesUpdate(payload, val),
        }),
      };
    default:
      throw new Error(`Unexpected table: ${table}`);
  }
}

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({
    from: (table: string) => makeFromMock(table),
    auth: { admin: { updateUserById: (...args: unknown[]) => updateUserById(...args) } },
  }),
}));


// Audit writes go through logAdminAction, which uses its OWN supabase client
// (createAdminClient) rather than the one these tests stub. Mock the helper so
// the route tests stay focused, and so the call itself can be asserted — the
// helper's own semantics are covered by __tests__/audit/log-admin-action.test.ts.
// Typed with a rest parameter so the `(...args) => logAdminAction(...args)`
// forwarder below type-checks and `.mock.calls[0]![0]` is indexable.
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

async function callRecover(id: string) {
  const mod = await import('@/app/api/admin/deletion-requests/[id]/recover/route');
  return mod.POST(new Request(`http://localhost/${id}`, { method: 'POST' }) as never, {
    params: Promise.resolve({ id }),
  });
}

describe('POST /api/admin/deletion-requests/[id]/recover', () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset();
    requestUpdate.mockReset();
    duplicatesUpdate.mockReset();
    usersUpdate.mockReset();
    communitiesUpdate.mockReset();
    updateUserById.mockReset();
    usersSelect.mockReset();
    sendEmail.mockReset();
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1' });
    usersSelect.mockResolvedValue({ data: { email: 'marisol@example.com', full_name: 'Marisol' }, error: null });
    sendEmail.mockResolvedValue({ id: 'test_1' });
    updateUserById.mockResolvedValue({ data: {}, error: null });
    usersUpdate.mockResolvedValue({ error: null });
    communitiesUpdate.mockResolvedValue({ error: null });
    duplicatesUpdate.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears users.deleted_at when recovering a user-type request', async () => {
    requestUpdate.mockResolvedValue({
      data: { request_type: 'user', user_id: 'user-uuid', community_id: null },
      error: null,
    });

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(usersUpdate).toHaveBeenCalledWith({ deleted_at: null }, 'user-uuid');
    // The lifecycle cron banned the login at soft delete; recovery must lift it.
    expect(updateUserById).toHaveBeenCalledWith('user-uuid', {
      ban_duration: 'none',
      user_metadata: { soft_deleted: null },
    });
    expect(communitiesUpdate).not.toHaveBeenCalled();
  });

  it('clears communities.deleted_at when recovering a community-type request', async () => {
    requestUpdate.mockResolvedValue({
      data: { request_type: 'community', user_id: null, community_id: 99 },
      error: null,
    });

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(communitiesUpdate).toHaveBeenCalledWith({ deleted_at: null }, 99);
    expect(usersUpdate).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  // Duplicate requests expire together, so one cron run soft-deletes all of
  // them. Recovering only the one given left the others soft_deleted on an
  // open account, and the purge would later scrub its PII.
  it("recovers every other soft_deleted request of the user, and audits all their ids", async () => {
    requestUpdate.mockResolvedValue({
      data: { request_type: 'user', user_id: 'user-uuid', community_id: null },
      error: null,
    });
    duplicatesUpdate.mockResolvedValue({ data: [{ id: 43 }], error: null });

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(duplicatesUpdate).toHaveBeenCalledTimes(1);
    expect(duplicatesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'recovered' }),
      { user_id: 'user-uuid', request_type: 'user', status: 'soft_deleted' },
    );
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    const audit = logAdminAction.mock.calls[0]![0] as { newValues: Record<string, unknown> };
    expect(audit.newValues.recovered_request_ids).toEqual([42, 43]);
  });

  it('does not restore the user when recovering the other requests fails', async () => {
    requestUpdate.mockResolvedValue({
      data: { request_type: 'user', user_id: 'user-uuid', community_id: null },
      error: null,
    });
    duplicatesUpdate.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('DUPLICATE_RECOVER_FAILED');
    expect(usersUpdate).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('touches no other request for a community recovery', async () => {
    requestUpdate.mockResolvedValue({
      data: { request_type: 'community', user_id: null, community_id: 99 },
      error: null,
    });

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(duplicatesUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the request is not in soft_deleted status', async () => {
    requestUpdate.mockResolvedValue({ data: null, error: null });

    const response = await callRecover('42');

    expect(response.status).toBe(404);
    expect(usersUpdate).not.toHaveBeenCalled();
    expect(communitiesUpdate).not.toHaveBeenCalled();
  });

  it('returns 500 with USER_RESTORE_FAILED when users.deleted_at clear fails', async () => {
    requestUpdate.mockResolvedValue({
      data: { request_type: 'user', user_id: 'user-uuid', community_id: null },
      error: null,
    });
    usersUpdate.mockResolvedValue({ error: { message: 'rls denied' } });

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('USER_RESTORE_FAILED');
  });

  it('returns 500 with USER_UNBAN_FAILED when lifting the auth ban fails', async () => {
    requestUpdate.mockResolvedValue({
      data: { request_type: 'user', user_id: 'user-uuid', community_id: null },
      error: null,
    });
    updateUserById.mockResolvedValue({ data: null, error: { message: 'GoTrue down' } });

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('USER_UNBAN_FAILED');
  });

  describe('account restored email', () => {
    const userRequest = {
      data: { request_type: 'user', user_id: 'user-uuid', community_id: null },
      error: null,
    };

    it('emails the restored user, without claiming they cancelled anything', async () => {
      requestUpdate.mockResolvedValue(userRequest);

      const response = await callRecover('42');

      expect(response.status).toBe(200);
      expect(usersSelect).toHaveBeenCalledWith('email, full_name', 'user-uuid');
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
      requestUpdate.mockResolvedValue(userRequest);
      sendEmail.mockRejectedValueOnce(new Error('Resend API error: 500'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await callRecover('42');
      consoleErrorSpy.mockRestore();

      expect(response.status).toBe(200);
      expect(logAdminAction).toHaveBeenCalledTimes(1);
    });

    it('still returns 200 when the address lookup fails, and sends nothing', async () => {
      requestUpdate.mockResolvedValue(userRequest);
      usersSelect.mockResolvedValue({ data: null, error: { message: 'boom' } });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await callRecover('42');
      consoleErrorSpy.mockRestore();

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('never emails a purged @redacted address', async () => {
      requestUpdate.mockResolvedValue(userRequest);
      usersSelect.mockResolvedValue({ data: { email: 'deleted-user-uuid@redacted', full_name: 'Deleted User' }, error: null });

      const response = await callRecover('42');

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends nothing for a community recovery', async () => {
      requestUpdate.mockResolvedValue({
        data: { request_type: 'community', user_id: 'requester-uuid', community_id: 99 },
        error: null,
      });

      const response = await callRecover('42');

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends nothing when the user could not be restored', async () => {
      requestUpdate.mockResolvedValue(userRequest);
      updateUserById.mockResolvedValue({ data: null, error: { message: 'GoTrue down' } });

      const response = await callRecover('42');

      expect(response.status).toBe(500);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });
});
