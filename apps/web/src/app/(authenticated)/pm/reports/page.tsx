/**
 * PM Reports Page — Cross-portfolio analytics
 *
 * Server component that gates on PM role, fetches the community list
 * for the filter dropdown, then renders the PmReportsClient.
 */
import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { isPmAdminInAnyCommunity, listManagedCommunitiesForPm } from '@/lib/api/pm-communities';
import { PmReportsClient } from '@/components/pm/reports/PmReportsClient';

export default async function PmReportsPage() {
  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    redirect('/dashboard');
  }

  const communities = await listManagedCommunitiesForPm(userId);

  const communityOptions = communities.map((c) => ({
    communityId: c.communityId,
    communityName: c.communityName,
  }));

  return <PmReportsClient communities={communityOptions} />;
}
