/**
 * Binding a Supabase auth identity to a `public.users` row.
 *
 * ## The invariant
 *
 * `public.users.id === auth.users.id`. Middleware stamps the **session** user id
 * into `x-user-id` (`apps/web/src/middleware.ts`) and every membership lookup
 * keys off it, so a `users` row whose id differs from the session id is
 * unreachable by its own owner: the person signs in successfully and owns
 * nothing — no community, no unit, no role.
 *
 * ## Why this is one module
 *
 * Two flows create auth accounts for someone who may already have a `users`
 * row, and both must hold the invariant:
 *
 *   - invitation acceptance (`invitations-service.ts`) — the row is always
 *     pre-provisioned, so the id is always known up front;
 *   - access-request approval (`access-request-service.ts`) — the row usually
 *     does NOT exist yet, but does for a resident pre-provisioned by another
 *     community.
 *
 * The first was fixed in #939; the second was still broken in #944. Implementing
 * "create, verify, roll back" twice is how one gets fixed and the other drifts,
 * so it lives here once.
 *
 * This module owns the auth identity only. It performs no DB writes, no
 * authorization, and no HTTP — callers keep those.
 */
import { createAdminClient } from '@propertypro/db/supabase/admin';

export type AuthUserBindingResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Best-effort removal of an auth user, returning a human-readable status.
 *
 * Callers need this because the DB writes that follow a successful bind can
 * still fail: `users.email` is UNIQUE, so a conflict there leaves an auth
 * account that is already **loginable** (`email_confirm: true`) with no rows
 * behind it, and — worse — permanently blocks any retry, since the second
 * attempt fails with "email already registered".
 *
 * Never throws. If the cleanup itself fails the account needs a human, so the
 * reason is returned for the caller to surface rather than swallowed.
 */
export async function rollBackAuthUser(userId: string): Promise<string> {
  try {
    const { error } = await createAdminClient().auth.admin.deleteUser(userId);
    return error ? `rollback FAILED: ${error.message}` : 'rolled back';
  } catch (err) {
    return `rollback FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Create a Supabase auth user, optionally bound to an existing `users.id`.
 *
 * - `userId` supplied → Supabase must **adopt** it (`AdminUserAttributes.id`
 *   exists for exactly this). The returned id is verified, and a mismatch rolls
 *   the account back rather than reporting a success that would strand the user.
 * - `userId` omitted → Supabase mints one and it is returned. This is the
 *   correct path when no `users` row exists yet; the caller then uses the
 *   returned id as the row's primary key.
 *
 * Returns a discriminated union rather than throwing, so callers can build
 * structured responses.
 */
export async function createAuthUserBoundTo(params: {
  email: string;
  fullName: string | null;
  password?: string;
  /** Existing `public.users.id` to adopt. Omit when the row does not exist yet. */
  userId?: string;
  /** Extra `user_metadata` merged alongside `full_name`. */
  metadata?: Record<string, unknown>;
}): Promise<AuthUserBindingResult> {
  const { email, fullName, password, userId, metadata } = params;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      ...(userId ? { id: userId } : {}),
      email,
      ...(password ? { password } : {}),
      email_confirm: true,
      user_metadata: { full_name: fullName, ...metadata },
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const createdId = data?.user?.id;
    if (!createdId) {
      return { ok: false, error: 'Supabase returned no user id' };
    }

    // Verify rather than assume. If a future GoTrue ignores the requested id the
    // failure is silent, and only surfaces when the person finds an empty app.
    if (userId && createdId !== userId) {
      const rollback = await rollBackAuthUser(createdId);
      return {
        ok: false,
        error:
          `Supabase created auth user ${createdId} but ${userId} was required; `
          + `refusing to leave the account unlinked (${rollback})`,
      };
    }

    return { ok: true, userId: createdId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
