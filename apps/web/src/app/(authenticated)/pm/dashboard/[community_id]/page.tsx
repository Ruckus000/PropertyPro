/**
 * PM Community Context Switch — P3-46
 *
 * Server-side redirect page for PM community selection.
 * - Validates communityId is a positive integer
 * - Verifies PM membership server-side via resolvePmDashboardTarget
 * - Redirects to the appropriate dashboard (apartment or generic) when valid
 * - Redirects to /pm/dashboard/communities?reason=invalid-selection when null
 *   (missing community, revoked access, non-PM role — no data leakage)
 */
import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { resolvePmDashboardTarget } from '@/lib/api/community-context';

interface PmCommunityPageProps {
  params: Promise<{ community_id: string }>;
}

export default async function PmCommunityPage({ params }: PmCommunityPageProps) {
  const [userId, resolvedParams] = await Promise.all([
    requireAuthenticatedUserId(),
    params,
  ]);

  const communityId = parseInt(resolvedParams.community_id, 10);

  const target = await resolvePmDashboardTarget(userId, communityId);

  if (!target) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  redirect(target);
}
