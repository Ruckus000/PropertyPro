// breadcrumbs:exempt — delegated to apps/web/src/app/(authenticated)/esign/templates/[id]/edit/template-edit-client.tsx
/**
 * E-Sign Template Edit — change a template's details and field placements.
 *
 * Route: /esign/templates/:id/edit?communityId=X
 * Auth: community member with esign WRITE access.
 *
 * The sibling detail page checks no RBAC and leans entirely on the API
 * routes, which is defensible for a read screen. This one is a write screen,
 * so it also calls `requirePermission`. The API remains the real enforcement:
 * PATCH re-checks write permission, the plan feature and the demo-grace gate,
 * and refuses field changes while signatures are in flight.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { FeatureGate } from '@/components/billing/feature-gate';
import { PageHeader } from '@/components/shared/page-header';
import { TemplateEditClient } from './template-edit-client';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EsignTemplateEditPage({ params, searchParams }: PageProps) {
  const [resolvedParams, resolvedSearchParams, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  const templateId = parseInt(resolvedParams.id, 10);

  if (!context.communityId || isNaN(templateId)) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Edit Template" />
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Invalid template ID or missing community context.
        </p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);

  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasEsign) {
    redirect('/dashboard?reason=feature-not-available');
  }

  requirePermission(membership, 'esign', 'write');

  return (
    <FeatureGate feature="hasEsign" communityId={context.communityId}>
      <TemplateEditClient communityId={context.communityId} templateId={templateId} />
    </FeatureGate>
  );
}
