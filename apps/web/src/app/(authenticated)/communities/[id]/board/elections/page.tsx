import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { requireElectionsEnabled } from '@/lib/elections/common';
import { BoardElectionsPanel } from '@/components/board/board-elections-panel';
import { requirePermission } from '@/lib/db/access-control';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoardElectionsPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);
  const userId = await requirePageAuthenticatedUserId();
  const membership = await requirePageCommunityMembership(communityId, userId);

  requireElectionsEnabled(membership);
  requirePermission(membership, 'elections', 'read');

  return <BoardElectionsPanel communityId={communityId} isAdmin={membership.isAdmin} userId={userId} />;
}
