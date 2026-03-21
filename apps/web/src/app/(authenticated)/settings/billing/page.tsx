import React from 'react';
import { headers } from 'next/headers';
import { communities, createScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { BillingPageClient } from '@/components/settings/billing-page-client';

/**
 * Settings → Billing page (B-02/B-03/B-04).
 *
 * Server component that reads community billing fields and passes
 * them to the client component for display. Admin-only — all community
 * members can view their plan, but only admins see the full billing card.
 */
export default async function BillingPage({
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
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold">Billing</h1>
        <p className="text-sm text-content-secondary">
          Provide a communityId to view billing information.
        </p>
      </>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);

  // Fetch billing fields from the community row
  const scoped = createScopedClient(context.communityId);
  const rows = await scoped.selectFrom(
    communities,
    {},
    eq(communities.id, context.communityId),
  );
  const community = rows[0] as Record<string, unknown> | undefined;

  const billingData = {
    communityId: context.communityId,
    communityName: membership.communityName,
    subscriptionPlan: (community?.['subscriptionPlan'] as string) ?? null,
    subscriptionStatus: (community?.['subscriptionStatus'] as string) ?? null,
    stripeCustomerId: (community?.['stripeCustomerId'] as string) ?? null,
    paymentFailedAt: community?.['paymentFailedAt']
      ? new Date(community['paymentFailedAt'] as string).toISOString()
      : null,
    isAdmin: membership.isAdmin,
  };

  return <BillingPageClient {...billingData} />;
}
