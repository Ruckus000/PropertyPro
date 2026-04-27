/**
 * FeatureGateAnyOf — server-side wrapper for any-of plan-gated route pages.
 *
 * Allows render if ANY of the listed features is plan-enabled. On deny,
 * renders <LockedFeatureScreen> with the first listed feature as the
 * headline. Tenants on deny → redirected to the dashboard.
 *
 * Mirrors the any-of logic in getVisibleItemsWithPlanGate (nav-config).
 */
import { redirect } from 'next/navigation';
import {
  getLockedFeatureBehavior,
  inferCanonicalRoleFromMembership,
  resolvePlanId,
  PLAN_FEATURES,
  type CommunityFeatures,
} from '@propertypro/shared';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { LockedFeatureScreen } from './locked-feature-screen';

export interface FeatureGateAnyOfProps {
  features: ReadonlyArray<keyof CommunityFeatures>;
  /** Optional override for the resolved community ID. */
  communityId?: number;
  children: React.ReactNode;
}

export async function FeatureGateAnyOf({
  features,
  communityId: communityIdOverride,
  children,
}: FeatureGateAnyOfProps) {
  if (features.length === 0) {
    throw new Error('FeatureGateAnyOf requires at least one feature');
  }

  const membership = await requirePageCommunityMembership(communityIdOverride);
  const role = inferCanonicalRoleFromMembership({
    role: membership.role,
    isUnitOwner: membership.isUnitOwner,
    presetKey: membership.presetKey ?? null,
  });
  const planId = resolvePlanId(membership.subscriptionPlan ?? null);
  const planConfig = planId ? PLAN_FEATURES[planId] : null;

  const allowed = features.some((f) => planConfig?.features[f] === true);
  if (allowed) {
    return <>{children}</>;
  }

  if (getLockedFeatureBehavior(role) === 'hidden') {
    redirect(`/dashboard?communityId=${membership.communityId}`);
  }

  // Safe: we asserted features.length > 0 above.
  const headlineFeature = features[0]!;

  return (
    <LockedFeatureScreen
      featureKey={headlineFeature}
      role={role}
      currentPlanId={planId}
      currentPlanRaw={membership.subscriptionPlan ?? null}
      communityId={membership.communityId}
    />
  );
}

export default FeatureGateAnyOf;
