// breadcrumbs:exempt — delegated to apps/web/src/components/esign/builder/esign-builder.tsx
/**
 * New e-sign template — the four-step builder in template mode.
 *
 * Document → Signer roles → Place fields → Save template.
 *
 * Route: /esign/templates/new?communityId=X
 * Auth: community member with esign write access.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { resolvePageCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { FeatureGate } from '@/components/billing/feature-gate';
import { PageHeader } from '@/components/shared/page-header';
import { EsignBuilder } from '@/components/esign/builder/esign-builder';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewEsignTemplatePage({
  searchParams,
}: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolvePageCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    headers: requestHeaders,
  });

  if (!context.communityId) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="New Template" />
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Add a valid{' '}
          <code className="rounded bg-[var(--surface-subtle)] px-1">
            communityId
          </code>{' '}
          query parameter to create a template.
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
      <EsignBuilder communityId={context.communityId} mode="template" />
    </FeatureGate>
  );
}
