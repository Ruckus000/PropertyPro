import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { getAuthorizedCommunityIds } from '@/lib/queries/cross-community';
import { OverviewClient } from './overview-client';

/**
 * /dashboard/overview
 *
 * Unified cross-community overview for users with roles in 2+ communities.
 * Users with 0 or 1 communities are redirected to the normal dashboard.
 */
export default async function OverviewPage() {
  const userId = await requireAuthenticatedUserId();
  const communityIds = await getAuthorizedCommunityIds(userId);

  if (communityIds.length < 2) {
    redirect('/dashboard');
  }

  return <OverviewClient />;
}
