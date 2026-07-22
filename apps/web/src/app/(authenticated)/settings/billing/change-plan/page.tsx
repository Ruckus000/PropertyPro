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
 * Lets an existing paid subscriber switch tier or billing interval. Tier
 * downgrades and cancellation stay on the Stripe Customer Portal — this
 * page only renders upgrade options.
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

  // Without an active subscription, the user has no plan to switch from —
  // bounce back to /settings/billing where they'll see appropriate copy.
  if (!stripeSubscriptionId || subscriptionStatus !== 'active' || !communityType) {
    redirect(`/settings/billing?communityId=${context.communityId}`);
  }

  const currentInterval = await getActiveSubscriptionInterval(stripeSubscriptionId).catch(
    () => null,
  );

  const plans = getSignupPlansForCommunityType(
    communityType as 'condo_718' | 'hoa_720' | 'apartment',
  );

  const billingHref = `/settings/billing?communityId=${context.communityId}`;

  return (
    <div>
      <PageHeader
        title="Change plan"
        description={`Update the plan or billing interval for ${membership.communityName}.`}
      />

      <ChangePlanForm
        communityId={context.communityId}
        currentPlan={currentPlan as PlanId | null}
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
