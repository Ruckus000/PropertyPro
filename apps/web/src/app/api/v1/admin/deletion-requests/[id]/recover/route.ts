/**
 * POST /api/v1/admin/deletion-requests/[id]/recover
 *
 * Recover a soft-deleted user or community. Reads request_type from the
 * deletion request to dispatch to the correct recovery function.
 *
 * Auth: platform admin (platform_admin_users row)
 *
 * Plan A1 drain — migrated to `runRoute(contract, handler)`; see `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { handleOptions, mergeAdminCorsHeaders } from '@/lib/api/admin-cors';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import {
  getDeletionRequestType,
  recoverCommunity,
  recoverUser,
} from '@/lib/services/account-lifecycle-service';
import { adminDeletionRequestRecoverContract } from './contract';

export { handleOptions as OPTIONS };

const runRecoverDeletionRequest = runRoute(
  adminDeletionRequestRecoverContract,
  async ({ params }) => {
    const adminUserId = await requirePlatformAdmin();
    const requestId = params.id;

    // Look up the deletion request to determine type
    const requestType = await getDeletionRequestType(requestId);
    if (!requestType) {
      throw new NotFoundError('Deletion request not found');
    }

    return requestType === 'user'
      ? recoverUser(requestId, adminUserId)
      : recoverCommunity(requestId, adminUserId);
  },
);

export const POST = withErrorHandler(async (req, ctx) => {
  const origin = req.headers.get('origin');
  const response = await runRecoverDeletionRequest(req, ctx);
  return mergeAdminCorsHeaders(response, origin);
});
