/**
 * Provisioning status polling endpoint.
 *
 * Called by the post-checkout ProvisioningProgress client component every 2s.
 * No auth required — secured by an unguessable signupRequestId UUID.
 *
 * The magic-link login token is SINGLE-USE with a short TTL:
 *   - The first poll that observes status='completed' generates a token AND
 *     atomically marks pending_signups.login_token_consumed_at in the same
 *     update (guarded by `login_token_consumed_at IS NULL`).
 *   - Subsequent polls (or any leaked-signupRequestId replay) see the consumed
 *     marker and receive { status: 'consumed' } with no token.
 * The genuine browser polls every 2s and consumes the token essentially
 * immediately; any later replay gets no token. Closes the audit's leaked-id
 * replay scenario.
 *
 * Plan A1 drain #152. `runRoute(contract, handler)`; success payloads are the
 * canonical `{ data: { status, step, ... } }`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError } from '@/lib/api/errors';
import {
  getPendingSignupBySignupRequestId,
  getProvisioningJobBySignupRequestId,
  issueSingleUseLoginToken,
} from '@/lib/services/provisioning-service';
import { provisioningStatusGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(provisioningStatusGetContract, async ({ query }) => {
    const { signupRequestId } = query;

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
      const signup = await getPendingSignupBySignupRequestId(signupRequestId);

      if (!signup) {
        throw new AppError('Signup record not found', 500, 'INTERNAL_ERROR');
      }

      // Already consumed — a repeat poll after the genuine browser claimed the
      // token, or a leaked-signupRequestId replay. Surface 'consumed' with no
      // token so it can never be replayed.
      if (signup.loginTokenConsumedAt) {
        return {
          status: 'consumed' as const,
          step: 'completed',
          communityId: job.communityId,
        };
      }

      const result = await issueSingleUseLoginToken(signupRequestId, signup.email);

      if (result.status === 'error') {
        throw new AppError('Failed to generate login token', 500, 'INTERNAL_ERROR');
      }

      if (result.status === 'consumed') {
        // A concurrent poll won the atomic claim in the window between our
        // SELECT and UPDATE. Don't return the freshly generated token — the
        // other poller already received the canonical one.
        return {
          status: 'consumed' as const,
          step: 'completed',
          communityId: job.communityId,
        };
      }

      return {
        status: 'completed' as const,
        step: 'completed',
        loginToken: result.token,
        communityId: job.communityId,
      };
    }

    return {
      status: 'provisioning' as const,
      step: job.lastSuccessfulStatus ?? 'initiated',
    };
  }),
);
