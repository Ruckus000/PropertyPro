/**
 * POST /api/v1/billing/upgrade-requests
 *
 * Lets a non-billing community member (owner, board member, site manager)
 * notify the billing-capable users (board president, CAM, PM admin) that
 * they want a plan upgrade. Tenants are denied at this layer.
 *
 * Plan A1 drain #146. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import {
  insertNotifications,
  type InsertNotificationRow,
} from '@propertypro/db';
import {
  canRequestUpgrade,
  inferCanonicalRoleFromMembership,
  PLAN_FEATURES,
  type PlanId,
} from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { ForbiddenError } from '@/lib/api/errors';
import { listBillingCapableUserIds } from '@/lib/services/billing-upgrade-requests-service';
import { billingUpgradeRequestPostContract } from './contract';

function humanizeFeatureKey(key: string): string {
  return key
    .replace(/^has/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}

export const POST = withErrorHandler(
  runRoute(billingUpgradeRequestPostContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    const membership = await requireCommunityMembership(communityId, userId);

    const inferredCanonicalRole = inferCanonicalRoleFromMembership({
      role: membership.role,
      isUnitOwner: membership.isUnitOwner,
      presetKey: membership.presetKey ?? null,
      designation: membership.designation ?? null,
    });
    if (!canRequestUpgrade(inferredCanonicalRole)) {
      throw new ForbiddenError('Tenants cannot request plan upgrades.');
    }

    const { featureKey, requestedPlan } = body;

    const recipientIds = await listBillingCapableUserIds(communityId, userId);

    if (recipientIds.length === 0) {
      return { ok: true as const, notified: 0 };
    }

    const requesterName = membership.displayTitle || 'A community member';

    const planConfig = requestedPlan ? PLAN_FEATURES[requestedPlan] : null;
    const planLabel = planConfig?.displayName ?? 'a higher plan';
    const featureLabel = featureKey ? humanizeFeatureKey(featureKey) : 'a premium feature';

    const sourceId = `${userId}:${featureKey ?? 'unknown'}:${Math.floor(Date.now() / 1000)}`;
    const rows: InsertNotificationRow[] = recipientIds.map((recipientId) => ({
      communityId,
      userId: recipientId,
      category: 'system',
      title: `${requesterName} requested a plan upgrade`,
      body: `${requesterName} is asking to unlock ${featureLabel}. Available on ${planLabel}.`,
      actionUrl: `/settings/billing/change-plan?communityId=${communityId}`,
      sourceType: 'plan_upgrade_request',
      sourceId,
      priority: 'normal',
    }));

    const result = await insertNotifications(rows);
    return { ok: true as const, notified: result.created };
  }),
);
