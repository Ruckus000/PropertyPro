import { BoardPollsPanel } from '@/components/board/board-polls-panel';
import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { requirePollReadPermission, requirePollsEnabled } from '@/lib/polls/common';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoardPollsPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);
  const userId = await requirePageAuthenticatedUserId();
  const membership = await requirePageCommunityMembership(communityId, userId);

  requirePollsEnabled(membership);
  requirePollReadPermission(membership);

  return <BoardPollsPanel communityId={communityId} isAdmin={membership.isAdmin} />;
}
