// breadcrumbs:exempt — redirect-only page
/**
 * PM Community Context Switch — P3-46
 *
 * Server-side redirect page for PM community selection.
 * - Validates communityId is a positive integer
 * - Verifies PM membership server-side via resolvePmDashboardTarget
 * - Redirects to the appropriate dashboard (apartment or generic) when valid
 * - Redirects to /pm/dashboard/communities?reason=invalid-selection when null
 *   (missing community, revoked access, non-PM role — no data leakage)
 * - Under a support session, redirects to /dashboard for any community but
 *   the consented one
 */
import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { resolvePmDashboardTarget } from '@/lib/api/community-context';
import { getPageSupportScope } from '@/lib/support/support-scope';

interface PmCommunityPageProps {
  params: Promise<{ community_id: string }>;
}

export default async function PmCommunityPage({ params }: PmCommunityPageProps) {
  const [userId, resolvedParams] = await Promise.all([
    requireAuthenticatedUserId(),
    params,
  ]);

  const communityId = parseInt(resolvedParams.community_id, 10);

  // Per-community, but the id is a path segment middleware does not read, so a
  // support session could otherwise be steered at a community outside its
  // grant. Anything but the consented community goes straight to /dashboard:
  // the usual invalid-selection landing is /pm/dashboard/communities, a
  // portfolio page that would only redirect a support session again.
  const supportScope = await getPageSupportScope();
  if (supportScope && supportScope.communityId !== communityId) {
    redirect('/dashboard');
  }

  const target = await resolvePmDashboardTarget(userId, communityId);

  if (!target) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  redirect(target);
}
