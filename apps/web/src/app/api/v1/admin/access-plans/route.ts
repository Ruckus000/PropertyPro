/**
 * GET  /api/v1/admin/access-plans  — List all access plans (optional communityId filter)
 * POST /api/v1/admin/access-plans  — Grant free access to a community
 *
 * Auth: platform admin (platform_admin_users row)
 *
 * Plan A1 auto-drain — migrated to `runRoute(contract, handler)`; see `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requirePlatformAdmin } from '@/lib/api/require-platform-admin';
import { handleOptions, mergeAdminCorsHeaders } from '@/lib/api/admin-cors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import {
  communityExistsAdmin,
  computeAccessPlanStatus,
  grantFreeAccess,
  listAccessPlansWithStatus,
} from '@/lib/services/account-lifecycle-service';
import {
  adminAccessPlansGrantContract,
  adminAccessPlansListContract,
} from './contract';

export { handleOptions as OPTIONS };

// ---------------------------------------------------------------------------
// GET — list access plans
// ---------------------------------------------------------------------------

const runListAccessPlans = runRoute(adminAccessPlansListContract, async ({ query }) => {
  const adminUserId = await requirePlatformAdmin();
  void adminUserId; // used only for auth guard

  return query.communityId !== undefined
    ? listAccessPlansWithStatus({ communityId: query.communityId })
    : listAccessPlansWithStatus();
});

export const GET = withErrorHandler(async (req, ctx) => {
  const origin = req.headers.get('origin');
  const response = await runListAccessPlans(req, ctx);
  return mergeAdminCorsHeaders(response, origin);
});

// ---------------------------------------------------------------------------
// POST — grant free access
// ---------------------------------------------------------------------------

const runGrantFreeAccess = runRoute(adminAccessPlansGrantContract, async ({ body }) => {
  const adminUserId = await requirePlatformAdmin();

  const { communityId, durationMonths, gracePeriodDays, notes } = body;

  // Verify community exists (business rule — preserved byte-identical).
  if (!(await communityExistsAdmin(communityId))) {
    throw new ValidationError('Community not found', { communityId: 'Community does not exist' });
  }

  const plan = await grantFreeAccess(communityId, {
    durationMonths,
    gracePeriodDays,
    notes,
    grantedBy: adminUserId,
  });

  return { ...plan, status: computeAccessPlanStatus(plan) };
});

export const POST = withErrorHandler(async (req, ctx) => {
  const origin = req.headers.get('origin');
  const response = await runGrantFreeAccess(req, ctx);
  return mergeAdminCorsHeaders(response, origin);
});
