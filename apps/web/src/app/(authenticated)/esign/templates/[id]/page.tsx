// breadcrumbs:exempt — delegated to apps/web/src/app/(authenticated)/esign/templates/[id]/template-detail-client.tsx
/**
 * E-Sign Template Detail — read-only preview with field overlay.
 *
 * Route: /esign/templates/:id?communityId=X
 * Auth: community member with esign read access.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { FeatureGate } from '@/components/billing/feature-gate';
import { PageHeader } from '@/components/shared/page-header';
import { TemplateDetailClient } from './template-detail-client';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EsignTemplateDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [resolvedParams, resolvedSearchParams, requestHeaders] =
    await Promise.all([params, searchParams, headers()]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  const templateId = parseInt(resolvedParams.id, 10);

  if (!context.communityId || isNaN(templateId)) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Template Detail" />
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

  return (
    <FeatureGate feature="hasEsign" communityId={context.communityId}>
      <TemplateDetailClient
        communityId={context.communityId}
        templateId={templateId}
      />
    </FeatureGate>
  );
}
