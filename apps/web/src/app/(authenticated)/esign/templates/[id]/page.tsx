/**
 * E-Sign Template Detail — read-only preview with field overlay.
 *
 * Route: /esign/templates/:id?communityId=X
 * Auth: community member with esign read access.
 */
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
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
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          Template Detail
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Invalid template ID or missing community context.
        </p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(context.communityId, userId);

  return (
    <TemplateDetailClient
      communityId={context.communityId}
      templateId={templateId}
    />
  );
}
