import { BoardForumPanel } from '@/components/board/board-forum-panel';
import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { requireCommunityBoardEnabled, requirePollReadPermission } from '@/lib/polls/common';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoardForumPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);
  const userId = await requirePageAuthenticatedUserId();
  const membership = await requirePageCommunityMembership(communityId, userId);

  requireCommunityBoardEnabled(membership);
  requirePollReadPermission(membership);

  return <BoardForumPanel communityId={communityId} />;
}
