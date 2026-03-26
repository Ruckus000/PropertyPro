import { headers } from 'next/headers';
import { createServerClient } from '@propertypro/db/supabase/server';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import type { User } from '@supabase/supabase-js';
import { UnauthorizedError } from './errors';

const USER_ID_HEADER = 'x-user-id';

interface UserProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

async function resolveSessionUser(): Promise<User> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new UnauthorizedError();
  }

  return user;
}

async function resolveEffectiveUserIdFromHeaders(): Promise<string | null> {
  const requestHeaders = await headers();
  return requestHeaders.get(USER_ID_HEADER);
}

async function lookupUserProfile(userId: string): Promise<UserProfileRow | null> {
  // Authorization contract: middleware has already enforced a valid session
  // and stamped x-user-id. This service-role read only hydrates the effective
  // actor's display identity for support impersonation.
  const db = createAdminClient();
  const { data, error } = await db
    .from('users')
    .select('id, email, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve effective user profile: ${error.message}`);
  }

  return (data as UserProfileRow | null) ?? null;
}

/**
 * Resolve the effective authenticated user ID for this request.
 * Still requires a valid underlying Supabase session, but support-session
 * middleware may override the effective actor via x-user-id.
 */
export async function requireAuthenticatedUserId(): Promise<string> {
  const [sessionUser, effectiveUserId] = await Promise.all([
    resolveSessionUser(),
    resolveEffectiveUserIdFromHeaders(),
  ]);

  return effectiveUserId ?? sessionUser.id;
}

/**
 * Resolve the effective authenticated user for this request.
 * Still requires a valid underlying Supabase session, but support-session
 * middleware may override the returned user's identity for rendering.
 *
 * Use this when you need more than just the user ID (e.g. email).
 */
export async function requireAuthenticatedUser(): Promise<User> {
  const [sessionUser, effectiveUserId] = await Promise.all([
    resolveSessionUser(),
    resolveEffectiveUserIdFromHeaders(),
  ]);

  if (!effectiveUserId || effectiveUserId === sessionUser.id) {
    return sessionUser;
  }

  const profile = await lookupUserProfile(effectiveUserId);

  return {
    ...sessionUser,
    id: effectiveUserId,
    email: profile?.email ?? sessionUser.email,
    user_metadata: {
      ...(sessionUser.user_metadata ?? {}),
      full_name:
        profile?.full_name ??
        ((sessionUser.user_metadata?.full_name as string | undefined) ?? null),
    },
  };
}
