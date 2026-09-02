import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Compatibility redirect: /documents?communityId=X -> /communities/X/documents
 *
 * This page redirects from the legacy query-parameter-based URL to the new
 * canonical community-scoped route structure.
 */
export default async function DocumentsRedirectPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (context.communityId) {
    const q = resolvedSearchParams.q;
    const qParam = typeof q === 'string' && q ? `?q=${encodeURIComponent(q)}` : '';
    redirect(`/communities/${context.communityId}/documents${qParam}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Documents" />
      <p className="mt-2 text-sm text-content-secondary">
        Add a valid <code className="rounded bg-surface-muted px-1">communityId</code> query parameter to view your community documents.
      </p>
    </div>
  );
}
