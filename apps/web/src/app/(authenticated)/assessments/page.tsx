import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Compatibility redirect: /assessments?communityId=X -> /communities/X/assessments
 */
export default async function AssessmentsRedirectPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (context.communityId) {
    redirect(`/communities/${context.communityId}/assessments`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Assessments</h1>
      <p className="mt-2 text-sm text-gray-600">
        Add a valid <code className="rounded bg-gray-100 px-1">communityId</code> query parameter to manage assessments.
      </p>
    </div>
  );
}
