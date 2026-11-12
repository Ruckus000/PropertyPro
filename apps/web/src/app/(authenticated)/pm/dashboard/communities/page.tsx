/**
 * PM Portfolio Dashboard — Communities List (P3-45)
 *
 * Server-rendered page that gates on PM role, then renders the client-side
 * dashboard (layout by portfolio size, status, bulk send).
 *
 * Someone who manages exactly one community has nothing to choose between, so
 * they go straight to that community's dashboard. They stay here when:
 *   - the URL carries `?reason=` (another page sent them here with a message)
 *     or `?added_session_id=` (they are back from an Add Community checkout,
 *     and this page shows the confirmation);
 *   - an Add Community checkout is still open or being set up, so a second
 *     community is on its way.
 */
import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import {
  findSoleManagedCommunityId,
  hasOpenAddCommunityCheckout,
  isPmAdminInAnyCommunity,
} from '@/lib/api/pm-communities';
import { resolvePmDashboardTarget } from '@/lib/api/community-context';
import { userHasPortfolioTemplatesAccess } from '@/lib/services/site-portfolio-template-service';
import { PmDashboardClient } from '@/components/pm/PmDashboardClient';
import { redirectIfSupportSession } from '@/lib/support/support-scope';

interface PmCommunitiesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PmCommunitiesPage({ searchParams }: PmCommunitiesPageProps) {
  const userId = await requireAuthenticatedUserId();

  // Portfolio aggregate: spans every community the user manages, but a support
  // session is consented for ONE. Refused the same way as a non-PM (the
  // /api/v1/pm/* data behind it refuses too, in requirePmPortfolioAccess).
  await redirectIfSupportSession();

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const carriesMessage = params.reason !== undefined || params.added_session_id !== undefined;
  if (!carriesMessage) {
    const [soleCommunityId, checkoutOpen] = await Promise.all([
      findSoleManagedCommunityId(userId),
      hasOpenAddCommunityCheckout(userId),
    ]);
    if (soleCommunityId !== null && !checkoutOpen) {
      // A path on this host, checked for a management role like any other
      // community switch. Null (a role removed mid-request) falls through to
      // the page, which never redirects back here.
      const target = await resolvePmDashboardTarget(userId, soleCommunityId);
      if (target) redirect(target);
    }
  }

  // Templates is a plan feature: link to it only for people who have it.
  const showTemplates = await userHasPortfolioTemplatesAccess(userId);

  return <PmDashboardClient showTemplates={showTemplates} />;
}
