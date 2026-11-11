/**
 * PM Portfolio Dashboard — Communities List (P3-45)
 *
 * Server-rendered page that gates on PM role, then renders the client-side
 * dashboard which orchestrates KPI cards, data table, and bulk actions.
 */
import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { isPmAdminInAnyCommunity } from '@/lib/api/pm-communities';
import { userHasPortfolioTemplatesAccess } from '@/lib/services/site-portfolio-template-service';
import { PmDashboardClient } from '@/components/pm/PmDashboardClient';
import { redirectIfSupportSession } from '@/lib/support/support-scope';

export default async function PmCommunitiesPage() {
  const userId = await requireAuthenticatedUserId();

  // Portfolio aggregate: spans every community the user manages, but a support
  // session is consented for ONE. Refused the same way as a non-PM (the
  // /api/v1/pm/* data behind it refuses too, in requirePmPortfolioAccess).
  await redirectIfSupportSession();

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    redirect('/dashboard');
  }

  // Templates is a plan feature: link to it only for people who have it.
  const showTemplates = await userHasPortfolioTemplatesAccess(userId);

  return <PmDashboardClient showTemplates={showTemplates} />;
}
