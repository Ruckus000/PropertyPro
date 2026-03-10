import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { checkPermission } from '@propertypro/shared';
import { EsignDashboard } from './EsignDashboard';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EsignPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  if (!checkPermission(membership.role, membership.communityType, 'esign', 'read')) {
    redirect(`/dashboard?communityId=${communityId}`);
  }

  const canWrite = checkPermission(
    membership.role,
    membership.communityType,
    'esign',
    'write',
  );

  return (
    <EsignDashboard
      communityId={communityId}
      userId={userId}
      userRole={membership.role}
      canWrite={canWrite}
    />
  );
}
