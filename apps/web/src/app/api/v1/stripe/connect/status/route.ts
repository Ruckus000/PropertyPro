/**
 * GET /api/v1/stripe/connect/status?communityId=X
 *
 * Returns Stripe Connect onboarding status for a community. Restricted to
 * the management tier (property_manager / root_manager).
 *
 * Plan A1 drain #23: input validation (query) and output envelope wrapping
 * delegated to `runRoute()` from `@propertypro/api-contract`. Auth chain
 * preserved verbatim — pre-migration used `parseCommunityIdFromQuery`,
 * which already delegates to `resolveEffectiveCommunityId` (drain #10
 * lesson). The wire shape is `{ data: status }`, unchanged.
 *
 * Closest precedent: drain #20 (PR #428) — /api/v1/esign/my-pending,
 * query-only GET with an extra permission gate beyond plain membership.
 *
 * Behavior change: pre-migration 400s threw BadRequestError with a custom
 * message; runner produces the canonical VALIDATION_ERROR envelope. Status
 * code (400) is unchanged.
 */
import { runRoute } from '@propertypro/api-contract';
import { ADMIN_TIER_DB_ROLES } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { ForbiddenError } from '@/lib/api/errors';
import { requireFinanceEnabled, requireFinanceReadPermission } from '@/lib/finance/common';
import { getConnectStatus } from '@/lib/services/finance-service';
import { stripeConnectStatusGetContract } from './contract';

// ADMIN_TIER_DB_ROLES is v3-only — ['property_manager','root_manager']. Kept as
// its own named set because the legacy ['manager','pm_admin'] set used here once
// locked every v3 property_manager out of Stripe Connect status.
// legacy-roles:exempt — names the pre-v3 set to explain why this one exists.
const CONNECT_STATUS_ROLES = new Set<string>(ADMIN_TIER_DB_ROLES);

export const GET = withErrorHandler(
  runRoute(stripeConnectStatusGetContract, async ({ query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requireFinanceEnabled(membership);
    requireFinanceReadPermission(membership);

    if (!CONNECT_STATUS_ROLES.has(membership.role)) {
      throw new ForbiddenError('Only community finance staff can view Stripe Connect status');
    }

    return getConnectStatus(communityId);
  }),
);
