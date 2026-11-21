// breadcrumbs:exempt — redirect-only page
/**
 * Legacy maintenance request detail route. There is no per-request detail
 * page — a request opens as a panel over the Operations hub (`?request=<id>`).
 * Notification emails and in-app notifications historically deep-linked to
 * /maintenance/[id], so this shim forwards those links to that panel.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { buildLegacyRedirectParams, operationsHubHref } from '@/lib/operations/routes';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}

export default async function LegacyMaintenanceRequestPage({ params, searchParams }: PageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const communityId = Number(query['communityId']);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  // A non-numeric id is dropped by operationsHubHref: the link lands on the list.
  const base = operationsHubHref(communityId, 'requests', { from: 'maintenance', request: Number(id) });
  // Mirror the sibling inbox/page.tsx shim: preserve any Operations-supported
  // filter params (status, priority, unitId, q) that ride along on the link.
  const passthrough = buildLegacyRedirectParams(query as Record<string, string | string[] | undefined>).toString();

  redirect(passthrough ? `${base}&${passthrough}` : base);
}
