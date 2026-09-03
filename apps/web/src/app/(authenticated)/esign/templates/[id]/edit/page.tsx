// breadcrumbs:exempt — delegated to apps/web/src/components/esign/builder/esign-builder.tsx
/**
 * Edit an e-sign template's field layout.
 *
 * The same builder, seeded from the stored template and opening on the fields
 * step, because the document and the roles already exist and the layout is
 * what an edit is for.
 *
 * Editing is safe now in a way it was not before migration 0063: a request
 * captures the layout it was sent with, so changing a template no longer
 * changes the document under the people already signing it. That is why this
 * route exists again — #1020 removed the Edit Fields button rather than ship a
 * destination that would have rewritten in-flight requests.
 *
 * Route: /esign/templates/[id]/edit?communityId=X
 * Auth: community member with esign write access.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { FeatureGate } from '@/components/billing/feature-gate';
import { EsignBuilder } from '@/components/esign/builder/esign-builder';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EditEsignTemplatePage({ params, searchParams }: PageProps) {
  const [resolvedParams, resolvedSearchParams, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);

  const templateId = Number.parseInt(resolvedParams.id, 10);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId || !Number.isInteger(templateId) || templateId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(context.communityId, userId);

  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasEsign) {
    redirect('/dashboard?reason=feature-not-available');
  }

  return (
    <FeatureGate feature="hasEsign" communityId={context.communityId}>
      <EsignBuilder
        communityId={context.communityId}
        mode="template"
        templateId={templateId}
        isEdit
      />
    </FeatureGate>
  );
}
