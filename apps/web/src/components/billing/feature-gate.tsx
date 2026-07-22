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
  getEffectiveFeatures,
  resolvePlanId,
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
  const planId = resolvePlanId(membership.subscriptionPlan ?? null);

  // Compose community-TYPE features with PLAN features through the single
  // shared resolver, which also owns the null-plan rule: an unresolved plan
  // (never provisioned, or canceled — which nulls `subscriptionPlan`) fails
  // OPEN. That matches `plan-guard.ts` and `subscription-guard.ts`, which
  // already let those communities through at the API layer; gating them only
  // at the page meant the sidebar advertised features that rendered a locked
  // screen, and pushed users at an upgrade CTA instead of the app.
  const features = getEffectiveFeatures(membership.communityType, planId);
  const allowed = features[feature] === true;

  if (allowed) {
    return <>{children}</>;
  }

  if (getLockedFeatureBehavior(membership.role, membership.isUnitOwner) === 'hidden') {
    redirect(`/dashboard?communityId=${membership.communityId}`);
  }

  return (
    <LockedFeatureScreen
      featureKey={feature}
      role={membership.role}
      communityType={membership.communityType}
      isUnitOwner={membership.isUnitOwner}
      currentPlanId={planId}
      currentPlanRaw={membership.subscriptionPlan ?? null}
      communityId={membership.communityId}
    />
  );
}

export default FeatureGate;
