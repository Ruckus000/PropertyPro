// breadcrumbs:exempt — redirect-only page
/**
 * The submissions list is the E-Sign screen's Requests view.
 *
 * This route rendered a second copy of the same list under its own
 * `PageHeader`, and nothing in the app linked to it. It stays as a redirect
 * rather than being deleted because `build-auto-trail` emits a linked crumb for
 * every path segment, so `/esign/submissions/[id]` and `/esign/submissions/new`
 * both render a "Submissions" crumb pointing here.
 *
 * Route: /esign/submissions?communityId=X  →  /esign?view=requests&communityId=X
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EsignSubmissionsPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    redirect('/dashboard?reason=invalid-selection');
  }

  redirect(`/esign?view=requests&communityId=${context.communityId}`);
}
