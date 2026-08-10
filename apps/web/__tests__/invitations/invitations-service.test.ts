/**
 * Auth-user creation during invitation acceptance.
 *
 * The invariant these tests defend: `public.users.id === auth.users.id`.
 *
 * Every other account-creation path in the app establishes it by creating the
 * Supabase auth user FIRST and using `data.user.id` as the `users` row id — see
 * provisioning-service.ts (signup) and access-request-service.ts (access
 * requests). The invitation flow is the one path that runs in the other
 * direction: an admin pre-provisions the `users` row (and its `user_roles` row,
 * carrying the unit and owner/tenant binding) with an id of its own, and the
 * auth user is not created until the invitee accepts, days later.
 *
 * So this call site MUST hand Supabase the id that already exists. Left to
 * itself, GoTrue mints a fresh UUID; `user_roles.user_id` still points at the
 * provisioned id, and middleware stamps the SESSION id into `x-user-id`. The
 * invitee ends up able to sign in with the password they just set while owning
 * zero roles — no community, no unit, locked out of the whole app.
 *
 * Measured against production on 2026-08-10 before the fix: sign-in succeeded,
 * session id `bcfce716…` != provisioned id `cb16c090…`, roles for the session
 * id = 0, roles for the provisioned id = 1.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createUserMock, createAdminClientMock } = vi.hoisted(() => {
  const createUserMock = vi.fn();
  return {
    createUserMock,
    createAdminClientMock: vi.fn(() => ({ auth: { admin: { createUser: createUserMock } } })),
  };
});

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@propertypro/db', () => ({
  communities: {},
  createScopedClient: vi.fn(),
  invitations: {},
  userRoles: {},
  users: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

import { createSupabaseAuthUserFromInvitation } from '@/lib/services/invitations-service';

const PROVISIONED_ID = 'cb16c090-fc25-4f26-8df9-3f24a9bf82bb';

beforeEach(() => {
  vi.clearAllMocks();
  createUserMock.mockResolvedValue({ data: { user: { id: PROVISIONED_ID } }, error: null });
});

describe('createSupabaseAuthUserFromInvitation', () => {
  it('creates the auth user WITH the pre-provisioned id, not a fresh one', async () => {
    const result = await createSupabaseAuthUserFromInvitation({
      email: 'resident@example.com',
      password: 'sup3r-secret-pw',
      fullName: 'Jane Doe',
      externalUserId: PROVISIONED_ID,
    });

    expect(result).toEqual({ ok: true });
    expect(createUserMock).toHaveBeenCalledTimes(1);

    const attrs = createUserMock.mock.calls[0]![0] as Record<string, unknown>;
    // The assertion that matters: without this, GoTrue generates its own UUID
    // and the invitee's session never matches their user_roles row.
    expect(attrs['id']).toBe(PROVISIONED_ID);
    expect(attrs['email']).toBe('resident@example.com');
    expect(attrs['password']).toBe('sup3r-secret-pw');
    expect(attrs['email_confirm']).toBe(true);
  });

  it('fails closed when Supabase returns an id other than the provisioned one', async () => {
    // Defence in depth: if a future GoTrue ignores the requested id, we must not
    // report success — a silent divergence here is exactly the lockout above,
    // and it is invisible until the invitee tries to use the app.
    createUserMock.mockResolvedValue({
      data: { user: { id: '11111111-2222-3333-4444-555555555555' } },
      error: null,
    });

    const result = await createSupabaseAuthUserFromInvitation({
      email: 'resident@example.com',
      password: 'sup3r-secret-pw',
      fullName: 'Jane Doe',
      externalUserId: PROVISIONED_ID,
    });

    expect(result.ok).toBe(false);
  });

  it('still surfaces a Supabase error as a failure', async () => {
    createUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'email already registered' },
    });

    const result = await createSupabaseAuthUserFromInvitation({
      email: 'resident@example.com',
      password: 'sup3r-secret-pw',
      fullName: 'Jane Doe',
      externalUserId: PROVISIONED_ID,
    });

    expect(result).toEqual({ ok: false, error: 'email already registered' });
  });

  it('surfaces a thrown error as a failure rather than propagating', async () => {
    createUserMock.mockRejectedValue(new Error('network down'));

    const result = await createSupabaseAuthUserFromInvitation({
      email: 'resident@example.com',
      password: 'sup3r-secret-pw',
      fullName: 'Jane Doe',
      externalUserId: PROVISIONED_ID,
    });

    expect(result).toEqual({ ok: false, error: 'network down' });
  });
});
