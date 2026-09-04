// breadcrumbs:exempt — redirect-only page
/**
 * Templates is now a view of the E-Sign screen, not a route of its own.
 *
 * The route still has to resolve rather than being deleted: `build-auto-trail`
 * emits a linked crumb for every path segment, so `/esign/templates/[id]` and
 * `/esign/templates/new` both render a "Templates" crumb pointing here. It also
 * keeps every existing bookmark and link working.
 *
 * Route: /esign/templates?communityId=X  →  /esign?view=templates&communityId=X
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveCommunityContext } from '@/lib/tenant/resolve-community-context';
import { toUrlSearchParams } from '@/lib/tenant/community-resolution';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EsignTemplatesPage({ searchParams }: PageProps) {
  const [resolvedSearchParams, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  // Kept rather than reading the query directly, so a tenant subdomain that
  // carries no `?communityId=` still resolves to the right community.
  const context = resolveCommunityContext({
    searchParams: toUrlSearchParams(resolvedSearchParams),
    host: requestHeaders.get('host'),
  });

  if (!context.communityId) {
    redirect('/dashboard?reason=invalid-selection');
  }

  redirect(`/esign?view=templates&communityId=${context.communityId}`);
}
