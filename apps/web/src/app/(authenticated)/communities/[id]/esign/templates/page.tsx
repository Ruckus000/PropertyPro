import { redirect } from 'next/navigation';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { checkPermission } from '@propertypro/shared';
import { EsignTemplateList } from './EsignTemplateList';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EsignTemplatesPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  if (!checkPermission(membership.role, membership.communityType, 'esign', 'write')) {
    redirect(`/communities/${communityId}/esign?communityId=${communityId}`);
  }

  return (
    <EsignTemplateList communityId={communityId} userId={userId} />
  );
}
