/**
 * FeatureGate — server-side wrapper for plan-gated route pages.
 *
 * - Allowed → renders children unchanged.
 * - Tenants on a denied feature → redirected to the dashboard. They never see
 *   the marketing surface; they can't act on it anyway.
 * - Everyone else on a denied feature → renders <LockedFeatureScreen> so the
 *   page tells the user what's gated and how to act.
 *
 * Type-gated features (community type doesn't support them at all) are NOT
 * the responsibility of this gate — the sidebar already hides them and a
 * direct URL is treated like the type-gated check is implicit.
 *
 * Usage in a route page:
 *
 *   export default async function ViolationsInboxPage() {
 *     return (
 *       <FeatureGate feature="hasViolations">
 *         <ActualPage />
 *       </FeatureGate>
 *     );
 *   }
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

export interface FeatureGateProps {
  feature: keyof CommunityFeatures;
  /** Optional override for the resolved community ID (bypasses header resolution). */
  communityId?: number;
  children: React.ReactNode;
}

export async function FeatureGate({
  feature,
  communityId: communityIdOverride,
  children,
}: FeatureGateProps) {
  // requirePageCommunityMembership reads tenant context from forwarded
  // request headers (set by middleware) when no communityId is passed.
  const membership = await requirePageCommunityMembership(communityIdOverride);
  const role = inferCanonicalRoleFromMembership({
    role: membership.role,
    isUnitOwner: membership.isUnitOwner,
    designation: membership.designation ?? null,
  });
  const planId = resolvePlanId(membership.subscriptionPlan ?? null);

  // Allowed if the resolved plan unlocks this feature.
  const planConfig = planId ? PLAN_FEATURES[planId] : null;
  const allowed = planConfig?.features[feature] === true;

  if (allowed) {
    return <>{children}</>;
  }

  if (getLockedFeatureBehavior(role) === 'hidden') {
    redirect(`/dashboard?communityId=${membership.communityId}`);
  }

  return (
    <LockedFeatureScreen
      featureKey={feature}
      role={role}
      currentPlanId={planId}
      currentPlanRaw={membership.subscriptionPlan ?? null}
      communityId={membership.communityId}
    />
  );
}

export default FeatureGate;
