/**
 * E-Sign Templates List — displays all e-sign templates for the community.
 *
 * Route: /esign/templates?communityId=X
 * Auth: community member with esign read access.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { EsignTemplatesListClient } from './templates-list-client';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EsignTemplatesPage({ searchParams }: PageProps) {
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
          E-Sign Templates
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Add a valid{' '}
          <code className="rounded bg-[var(--surface-subtle)] px-1">
            communityId
          </code>{' '}
          query parameter to view templates.
        </p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(context.communityId, userId);

  return <EsignTemplatesListClient communityId={context.communityId} />;
}
