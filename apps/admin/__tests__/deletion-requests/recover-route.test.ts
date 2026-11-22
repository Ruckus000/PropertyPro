import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requirePlatformAdmin = vi.fn();
// select('*').eq(id).eq(status soft_deleted).maybeSingle()
const requestFind = vi.fn();
// Every account_deletion_requests UPDATE: (payload, filters) → { data, error }.
const requestsUpdate = vi.fn();
const usersUpdate = vi.fn();
const communitiesUpdate = vi.fn();
const updateUserById = vi.fn();
const usersSelect = vi.fn();
const sendEmail = vi.fn();
// The order the writes happened in, for the retryable-order assertions.
const writes: string[] = [];

function makeFromMock(table: string) {
  switch (table) {
    case 'account_deletion_requests':
      return {
        select: () => {
          const chain = {
            eq: () => chain,
            maybeSingle: () => requestFind(),
          };
          return chain;
        },
        update: (payload: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq: (col: string, val: unknown) => {
              filters[col] = val;
              return chain;
            },
            select: () => {
              writes.push(`requests:${String(payload.status)}`);
              return requestsUpdate(payload, { ...filters });
            },
          };
          return chain;
        },
      };
    case 'users':
      return {
        update: (payload: unknown) => ({
          eq: (_col: string, val: unknown) => {
            writes.push('users:restore');
            return usersUpdate(payload, val);
          },
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
          eq: (_col: string, val: unknown) => {
            writes.push('communities:restore');
            return communitiesUpdate(payload, val);
          },
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

interface AuditCall {
  action: string;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  bestEffort?: boolean;
}

function auditCalls(): AuditCall[] {
  return logAdminAction.mock.calls.map((c) => c[0] as AuditCall);
}

async function callRecover(id: string) {
  const mod = await import('@/app/api/admin/deletion-requests/[id]/recover/route');
  return mod.POST(new Request(`http://localhost/${id}`, { method: 'POST' }) as never, {
    params: Promise.resolve({ id }),
  });
}

const userRequest = {
  data: { id: 42, status: 'soft_deleted', request_type: 'user', user_id: 'user-uuid', community_id: null },
  error: null,
};
const communityRequest = {
  data: { id: 42, status: 'soft_deleted', request_type: 'community', user_id: null, community_id: 99 },
  error: null,
};

/** The update that flips the user's soft_deleted requests (the last step). */
function recoveredUpdate() {
  return requestsUpdate.mock.calls.find(
    (c) => (c[0] as Record<string, unknown>).status === 'recovered',
  );
}

describe('POST /api/admin/deletion-requests/[id]/recover', () => {
  beforeEach(() => {
    writes.length = 0;
    requirePlatformAdmin.mockReset();
    requestFind.mockReset();
    requestsUpdate.mockReset();
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
    requestsUpdate.mockImplementation(async (payload: Record<string, unknown>) =>
      payload.status === 'recovered' ? { data: [{ id: 42 }], error: null } : { data: [], error: null },
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears users.deleted_at when recovering a user-type request', async () => {
    requestFind.mockResolvedValue(userRequest);

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
    requestFind.mockResolvedValue(communityRequest);

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(communitiesUpdate).toHaveBeenCalledWith({ deleted_at: null }, 99);
    expect(usersUpdate).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    // Only this request, by id.
    expect(recoveredUpdate()?.[1]).toEqual({ id: 42, status: 'soft_deleted' });
  });

  it('returns 404 when the request is not in soft_deleted status', async () => {
    requestFind.mockResolvedValue({ data: null, error: null });

    const response = await callRecover('42');

    expect(response.status).toBe(404);
    expect(usersUpdate).not.toHaveBeenCalled();
    expect(communitiesUpdate).not.toHaveBeenCalled();
    expect(requestsUpdate).not.toHaveBeenCalled();
  });

  // Duplicate requests expire together, so one cron run soft-deletes all of
  // them. Recovering only the one given left the others soft_deleted.
  it('recovers every soft_deleted request of the user, and audits all their ids', async () => {
    requestFind.mockResolvedValue(userRequest);
    requestsUpdate.mockImplementation(async (payload: Record<string, unknown>) =>
      payload.status === 'recovered'
        ? { data: [{ id: 42 }, { id: 43 }], error: null }
        : { data: [], error: null },
    );

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    expect(recoveredUpdate()?.[1]).toEqual({ user_id: 'user-uuid', request_type: 'user', status: 'soft_deleted' });
    const [audit] = auditCalls();
    expect(audit!.action).toBe('deletion_request_recovered');
    expect(audit!.newValues!.recovered_request_ids).toEqual([42, 43]);
  });

  // A request still cooling would delete the restored account again.
  it("cancels the user's cooling requests and audits their ids", async () => {
    requestFind.mockResolvedValue(userRequest);
    requestsUpdate.mockImplementation(async (payload: Record<string, unknown>) =>
      payload.status === 'recovered'
        ? { data: [{ id: 42 }], error: null }
        : { data: [{ id: 50 }], error: null },
    );

    const response = await callRecover('42');

    expect(response.status).toBe(200);
    const cancel = requestsUpdate.mock.calls.find((c) => (c[0] as Record<string, unknown>).status === 'cancelled');
    expect(cancel?.[0]).toMatchObject({ status: 'cancelled', cancelled_by: 'admin-1' });
    expect(cancel?.[1]).toEqual({ user_id: 'user-uuid', request_type: 'user', status: 'cooling' });
    expect(auditCalls()[0]!.newValues!.cancelled_request_ids).toEqual([50]);
  });

  // Not one transaction, so the order is what keeps a partial failure
  // retryable: the request stays soft_deleted until the very last write.
  it('restores and unbans the user BEFORE flipping any request', async () => {
    requestFind.mockResolvedValue(userRequest);

    await callRecover('42');

    expect(writes).toEqual(['users:restore', 'auth:unban', 'requests:cancelled', 'requests:recovered']);
  });

  it('returns 500 with USER_RESTORE_FAILED, flips nothing, and audits the failure', async () => {
    requestFind.mockResolvedValue(userRequest);
    usersUpdate.mockResolvedValue({ error: { message: 'rls denied' } });

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('USER_RESTORE_FAILED');
    expect(body.error.message).toMatch(/retry the recovery/);
    expect(requestsUpdate).not.toHaveBeenCalled();
    const [audit] = auditCalls();
    expect(audit!.action).toBe('deletion_request_recover_failed');
    expect(audit!.metadata).toMatchObject({ stage: 'restore_user', completed: [] });
    expect(audit!.bestEffort).toBe(true);
  });

  it('returns 500 with USER_UNBAN_FAILED and leaves the request retryable', async () => {
    requestFind.mockResolvedValue(userRequest);
    updateUserById.mockResolvedValue({ data: null, error: { message: 'GoTrue down' } });

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('USER_UNBAN_FAILED');
    expect(requestsUpdate).not.toHaveBeenCalled();
    expect(auditCalls()[0]!.metadata).toMatchObject({ stage: 'unban_user', completed: ['restore_user'] });
  });

  it('returns 500 with REQUESTS_UPDATE_FAILED when the final flip fails, and audits it', async () => {
    requestFind.mockResolvedValue(userRequest);
    requestsUpdate.mockImplementation(async (payload: Record<string, unknown>) =>
      payload.status === 'recovered'
        ? { data: null, error: { message: 'boom' } }
        : { data: [], error: null },
    );

    const response = await callRecover('42');

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('REQUESTS_UPDATE_FAILED');
    // True whether or not the user had other requests.
    expect(body.error.message).not.toMatch(/other/);
    expect(auditCalls()[0]!.action).toBe('deletion_request_recover_failed');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  describe('account restored email', () => {
    it('emails the restored user, without claiming they cancelled anything', async () => {
      requestFind.mockResolvedValue(userRequest);

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
      requestFind.mockResolvedValue(userRequest);
      sendEmail.mockRejectedValueOnce(new Error('Resend API error: 500'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await callRecover('42');
      consoleErrorSpy.mockRestore();

      expect(response.status).toBe(200);
      expect(logAdminAction).toHaveBeenCalledTimes(1);
    });

    it('still returns 200 when the address lookup fails, and sends nothing', async () => {
      requestFind.mockResolvedValue(userRequest);
      usersSelect.mockResolvedValue({ data: null, error: { message: 'boom' } });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await callRecover('42');
      consoleErrorSpy.mockRestore();

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('never emails a purged @redacted address', async () => {
      requestFind.mockResolvedValue(userRequest);
      usersSelect.mockResolvedValue({ data: { email: 'deleted-user-uuid@redacted', full_name: 'Deleted User' }, error: null });

      const response = await callRecover('42');

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends nothing for a community recovery', async () => {
      requestFind.mockResolvedValue({
        data: { ...communityRequest.data, user_id: 'requester-uuid' },
        error: null,
      });

      const response = await callRecover('42');

      expect(response.status).toBe(200);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends nothing when the user could not be restored', async () => {
      requestFind.mockResolvedValue(userRequest);
      updateUserById.mockResolvedValue({ data: null, error: { message: 'GoTrue down' } });

      const response = await callRecover('42');

      expect(response.status).toBe(500);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });
});
