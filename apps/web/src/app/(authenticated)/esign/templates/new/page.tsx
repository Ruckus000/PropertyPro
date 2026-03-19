/**
 * New E-Sign Template — two-phase template builder.
 *
 * Phase 1 (Setup): name, type, description, PDF upload, signer roles.
 * Phase 2 (Editor): PDF viewer + field palette + field overlay.
 *
 * Route: /esign/templates/new?communityId=X
 * Auth: community member with esign write access.
 */
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
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
  await requireCommunityMembership(context.communityId, userId);

  return <TemplateBuilderClient communityId={context.communityId} />;
}
