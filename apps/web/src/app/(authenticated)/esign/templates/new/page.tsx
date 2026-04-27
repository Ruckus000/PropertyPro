// breadcrumbs:exempt — delegated to apps/web/src/app/(authenticated)/esign/templates/new/template-builder-client.tsx
/**
 * New E-Sign Template — two-phase template builder.
 *
 * Phase 1 (Setup): name, type, description, PDF upload, signer roles.
 * Phase 2 (Editor): PDF viewer + field palette + field overlay.
 *
 * Route: /esign/templates/new?communityId=X
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
import { TemplateBuilderClient } from './template-builder-client';

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

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          New Template
        </h1>
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
      <TemplateBuilderClient communityId={context.communityId} />
    </FeatureGate>
  );
}
