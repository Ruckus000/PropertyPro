/**
 * Plan-feature guard — Phase 5 plan gating
 *
 * Enforces plan-level feature access for write route handlers.
 * Called explicitly in route handlers — NOT applied as global middleware —
 * to allow fine-grained control (same pattern as subscription-guard.ts).
 *
 * Degradation rules:
 *   null plan         → fail-open (community not yet provisioned)
 *   unknown plan      → fail-open (legacy / unrecognized plan string)
 *   plan without feat → throws 403 PLAN_UPGRADE_REQUIRED
 */
import { eq } from '@propertypro/db/filters';
import { communities } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { PLAN_FEATURES, resolvePlanId, getEffectiveFeatures } from '@propertypro/shared';
import type { CommunityType, CommunityFeatures } from '@propertypro/shared';
import { AppError } from '@/lib/api/errors/AppError';

/**
 * Verify that the community's subscription plan includes the given feature.
 * Throws AppError(403, 'PLAN_UPGRADE_REQUIRED') if the plan doesn't include it.
 */
export async function requirePlanFeature(
  communityId: number,
  featureKey: keyof CommunityFeatures,
): Promise<void> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ subscriptionPlan: communities.subscriptionPlan })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const rawPlan = rows[0]?.subscriptionPlan ?? null;

  // Null plan = fail-open (new community, not yet provisioned)
  if (rawPlan === null) return;

  const planId = resolvePlanId(rawPlan);

  // Unknown plan (resolves to null after lookup) = fail-open
  if (planId === null) return;

  const planConfig = PLAN_FEATURES[planId];

  if (planConfig.features[featureKey]) {
    return;
  }

  // Find the cheapest plan that includes this feature
  const upgradeTo = (Object.values(PLAN_FEATURES) as Array<typeof planConfig>)
    .filter((p) => p.features[featureKey])
    .sort((a, b) => a.monthlyPriceUsd - b.monthlyPriceUsd)[0];

  const upgradeDisplayName = upgradeTo?.displayName ?? 'a higher';

  throw new AppError(
    `This feature requires the ${upgradeDisplayName} plan or higher.`,
    403,
    'PLAN_UPGRADE_REQUIRED',
    { featureKey, currentPlan: planId, requiredPlanDisplayName: upgradeDisplayName },
  );
}

/**
 * Returns the effective feature flags for a community, composing both
 * community-type features AND plan-level features.
 *
 * Use in page components (server components) that need to redirect on
 * missing features. For API route handlers, prefer requirePlanFeature().
 *
 * Degradation rules match requirePlanFeature: null/unknown plan → fail-open.
 */
export async function getEffectiveFeaturesForPage(
  communityId: number,
  communityType: CommunityType,
): Promise<CommunityFeatures> {
  const db = createUnscopedClient();
  const rows = await db
    .select({ subscriptionPlan: communities.subscriptionPlan })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const rawPlan = rows[0]?.subscriptionPlan ?? null;
  const planId = resolvePlanId(rawPlan);

  return getEffectiveFeatures(communityType, planId);
}
