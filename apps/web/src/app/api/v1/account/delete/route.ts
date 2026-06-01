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
  runRoute(accountDeletePostContract, async () => {
    const userId = await requireAuthenticatedUserId();
    await requireFreshReauth(userId);
    return requestUserDeletion(userId);
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
