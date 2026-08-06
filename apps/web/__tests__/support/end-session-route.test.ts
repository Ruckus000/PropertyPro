/**
 * POST /api/v1/support/end-session
 *
 * The banner can no longer clear the support cookie itself (it is HttpOnly),
 * so this route is the only way an impersonated session ends from the tenant
 * side. It must close the DB row as well as expire the cookie — clearing only
 * the cookie is what the old client-side handler did, and it left the session
 * counting as active in the audit trail and against the admin's daily limit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const parseImpersonationCookie = vi.fn();
const sessionUpdate = vi.fn();
const accessLogInsert = vi.fn();

vi.mock('@/lib/support/impersonation', () => ({
  parseImpersonationCookie: (...args: unknown[]) => parseImpersonationCookie(...args),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'support_sessions') {
        return {
          update: (payload: unknown) => ({
            eq: (_c: string, id: unknown) => ({
              is: (_col: string, val: unknown) => ({
                select: () => sessionUpdate(payload, id, val),
              }),
            }),
          }),
        };
      }
      if (table === 'support_access_log') {
        return { insert: (payload: unknown) => accessLogInsert(payload) };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

const PAYLOAD = {
  sub: 'target-user',
  act: { sub: 'admin-1' },
  community_id: 42,
  session_id: 77,
  scope: 'read_only' as const,
  exp: 0,
  iat: 0,
};

async function callEnd(cookie?: string, host = 'sunset.getpropertypro.com') {
  const mod = await import('@/app/api/v1/support/end-session/route');
  const headers: Record<string, string> = { host };
  if (cookie) headers.cookie = `pp-support-session=${cookie}`;
  const req = new Request(`https://${host}/api/v1/support/end-session`, {
    method: 'POST',
    headers,
  });
  return mod.POST(req as never);
}

describe('POST /api/v1/support/end-session', () => {
  beforeEach(() => {
    parseImpersonationCookie.mockReset();
    sessionUpdate.mockReset();
    accessLogInsert.mockReset();
    sessionUpdate.mockResolvedValue({ data: [{ id: 77 }], error: null });
    accessLogInsert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('closes the support_sessions row, not just the cookie', async () => {
    parseImpersonationCookie.mockResolvedValue(PAYLOAD);

    const res = await callEnd('signed.support.token');

    expect(res.status).toBe(200);
    expect(sessionUpdate).toHaveBeenCalledTimes(1);
    const [payload, id, endedAtFilter] = sessionUpdate.mock.calls[0]!;
    expect(payload).toMatchObject({ ended_reason: 'manual', ended_at: expect.any(String) });
    expect(id).toBe(77);
    // The `.is('ended_at', null)` guard is what keeps a double-click from
    // overwriting the original end time and reason.
    expect(endedAtFilter).toBeNull();
    expect(accessLogInsert).toHaveBeenCalledTimes(1);
    expect(accessLogInsert.mock.calls[0]![0]).toMatchObject({
      event: 'session_ended',
      session_id: 77,
    });
  });

  it('expires the cookie with the same domain and path it was set with', async () => {
    parseImpersonationCookie.mockResolvedValue(PAYLOAD);

    const res = await callEnd('signed.support.token');
    const setCookie = res.headers.get('set-cookie') ?? '';

    // A mismatched domain writes a SECOND cookie instead of removing the
    // domain-scoped one, leaving the session alive on every tenant subdomain.
    expect(setCookie).toMatch(/Domain=\.getpropertypro\.com/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  // A stale tab holding an expired cookie must still be able to escape.
  it('clears the cookie and succeeds when the cookie is unverifiable', async () => {
    parseImpersonationCookie.mockResolvedValue(null);

    const res = await callEnd('garbage');

    expect(res.status).toBe(200);
    expect(sessionUpdate).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie') ?? '').toMatch(/Max-Age=0/i);
  });

  it('does not write an audit row when no session row was actually closed', async () => {
    parseImpersonationCookie.mockResolvedValue(PAYLOAD);
    sessionUpdate.mockResolvedValue({ data: [], error: null });

    await callEnd('signed.support.token');

    expect(accessLogInsert).not.toHaveBeenCalled();
  });

  // Bookkeeping must never trap the operator inside an impersonated session.
  it('still clears the cookie when the database write throws', async () => {
    parseImpersonationCookie.mockResolvedValue(PAYLOAD);
    sessionUpdate.mockRejectedValue(new Error('connection reset'));

    const res = await callEnd('signed.support.token');

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').toMatch(/Max-Age=0/i);
  });
});
