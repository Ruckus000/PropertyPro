/**
 * Provisioning status polling endpoint.
 *
 * Called by the post-checkout ProvisioningProgress client component every 2s.
 *
 * BOUND TO THE SIGNED-IN FOUNDER. The `signupRequestId` is not a secret (it is
 * in the Stripe return URL), so it only names the signup; the session decides
 * whether the caller may watch it. Email-first signup signs the founder in
 * before they pay, the details step stamps `auth_user_id` with that user, and
 * provisioning links that same account as the community's root manager. So the
 * founder already holds the root manager's session when they land here, and
 * this endpoint mints no login token: it used to hand the FIRST poller a
 * single-use magic-link token (for the retired form flow, whose founders had no
 * session), which made the id a race for a root-manager login.
 *
 * Reads the REAL session user (as the details route does), not
 * `requireAuthenticatedUser()`, which substitutes a support-impersonated
 * identity. A signup someone else owns answers exactly like an unknown id:
 * `pending`, forever.
 *
 * Plan A1 drain #152. `runRoute(contract, handler)`; success payloads are the
 * canonical `{ data: { status, step, ... } }`.
 */
import { runRoute } from '@propertypro/api-contract';
import { createServerClient } from '@propertypro/db/supabase/server';
import { withErrorHandler } from '@/lib/api/error-handler';
import { UnauthorizedError } from '@/lib/api/errors';
import {
  getPendingSignupBySignupRequestId,
  getProvisioningJobBySignupRequestId,
} from '@/lib/services/provisioning-service';
import { provisioningStatusGetContract } from './contract';

// route-gate: self-scoped — answers only for a signup whose auth_user_id is the session user; anyone else sees what an unknown id sees
export const GET = withErrorHandler(
  runRoute(provisioningStatusGetContract, async ({ query }) => {
    const { signupRequestId } = query;

    const supabase = await createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user || !user.email_confirmed_at) {
      throw new UnauthorizedError();
    }

    const signup = await getPendingSignupBySignupRequestId(signupRequestId);
    if (!signup || signup.authUserId !== user.id) {
      return { status: 'pending' as const, step: 'waiting' };
    }

    const job = await getProvisioningJobBySignupRequestId(signupRequestId);

    if (!job) {
      return { status: 'pending' as const, step: 'waiting' };
    }

    if (job.status === 'failed') {
      return {
        status: 'failed' as const,
        step: job.lastSuccessfulStatus ?? 'initiated',
      };
    }

    if (job.status === 'completed') {
      return {
        status: 'completed' as const,
        step: 'completed',
        communityId: job.communityId,
      };
    }

    return {
      status: 'provisioning' as const,
      step: job.lastSuccessfulStatus ?? 'initiated',
    };
  }),
);
