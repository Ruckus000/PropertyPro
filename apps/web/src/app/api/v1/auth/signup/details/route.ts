/**
 * POST /api/v1/auth/signup/details — email-first signup, step 3.
 *
 * Writes the caller's `pending_signups` row from their answers. See
 * `lib/auth/signup-email-first.ts`.
 *
 * Reads the REAL session user, not `requireAuthenticatedUser()`: that helper
 * substitutes a support-impersonated identity, and a signup must be owned by
 * whoever actually holds the verified email.
 */
import { runRoute } from '@propertypro/api-contract';
import { createServerClient } from '@propertypro/db/supabase/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { UnauthorizedError } from '@/lib/api/errors';
import { submitSignupDetails } from '@/lib/auth/signup-email-first';
import { authSignupDetailsPostContract } from './contract';

// route-gate: self-scoped — writes only the pending signup keyed by the session user's own confirmed email; refuses without a session or confirmation
export const POST = withErrorHandler(
  runRoute(authSignupDetailsPostContract, async ({ body }) => {
    const supabase = await createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      throw new UnauthorizedError();
    }
    return submitSignupDetails(user, body);
  }),
);
