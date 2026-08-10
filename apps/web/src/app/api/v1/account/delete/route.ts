/**
 * GET    /api/v1/account/delete — Check active deletion request status
 * POST   /api/v1/account/delete — Request account deletion
 * DELETE /api/v1/account/delete — Cancel account deletion
 *
 * User requests, checks, or cancels their own account deletion.
 *
 * Plan A1 drain #160. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireFreshReauth } from '@/lib/api/reauth-guard';
import {
  cancelUserDeletion,
  findCoolingDeletionRequestForUser,
  getLatestUserDeletionRequest,
  requestUserDeletion,
  RootOffboardingAckRequiredError,
} from '@/lib/services/account-lifecycle-service';
import { AppError } from '@/lib/api/errors/AppError';
import {
  accountDeleteDeleteContract,
  accountDeleteGetContract,
  accountDeletePostContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(accountDeleteGetContract, async () => {
    const userId = await requireAuthenticatedUserId();
    const activeRequest = await getLatestUserDeletionRequest(userId);

    if (
      !activeRequest ||
      activeRequest.status === 'cancelled' ||
      activeRequest.status === 'recovered'
    ) {
      return null;
    }

    return activeRequest;
  }),
);

export const POST = withErrorHandler(
  runRoute(accountDeletePostContract, async ({ body }) => {
    const userId = await requireAuthenticatedUserId();
    await requireFreshReauth(userId);

    try {
      return await requestUserDeletion(userId, body?.acknowledgeRootOffboarding ?? false);
    } catch (err) {
      // R3-03b: the caller is root somewhere and has not acknowledged it yet.
      // 409 (not 403) — this is a confirmable state, not a refusal; the client
      // re-submits with `acknowledgeRootOffboarding: true`. The affected
      // communities ride along so the prompt can name them, and flag the ones
      // with no successor, which have no self-service recovery.
      if (err instanceof RootOffboardingAckRequiredError) {
        throw new AppError(
          'Deleting your account will leave communities without a root manager.',
          409,
          'ROOT_OFFBOARDING_ACK_REQUIRED',
          { communities: err.communities },
        );
      }
      throw err;
    }
  }),
);

export const DELETE = withErrorHandler(
  runRoute(accountDeleteDeleteContract, async () => {
    const userId = await requireAuthenticatedUserId();

    const activeRequestId = await findCoolingDeletionRequestForUser(userId);
    if (activeRequestId === null) {
      throw new AppError('No active deletion request found', 404, 'NOT_FOUND');
    }

    await cancelUserDeletion(activeRequestId, userId);
    return { cancelled: true as const };
  }),
);
