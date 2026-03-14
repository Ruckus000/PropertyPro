import { createServerClient } from '@propertypro/db/supabase/server';
import type { User } from '@supabase/supabase-js';
import { UnauthorizedError } from './errors';

/**
 * Resolve the authenticated Supabase user ID from server-side session cookies.
 * Throws UnauthorizedError when no valid session user is present.
 */
export async function requireAuthenticatedUserId(): Promise<string> {
  const user = await requireAuthenticatedUser();
  return user.id;
}

/**
 * Resolve the full authenticated Supabase User from server-side session cookies.
 * Throws UnauthorizedError when no valid session user is present.
 *
 * Use this when you need more than just the user ID (e.g. email).
 */
export async function requireAuthenticatedUser(): Promise<User> {
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
