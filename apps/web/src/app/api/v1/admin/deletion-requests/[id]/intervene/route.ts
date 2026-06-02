/**
 * POST /api/v1/admin/deletion-requests/[id]/intervene
 *
 * Platform admin cancels a community deletion request.
 *
 * Auth: platform admin (platform_admin_users row)
 *
 * Plan A1 drain #179 — migrated to `runRoute(contract, handler)`; see `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { handleOptions, mergeAdminCorsHeaders } from '@/lib/api/admin-cors';
import { interveneCommunityDeletion } from '@/lib/services/account-lifecycle-service';
import { adminDeletionRequestInterveneContract } from './contract';

export { handleOptions as OPTIONS };

const runInterveneDeletionRequest = runRoute(
  adminDeletionRequestInterveneContract,
  async ({ params, body }) => {
    const adminUserId = await requirePlatformAdmin();

    return interveneCommunityDeletion(params.id, {
      adminUserId,
      notes: body?.notes,
    });
  },
);

export const POST = withErrorHandler(async (req, ctx) => {
  const origin = req.headers.get('origin');
  const response = await runInterveneDeletionRequest(req, ctx);
  return mergeAdminCorsHeaders(response, origin);
});
