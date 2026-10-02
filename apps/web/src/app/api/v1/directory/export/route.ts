/**
 * GET /api/v1/directory/export?communityId=X&kind=units|residents[&userIds=a,b]
 *
 * The Directory's CSV export. Columns follow the same gates the Directory page
 * applies, re-checked here because the page hiding a column is not the
 * boundary:
 * - units: units:read. Occupancy, owners and residents for managers only;
 *   balances need finances:read on a plan with finance; violation counts need
 *   violations on (type + plan).
 * - residents: managers only (the Residents tab is). `userIds` narrows to the
 *   current selection.
 * Every export is audited (`directory_exported`).
 */
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { runRoute } from '@/lib/api/run-route';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { requireViolationsEnabled } from '@/lib/violations/common';
import { buildDirectoryExport } from '@/lib/services/directory-export-service';
import { directoryExportContract } from './contract';

export const GET = withErrorHandler(
  runRoute(directoryExportContract, async ({ query, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'units', 'read');
    await requireEntitledForAdminRead(communityId, membership);

    const { kind, userIds, occupantIds } = query;
    if (kind === 'residents' && !membership.isAdmin) {
      throw new ForbiddenError('Only managers can export residents');
    }
    if ((userIds || occupantIds) && kind !== 'residents') {
      throw new BadRequestError('userIds and occupantIds apply to residents only');
    }

    const permissionContext = { isUnitOwner: membership.isUnitOwner };
    const features = getFeaturesForCommunity(membership.communityType);
    const canSeeBalances =
      membership.isAdmin &&
      features.hasFinance &&
      checkPermissionV2(membership.role, membership.communityType, 'finances', 'read', permissionContext) &&
      (await requirePlanFeature(communityId, 'hasFinance').then(() => true, () => false));
    const canSeeViolations =
      membership.isAdmin && (await requireViolationsEnabled(membership).then(() => true, () => false));

    const { csv, rowCount } = await buildDirectoryExport({
      communityId,
      kind,
      // A selection is the union of both id lists; neither means "everyone".
      selection: userIds || occupantIds ? { userIds: userIds ?? [], occupantIds: occupantIds ?? [] } : undefined,
      access: { isAdmin: membership.isAdmin, canSeeBalances, canSeeViolations },
      actorUserId,
    });
    return { filename: `directory-${kind}-${communityId}.csv`, csv, rowCount };
  }),
);
