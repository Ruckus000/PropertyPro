/**
 * Provisioning status polling endpoint.
 *
 * Called by the post-checkout ProvisioningProgress client component every 2s.
 * No auth required — secured by unguessable signupRequestId UUID.
 *
 * Plan A1 drain #152. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`. Success payloads are canonical `{ data: { status, step, ... } }`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError } from '@/lib/api/errors';
import {
  generateAndCacheLoginToken,
  getPendingSignupBySignupRequestId,
  getProvisioningJobBySignupRequestId,
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

      const payload = (signup.payload ?? {}) as Record<string, unknown>;
      const cachedToken =
        typeof payload.loginToken === 'string' ? payload.loginToken : null;

      if (cachedToken) {
        return {
          status: 'completed' as const,
          step: 'completed',
          loginToken: cachedToken,
          communityId: job.communityId,
        };
      }

      const loginToken = await generateAndCacheLoginToken(
        signupRequestId,
        signup.email,
        payload,
      );
      if (!loginToken) {
        throw new AppError('Failed to generate login token', 500, 'INTERNAL_ERROR');
      }

      return {
        status: 'completed' as const,
        step: 'completed',
        loginToken,
        communityId: job.communityId,
      };
    }

    return {
      status: 'provisioning' as const,
      step: job.lastSuccessfulStatus ?? 'initiated',
    };
  }),
);
