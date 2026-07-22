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
  PLAN_FEATURES,
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

  // PLAN gating only — community-TYPE gating stays out of this gate by design
  // (see the header comment). Composing type features here would deny e.g. an
  // HOA on Professional at /dashboard/packages, which `hoa_720` doesn't have
  // as a type, and then offer them an "upgrade" to the plan they already own.
  //
  // An unresolved plan — null (never provisioned) or an unrecognized legacy
  // string — fails OPEN, matching `plan-guard.ts` and `subscription-guard.ts`,
  // which already let those communities through at the API layer. Failing
  // closed only at the page meant the sidebar advertised features whose pages
  // rendered a locked screen, pushing users at an upgrade CTA instead of the
  // app they were entitled to.
  const allowed = planId === null || PLAN_FEATURES[planId].features[feature] === true;

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
