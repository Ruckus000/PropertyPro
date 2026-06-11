// breadcrumbs:exempt — redirect-only page
/**
 * Legacy maintenance request detail route. There is no per-request detail
 * page anymore — requests live in the Operations hub. Notification emails
 * and in-app notifications historically deep-linked to /maintenance/[id],
 * so this shim forwards those links to Operations (Requests tab).
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { operationsHubHref } from '@/lib/operations/routes';

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

  redirect(operationsHubHref(communityId, 'requests', { from: 'maintenance' }));
}
