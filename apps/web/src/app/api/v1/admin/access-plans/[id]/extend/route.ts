/**
 * POST /api/v1/admin/access-plans/[id]/extend — Extend an access plan
 *
 * Auth: platform admin (platform_admin_users row)
 *
 * Plan A1 drain #180 — migrated to `runRoute(contract, handler)`; see `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { handleOptions, mergeAdminCorsHeaders } from '@/lib/api/admin-cors';
import {
  computeAccessPlanStatus,
  extendFreeAccess,
} from '@/lib/services/account-lifecycle-service';
import { adminAccessPlanExtendContract } from './contract';

export { handleOptions as OPTIONS };

const runExtendAccessPlan = runRoute(
  adminAccessPlanExtendContract,
  async ({ params, body }) => {
    const adminUserId = await requirePlatformAdmin();

    const newPlan = await extendFreeAccess(params.id, {
      additionalMonths: body.additionalMonths,
      grantedBy: adminUserId,
      notes: body.notes,
    });

    return { ...newPlan, status: computeAccessPlanStatus(newPlan) };
  },
);

export const POST = withErrorHandler(async (req, ctx) => {
  const origin = req.headers.get('origin');
  const response = await runExtendAccessPlan(req, ctx);
  return mergeAdminCorsHeaders(response, origin);
});
