// breadcrumbs:exempt — redirect-only page
/**
 * Legacy route. Redirects to /communities/[id]/operations?tab=requests.
 * Preserves filter params via allowlist. Rollback via OPERATIONS_HUB_ROUTING=v1
 * is handled at the route-builder level; this page always redirects.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { buildLegacyRedirectParams } from '@/lib/operations/routes';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MaintenanceSubmitPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number((params as Record<string, unknown>)['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  const passthrough = buildLegacyRedirectParams(params as Record<string, string | string[] | undefined>);
  passthrough.set('tab', 'requests');
  passthrough.set('from', 'maintenance');

  redirect(`/communities/${rawId}/operations?${passthrough.toString()}`);
}
