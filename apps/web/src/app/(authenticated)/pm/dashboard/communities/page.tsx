/**
 * PM Portfolio Dashboard — Communities List (P3-45)
 *
 * Server-rendered page that gates on PM role, then renders the client-side
 * dashboard which orchestrates KPI cards, data table, and bulk actions.
 */
import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { isPmAdminInAnyCommunity } from '@/lib/api/pm-communities';
import { PmDashboardClient } from '@/components/pm/PmDashboardClient';
import { getPageSupportScope } from '@/lib/support/support-scope';

export default async function PmCommunitiesPage() {
  const userId = await requireAuthenticatedUserId();

  // Portfolio aggregate: spans every community the user manages, but a support
  // session is consented for ONE. Refused the same way as a non-PM (the
  // /api/v1/pm/* data behind it refuses too, in requirePmPortfolioAccess).
  if (await getPageSupportScope()) {
    redirect('/dashboard');
  }

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    redirect('/dashboard');
  }

  return <PmDashboardClient />;
}
