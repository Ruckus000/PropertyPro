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
  getEffectiveFeatures,
  resolvePlanId,
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
  const planId = resolvePlanId(membership.subscriptionPlan ?? null);

  // Same composed type ∧ plan resolution (and same null-plan fail-open rule)
  // as FeatureGate — see the comment there for why null fails open.
  const effectiveFeatures = getEffectiveFeatures(membership.communityType, planId);

  const allowed = features.some((f) => effectiveFeatures[f] === true);
  if (allowed) {
    return <>{children}</>;
  }

  if (getLockedFeatureBehavior(membership.role, membership.isUnitOwner) === 'hidden') {
    redirect(`/dashboard?communityId=${membership.communityId}`);
  }

  // Safe: we asserted features.length > 0 above.
  const headlineFeature = features[0]!;

  return (
    <LockedFeatureScreen
      featureKey={headlineFeature}
      role={membership.role}
      communityType={membership.communityType}
      isUnitOwner={membership.isUnitOwner}
      currentPlanId={planId}
      currentPlanRaw={membership.subscriptionPlan ?? null}
      communityId={membership.communityId}
    />
  );
}

export default FeatureGateAnyOf;
