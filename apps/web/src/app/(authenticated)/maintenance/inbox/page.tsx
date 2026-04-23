// breadcrumbs:exempt — redirect-only page
/**
 * Legacy admin inbox route. Redirects to Operations with filter params
 * preserved so admin bookmarks like ?status=new&priority=urgent continue
 * to land on the intended filter state.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { buildLegacyRedirectParams } from '@/lib/operations/routes';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function MaintenanceInboxPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number((params as Record<string, unknown>)['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  const passthrough = buildLegacyRedirectParams(params as Record<string, string | string[] | undefined>);
  passthrough.set('tab', 'requests');
  passthrough.set('from', 'maintenance');

  // TODO: wire to analytics service
  // eslint-disable-next-line no-console
  console.info('[analytics] operations_legacy_redirect', {
    source: 'inbox',
    hadFilters: Array.from(passthrough.keys()).some((k) =>
      ['status', 'priority', 'unitId', 'q'].includes(k),
    ),
  });

  redirect(`/communities/${rawId}/operations?${passthrough.toString()}`);
}
