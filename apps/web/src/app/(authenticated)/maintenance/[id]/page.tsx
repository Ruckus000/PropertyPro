// breadcrumbs:exempt — redirect-only page
/**
 * Legacy maintenance request detail route. There is no per-request detail
 * page anymore — requests live in the Operations hub. Notification emails
 * and in-app notifications historically deep-linked to /maintenance/[id],
 * so this shim forwards those links to Operations (Requests tab).
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { buildLegacyRedirectParams } from '@/lib/operations/routes';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

export default async function LegacyMaintenanceRequestPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const communityId = Number(query['communityId']);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  // Mirror the sibling inbox/page.tsx shim: preserve any Operations-supported
  // filter params (status, priority, unitId, q) that ride along on the link.
  const passthrough = buildLegacyRedirectParams(query as Record<string, string | string[] | undefined>);
  passthrough.set('tab', 'requests');
  passthrough.set('from', 'maintenance');

  redirect(`/communities/${communityId}/operations?${passthrough.toString()}`);
}
