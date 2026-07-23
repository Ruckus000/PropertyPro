import { runRoute } from '@propertypro/api-contract';
import { ADMIN_TIER_DB_ROLES } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError } from '@/lib/api/errors';
import { parsePositiveInt, requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { listDelinquentUnits } from '@/lib/services/finance-service';
import { delinquencyGetContract } from './contract';

// role-v3: admin-tier DB roles (bilingual — manager/pm_admin + property_manager/
// root_manager). The legacy ['manager','pm_admin'] set locked every v3
// property_manager out of delinquency, though the RBAC matrix grants them finances:read.
const DELINQUENCY_READ_ROLES = new Set<string>(ADMIN_TIER_DB_ROLES);

export const GET = withErrorHandler(
  runRoute(delinquencyGetContract, async ({ req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromQuery(req);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    requireFinanceReadPermission(membership);

    if (!DELINQUENCY_READ_ROLES.has(membership.role)) {
      throw new ForbiddenError('Only community finance staff can access delinquency reporting');
    }
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const searchParams = new URL(req.url).searchParams;
    const rawThreshold = searchParams.get('lienThresholdDays');
    const lienThresholdDays = rawThreshold ? parsePositiveInt(rawThreshold, 'lienThresholdDays') : 90;

    const data = await listDelinquentUnits(communityId, lienThresholdDays);
    return { data, meta: { lienThresholdDays } };
  }),
);
