/**
 * POST /api/admin/support/sessions — the token handoff.
 *
 * These assert the two halves of the P1-2 fix that are easy to regress
 * independently: the raw JWT must NOT be in the response body, and the cookie
 * that replaces it must be HttpOnly and scoped to the shared root domain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requirePlatformAdmin = vi.fn();
const sessionInsert = vi.fn();
const accessLogInsert = vi.fn();
const signSupportToken = vi.fn();

function makeFromMock(table: string) {
  switch (table) {
    case 'support_consent_grants':
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              limit: async () => ({ data: [{ id: 5, access_level: 'read_only' }], error: null }),
            }),
          }),
        }),
      };
    case 'platform_admin_users':
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      };
    case 'support_sessions':
      return {
        select: () => ({
          eq: () => ({ gte: async () => ({ count: 0, error: null }) }),
        }),
        insert: (payload: unknown) => ({
          select: () => ({ single: () => sessionInsert(payload) }),
        }),
      };
    case 'users':
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { full_name: 'Olivia Owner', email: 'olivia@example.com' },
              error: null,
            }),
          }),
        }),
      };
    case 'support_access_log':
      return { insert: (payload: unknown) => accessLogInsert(payload) };
    default:
      throw new Error(`Unexpected table: ${table}`);
  }
}

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({ from: (table: string) => makeFromMock(table) }),
}));

vi.mock('@/lib/support/jwt', () => ({
  signSupportToken: (...args: unknown[]) => signSupportToken(...args),
}));

const TOKEN = 'header.payload.signature';

async function callCreate(host = 'admin.getpropertypro.com') {
  const mod = await import('@/app/api/admin/support/sessions/route');
  const req = new Request(`https://${host}/api/admin/support/sessions`, {
    method: 'POST',
    headers: { host },
    body: JSON.stringify({
      targetUserId: '11111111-2222-4333-8444-555555555555',
      communityId: 42,
      reason: 'Investigating a billing discrepancy for ticket 1234',
    }),
  });
  return mod.POST(req as never);
}

describe('POST /api/admin/support/sessions — token handoff', () => {
  beforeEach(() => {
    requirePlatformAdmin.mockReset();
    sessionInsert.mockReset();
    accessLogInsert.mockReset();
    signSupportToken.mockReset();

    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1' });
    sessionInsert.mockResolvedValue({ data: { id: 77 }, error: null });
    accessLogInsert.mockResolvedValue({ error: null });
    signSupportToken.mockResolvedValue(TOKEN);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // The body used to carry the raw JWT so the dialog could write it with
  // document.cookie. Anything that can read the response — an XSS on the admin
  // console, a logging proxy, a browser extension — could lift a live
  // impersonation token from it.
  it('does not return the raw token in the response body', async () => {
    const res = await callCreate();
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({ sessionId: 77, expiresAt: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it('sets the token as an HttpOnly, root-domain-scoped cookie', async () => {
    const res = await callCreate();
    const setCookie = res.headers.get('set-cookie') ?? '';

    expect(setCookie).toContain(`pp-support-session=${TOKEN}`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/Domain=\.getpropertypro\.com/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
  });

  // 1800, not 3600 — the cookie must not outlive the JWT `exp` or the
  // support_sessions row, or a stale banner survives a dead session.
  it('gives the cookie the same lifetime as the session', async () => {
    const res = await callCreate();
    expect(res.headers.get('set-cookie') ?? '').toMatch(/Max-Age=1800/i);
  });

  // Local dev serves admin on http://localhost:3001; a Secure cookie there is
  // dropped by the browser and the handoff silently fails.
  it('omits Domain and Secure on localhost', async () => {
    const res = await callCreate('localhost:3001');
    const setCookie = res.headers.get('set-cookie') ?? '';

    expect(setCookie).toContain('pp-support-session=');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).not.toMatch(/Secure/i);
    expect(setCookie).not.toMatch(/Domain=/i);
  });
});
