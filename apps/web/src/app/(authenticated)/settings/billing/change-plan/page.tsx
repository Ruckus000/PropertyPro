import React from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { communities, createScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { resolvePlanId, type PlanId } from '@propertypro/shared';
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
  const currentPlan = resolvePlanId((community?.['subscriptionPlan'] as string) ?? null);

  // Without a community type we can't resolve a plan ladder or a Stripe price
  // — nothing useful to render, so bounce back to billing.
  if (!communityType) {
    redirect(`/settings/billing?communityId=${context.communityId}`);
  }

  // Only meaningful in `change` mode; a new subscriber has no interval yet.
  // Narrowed inline (rather than via a hasActiveSubscription boolean) so
  // `stripeSubscriptionId` is provably non-null without an assertion.
  const currentInterval =
    stripeSubscriptionId && subscriptionStatus === 'active'
      ? await getActiveSubscriptionInterval(stripeSubscriptionId).catch(() => null)
      : null;

  const hasActiveSubscription =
    Boolean(stripeSubscriptionId) && subscriptionStatus === 'active';

  const plans = getSignupPlansForCommunityType(
    communityType as 'condo_718' | 'hoa_720' | 'apartment',
  );

  const billingHref = `/settings/billing?communityId=${context.communityId}`;

  return (
    <div>
      <PageHeader
        title={hasActiveSubscription ? 'Change plan' : 'Choose a plan'}
        description={
          hasActiveSubscription
            ? `Update the plan or billing interval for ${membership.communityName}.`
            : `Pick a plan to activate ${membership.communityName}.`
        }
      />

      <ChangePlanForm
        mode={hasActiveSubscription ? 'change' : 'new'}
        communityId={context.communityId}
        currentPlan={hasActiveSubscription ? (currentPlan as PlanId | null) : null}
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
