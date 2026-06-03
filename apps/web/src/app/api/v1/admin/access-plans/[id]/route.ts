/**
 * DELETE /api/v1/admin/access-plans/[id] — Revoke an access plan
 *
 * Auth: platform admin (platform_admin_users row)
 *
 * Plan A1 drain — migrated to `runRoute(contract, handler)`; see `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { handleOptions, mergeAdminCorsHeaders } from '@/lib/api/admin-cors';
import { revokeFreeAccess } from '@/lib/services/account-lifecycle-service';
import { adminAccessPlanRevokeContract } from './contract';

export { handleOptions as OPTIONS };

const runRevokeAccessPlan = runRoute(
  adminAccessPlanRevokeContract,
  async ({ params, body }) => {
    const adminUserId = await requirePlatformAdmin();

    return revokeFreeAccess(params.id, {
      revokedBy: adminUserId,
      reason: body?.reason,
    });
  },
);

export const DELETE = withErrorHandler(async (req, ctx) => {
  const origin = req.headers.get('origin');
  const response = await runRevokeAccessPlan(req, ctx);
  return mergeAdminCorsHeaders(response, origin);
});
