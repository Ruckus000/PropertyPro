import { createServerClient } from '@propertypro/db/supabase/server';
import { UnauthorizedError } from './errors';

/**
 * Resolve the authenticated Supabase user ID from server-side session cookies.
 * Throws UnauthorizedError when no valid session user is present.
 */
export async function requireAuthenticatedUserId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new UnauthorizedError();
  }

  return user.id;
}
