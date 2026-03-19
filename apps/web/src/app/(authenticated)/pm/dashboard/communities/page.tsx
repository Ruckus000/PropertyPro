/**
 * PM Portfolio Dashboard — Communities List (P3-45)
 *
 * Server-rendered page that gates on PM role, then renders the client-side
 * dashboard which orchestrates KPI cards, data table, and bulk actions.
 */
import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { isPmAdminInAnyCommunity } from '@/lib/api/pm-communities';
import { PmDashboardClient } from '@/components/pm/PmDashboardClient';

export default async function PmCommunitiesPage() {
  const userId = await requireAuthenticatedUserId();

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    redirect('/dashboard');
  }

  return <PmDashboardClient />;
}
