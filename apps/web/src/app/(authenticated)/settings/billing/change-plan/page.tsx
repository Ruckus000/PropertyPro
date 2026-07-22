import React from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { communities, createScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import {
  PLANS_BY_COMMUNITY_TYPE,
  canStartNewSubscription,
  resolvePlanId,
  type CommunityType,
  type PlanId,
} from '@propertypro/shared';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getActiveSubscriptionInterval } from '@/lib/services/stripe-service';
import { getSignupPlansForCommunityType } from '@/lib/auth/signup-schema';
import { PageHeader } from '@/components/shared/page-header';
import { ChangePlanForm } from '@/components/settings/change-plan-form';

/**
 * Settings → Billing → Change plan.
 *
 * Two modes, both admin-only:
 *
 *   - `change` — an existing paid subscriber switches tier or billing
 *     interval via `/api/v1/subscribe/change-plan`. Downgrades and
 *     cancellation stay on the Stripe Customer Portal.
 *   - `new` — a community with no active subscription (never provisioned, or
 *     canceled, which nulls `subscriptionPlan`) picks a plan and is handed off
 *     to Stripe Checkout via `/api/v1/subscribe`.
 *
 * The `new` mode exists because this page previously redirected any community
 * without an active subscription straight back to /settings/billing, which had
 * no purchase CTA — so the "Upgrade now" button was an inescapable loop and no
 * one could ever subscribe (or re-subscribe) from inside the app.
 */
export default async function ChangePlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    redirect('/settings/billing');
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);

  if (!membership.isAdmin) {
    redirect('/settings/billing');
  }

  const scoped = createScopedClient(context.communityId);
  const rows = await scoped.selectFrom(
    communities,
    {},
    eq(communities.id, context.communityId),
  );
  const community = rows[0] as Record<string, unknown> | undefined;
  const subscriptionStatus = (community?.['subscriptionStatus'] as string) ?? null;
  const stripeSubscriptionId = (community?.['stripeSubscriptionId'] as string) ?? null;
  const communityType = (community?.['communityType'] as string) ?? null;
  const stripeCustomerId = (community?.['stripeCustomerId'] as string) ?? null;
  const currentPlan = resolvePlanId((community?.['subscriptionPlan'] as string) ?? null);

  // Without a RECOGNIZED community type we can't resolve a plan ladder or a
  // Stripe price — bounce back to billing. Checking membership in the ladder
  // map rather than mere truthiness: an unmapped string would otherwise pass
  // this guard, make getSignupPlansForCommunityType return undefined, and 500
  // on `plans.map` below.
  if (!communityType || !(communityType in PLANS_BY_COMMUNITY_TYPE)) {
    redirect(`/settings/billing?communityId=${context.communityId}`);
  }

  // Mode selection MUST use the same predicate the API enforces, or the page
  // offers a flow the route will reject (or worse, one it will accept and
  // duplicate-bill for). `trialing` is the case that matters: every signup
  // spends its first 30 days there with a live subscription.
  const lifecycle = { stripeSubscriptionId, subscriptionStatus };
  const hasLiveSubscription = !canStartNewSubscription(lifecycle);

  // Only meaningful in `change` mode; a new subscriber has no interval yet.
  const currentInterval = stripeSubscriptionId
    ? await getActiveSubscriptionInterval(stripeSubscriptionId).catch(() => null)
    : null;

  const plans = getSignupPlansForCommunityType(communityType as CommunityType);

  const billingHref = `/settings/billing?communityId=${context.communityId}`;

  return (
    <div>
      <PageHeader
        title={hasLiveSubscription ? 'Change plan' : 'Choose a plan'}
        description={
          hasLiveSubscription
            ? `Update the plan or billing interval for ${membership.communityName}.`
            : `Pick a plan to activate ${membership.communityName}.`
        }
      />

      <ChangePlanForm
        mode={hasLiveSubscription ? 'change' : 'new'}
        // A re-subscribe (Stripe customer already on file) rebinds billing
        // identity, so POST /api/v1/subscribe demands a fresh reauth for it.
        // Prompt in the UI to match, or the request 401s after the user has
        // already picked a plan.
        requiresReauth={Boolean(stripeCustomerId)}
        communityId={context.communityId}
        currentPlan={hasLiveSubscription ? (currentPlan as PlanId | null) : null}
        currentInterval={currentInterval}
        plans={plans.map((p) => ({
          id: p.id,
          label: p.label,
          monthlyPriceUsd: p.monthlyPriceUsd,
          description: p.description,
        }))}
        cancelHref={billingHref}
      />
    </div>
  );
}
