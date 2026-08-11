/**
 * Auth-user creation during invitation acceptance.
 *
 * The invariant — `public.users.id === auth.users.id` — and its machinery
 * (adopt the id, verify what Supabase returned, roll back on mismatch, surface
 * failures) now live in `lib/services/auth-user-binding.ts` and are tested in
 * `__tests__/services/auth-user-binding.test.ts`. Testing them again here would
 * pin the same rule in two places, which is how one copy gets fixed and the
 * other drifts.
 *
 * What is genuinely invitation-specific, and therefore tested here: this flow's
 * `users` row is ALWAYS pre-provisioned (an admin created it, with its unit and
 * owner/tenant binding, days before the invitee accepts), so it must always pass
 * that id — never let Supabase mint one. Measured against production on
 * 2026-08-10 before the fix: sign-in succeeded, session id != provisioned id,
 * roles for the session id = 0.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createAuthUserBoundToMock } = vi.hoisted(() => ({
  createAuthUserBoundToMock: vi.fn(),
}));

vi.mock('@/lib/services/auth-user-binding', () => ({
  createAuthUserBoundTo: createAuthUserBoundToMock,
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
  createAuthUserBoundToMock.mockResolvedValue({ ok: true, userId: PROVISIONED_ID });
});

describe('createSupabaseAuthUserFromInvitation', () => {
  it('binds the account to the PRE-PROVISIONED id, never a minted one', async () => {
    const result = await createSupabaseAuthUserFromInvitation({
      email: 'resident@example.com',
      password: 'sup3r-secret-pw',
      fullName: 'Jane Doe',
      externalUserId: PROVISIONED_ID,
    });

    expect(result).toEqual({ ok: true });

    // `userId` present is the whole point: omitting it would let Supabase mint a
    // fresh uuid, and the invitee would sign in owning no roles.
    expect(createAuthUserBoundToMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'resident@example.com',
        password: 'sup3r-secret-pw',
        fullName: 'Jane Doe',
        userId: PROVISIONED_ID,
      }),
    );
  });

  it('preserves the external_user_id metadata the flow has always written', async () => {
    await createSupabaseAuthUserFromInvitation({
      email: 'resident@example.com',
      password: 'sup3r-secret-pw',
      fullName: 'Jane Doe',
      externalUserId: PROVISIONED_ID,
    });

    const args = createAuthUserBoundToMock.mock.calls[0]![0] as {
      metadata?: Record<string, unknown>;
    };
    expect(args.metadata).toEqual({ external_user_id: PROVISIONED_ID });
  });

  it('surfaces a binding failure without throwing', async () => {
    // The accept route turns this into a 400 and deliberately leaves the
    // invitation UNCONSUMED so the link still works.
    createAuthUserBoundToMock.mockResolvedValue({ ok: false, error: 'email already registered' });

    const result = await createSupabaseAuthUserFromInvitation({
      email: 'resident@example.com',
      password: 'sup3r-secret-pw',
      fullName: 'Jane Doe',
      externalUserId: PROVISIONED_ID,
    });

    expect(result).toEqual({ ok: false, error: 'email already registered' });
  });
});
