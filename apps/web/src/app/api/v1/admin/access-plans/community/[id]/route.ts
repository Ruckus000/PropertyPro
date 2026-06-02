/**
 * GET /api/v1/admin/access-plans/community/[id] — List plans for a specific community
 *
 * Auth: platform admin (platform_admin_users row)
 *
 * Plan A1 drain #178 — migrated to `runRoute(contract, handler)`; see `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { handleOptions, mergeAdminCorsHeaders } from '@/lib/api/admin-cors';
import { listAccessPlansWithStatus } from '@/lib/services/account-lifecycle-service';
import { adminAccessPlansCommunityListContract } from './contract';

export { handleOptions as OPTIONS };

const runListCommunityAccessPlans = runRoute(
  adminAccessPlansCommunityListContract,
  async ({ params }) => {
    const adminUserId = await requirePlatformAdmin();
    void adminUserId;

    return listAccessPlansWithStatus({ communityId: params.id });
  },
);

export const GET = withErrorHandler(async (req, ctx) => {
  const origin = req.headers.get('origin');
  const response = await runListCommunityAccessPlans(req, ctx);
  return mergeAdminCorsHeaders(response, origin);
});
