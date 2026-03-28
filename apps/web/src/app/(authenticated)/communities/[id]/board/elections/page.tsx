import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { requireElectionsEnabled, requireElectionsReadPermission } from '@/lib/elections/common';
import { BoardElectionsPanel } from '@/components/board/board-elections-panel';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoardElectionsPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);
  const userId = await requirePageAuthenticatedUserId();
  const membership = await requirePageCommunityMembership(communityId, userId);

  requireElectionsEnabled(membership);
  requireElectionsReadPermission(membership);

  return <BoardElectionsPanel communityId={communityId} isAdmin={membership.isAdmin} userId={userId} />;
}
