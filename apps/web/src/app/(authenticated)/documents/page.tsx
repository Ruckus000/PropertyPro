import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';

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
    redirect(`/communities/${context.communityId}/documents`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
      <p className="mt-2 text-sm text-gray-600">
        Add a valid <code className="rounded bg-gray-100 px-1">communityId</code> query parameter to view your community documents.
      </p>
    </div>
  );
}
