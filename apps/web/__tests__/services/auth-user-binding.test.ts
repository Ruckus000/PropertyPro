/**
 * Binding a Supabase auth identity to a `public.users` row.
 *
 * The invariant under test: `public.users.id === auth.users.id`. Middleware
 * stamps the SESSION user id into `x-user-id`, so a row whose id differs is
 * unreachable by its own owner — the person signs in and owns nothing.
 *
 * This module exists because two flows need it (invitation acceptance, #939;
 * access-request approval, #944) and implementing it twice is how one gets fixed
 * and the other drifts. The mechanism is therefore tested here, once, rather
 * than through each caller.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createUserMock, deleteUserMock } = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  deleteUserMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser: createUserMock, deleteUser: deleteUserMock } },
  }),
}));

import { createAuthUserBoundTo, rollBackAuthUser } from '@/lib/services/auth-user-binding';

const EXISTING_ID = 'cb16c090-fc25-4f26-8df9-3f24a9bf82bb';
const MINTED_ID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  vi.clearAllMocks();
  deleteUserMock.mockResolvedValue({ error: null });
});

describe('createAuthUserBoundTo — with an existing users.id', () => {
  it('makes Supabase ADOPT the id rather than mint one', async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: EXISTING_ID } }, error: null });

    const result = await createAuthUserBoundTo({
      email: 'resident@example.com',
      fullName: 'Jane Doe',
      password: 'sup3r-secret-pw',
      userId: EXISTING_ID,
    });

    expect(result).toEqual({ ok: true, userId: EXISTING_ID });

    const attrs = createUserMock.mock.calls[0]![0] as Record<string, unknown>;
    // Without this the invitee's session id matches no user_roles row.
    expect(attrs['id']).toBe(EXISTING_ID);
    expect(attrs['email']).toBe('resident@example.com');
    expect(attrs['password']).toBe('sup3r-secret-pw');
    expect(attrs['email_confirm']).toBe(true);
  });

  it('fails closed and rolls back when Supabase returns a DIFFERENT id', async () => {
    // Defence in depth: a future GoTrue that ignored the requested id would
    // otherwise reintroduce the bug silently.
    createUserMock.mockResolvedValue({ data: { user: { id: MINTED_ID } }, error: null });

    const result = await createAuthUserBoundTo({
      email: 'resident@example.com',
      fullName: 'Jane Doe',
      userId: EXISTING_ID,
    });

    expect(result.ok).toBe(false);
    expect(deleteUserMock).toHaveBeenCalledWith(MINTED_ID);
  });

  it('reports a failed rollback rather than hiding it', async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: MINTED_ID } }, error: null });
    deleteUserMock.mockResolvedValue({ error: { message: 'service unavailable' } });

    const result = await createAuthUserBoundTo({
      email: 'resident@example.com',
      fullName: 'Jane Doe',
      userId: EXISTING_ID,
    });

    expect(result.ok === false && result.error).toMatch(/rollback FAILED: service unavailable/);
  });
});

describe('createAuthUserBoundTo — without an existing users.id', () => {
  it('lets Supabase mint an id and returns it', async () => {
    // The ordinary new-resident case: no `users` row exists yet, so the caller
    // uses the returned id as that row's primary key.
    createUserMock.mockResolvedValue({ data: { user: { id: MINTED_ID } }, error: null });

    const result = await createAuthUserBoundTo({
      email: 'newcomer@example.com',
      fullName: 'New Comer',
    });

    expect(result).toEqual({ ok: true, userId: MINTED_ID });

    const attrs = createUserMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(attrs).not.toHaveProperty('id');
    // No password supplied — the key must be absent, not undefined, so Supabase
    // treats the account as having no password rather than an empty one.
    expect(attrs).not.toHaveProperty('password');
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('does NOT roll back a minted id, since nothing was violated', async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: MINTED_ID } }, error: null });

    await createAuthUserBoundTo({ email: 'newcomer@example.com', fullName: null });

    expect(deleteUserMock).not.toHaveBeenCalled();
  });
});

describe('createAuthUserBoundTo — failure surfaces', () => {
  it('surfaces a Supabase error', async () => {
    createUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'email already registered' },
    });

    const result = await createAuthUserBoundTo({ email: 'dup@example.com', fullName: null });

    expect(result).toEqual({ ok: false, error: 'email already registered' });
  });

  it('fails when Supabase returns no id at all', async () => {
    createUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const result = await createAuthUserBoundTo({ email: 'x@example.com', fullName: null });

    expect(result.ok).toBe(false);
  });

  it('surfaces a thrown error rather than propagating it', async () => {
    createUserMock.mockRejectedValue(new Error('network down'));

    const result = await createAuthUserBoundTo({ email: 'x@example.com', fullName: null });

    expect(result).toEqual({ ok: false, error: 'network down' });
  });

  it('merges extra metadata alongside full_name', async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: EXISTING_ID } }, error: null });

    await createAuthUserBoundTo({
      email: 'resident@example.com',
      fullName: 'Jane Doe',
      userId: EXISTING_ID,
      metadata: { external_user_id: EXISTING_ID },
    });

    const attrs = createUserMock.mock.calls[0]![0] as { user_metadata: Record<string, unknown> };
    expect(attrs.user_metadata).toEqual({
      full_name: 'Jane Doe',
      external_user_id: EXISTING_ID,
    });
  });
});

describe('rollBackAuthUser', () => {
  it('reports success', async () => {
    await expect(rollBackAuthUser(MINTED_ID)).resolves.toBe('rolled back');
    expect(deleteUserMock).toHaveBeenCalledWith(MINTED_ID);
  });

  it('reports a returned error without throwing', async () => {
    deleteUserMock.mockResolvedValue({ error: { message: 'gone' } });
    await expect(rollBackAuthUser(MINTED_ID)).resolves.toMatch(/rollback FAILED: gone/);
  });

  it('reports a thrown error without throwing', async () => {
    // Callers invoke this while already handling a failure — it must never
    // replace the original error with one of its own.
    deleteUserMock.mockRejectedValue(new Error('socket hang up'));
    await expect(rollBackAuthUser(MINTED_ID)).resolves.toMatch(/rollback FAILED: socket hang up/);
  });
});
