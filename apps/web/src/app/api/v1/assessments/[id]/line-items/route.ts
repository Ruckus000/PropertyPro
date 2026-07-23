/**
 * Finance — assessment line items
 *
 * GET /api/v1/assessments/[id]/line-items?communityId=N&unitId=N
 *
 * Plan A1 bundle drain #34. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *   → resolveEffectiveCommunityId(req, query.communityId)
 *   → requireCommunityMembership
 *   → requireFinanceEnabled (async)
 *   → requireFinanceReadPermission (sync)
 *   → resident-unit-ownership check (handler-internal)
 *   → listAssessmentLineItemsForCommunity(communityId, assessmentId, unitId?)
 *
 * Resident rule (preserved verbatim):
 *   - residents who are unit owners must supply `unitId` when they own >1 unit;
 *   - they can only access line items for a unit they own;
 *   - default unitId = sole owned unit when only one is owned.
 *
 * Behavior changes vs. pre-migration:
 *   - 400 body for invalid `[id]` / missing or non-numeric `communityId`
 *     shifts to the canonical `VALIDATION_ERROR` envelope. Status unchanged.
 *   - `unitId=` (empty string) is now a 400 `VALIDATION_ERROR` (pre-migration
 *     treated empty string as "no unitId"). Empty string is malformed input;
 *     the canonical envelope is appropriate. Missing `unitId` (param absent)
 *     still flows through unchanged.
 *   - Success wire shape `{ data: lineItems }` byte-identical.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import {
  requireFinanceEnabled,
  requireFinanceReadPermission,
} from '@/lib/finance/common';
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import {
  listActorUnitIdsForFinance,
  listAssessmentLineItemsForCommunity,
} from '@/lib/services/finance-service';
import { assessmentsLineItemsGetContract } from './contract';

export const GET = withErrorHandler(
  runRoute(assessmentsLineItemsGetContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireFinanceEnabled(membership);
    requireFinanceReadPermission(membership);
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    let unitId = query.unitId;

    if (membership.role === 'resident' && membership.isUnitOwner) {
      const actorUnitIds = await listActorUnitIdsForFinance(communityId, actorUserId);
      if (actorUnitIds.length === 0) {
        throw new ForbiddenError(
          'No unit is associated with this owner in the selected community',
        );
      }
      if (unitId === undefined && actorUnitIds.length > 1) {
        throw new BadRequestError(
          'unitId query parameter is required when you are associated with multiple units',
        );
      }
      if (unitId !== undefined) {
        if (!actorUnitIds.includes(unitId)) {
          throw new ForbiddenError(
            'Owners can only access line items for their own unit',
          );
        }
      } else {
        unitId = actorUnitIds[0];
      }
    }

    return listAssessmentLineItemsForCommunity(communityId, params.id, unitId);
  }),
);
