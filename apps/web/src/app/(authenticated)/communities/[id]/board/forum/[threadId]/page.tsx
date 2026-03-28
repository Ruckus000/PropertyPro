import { ForumThreadDetail } from '@/components/board/forum/forum-thread-detail';
import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { requireCommunityBoardEnabled, requirePollReadPermission } from '@/lib/polls/common';

interface PageProps {
  params: Promise<{ id: string; threadId: string }>;
}

export default async function ForumThreadPage({ params }: PageProps) {
  const { id, threadId } = await params;
  const communityId = Number(id);
  const parsedThreadId = Number(threadId);
  const userId = await requirePageAuthenticatedUserId();
  const membership = await requirePageCommunityMembership(communityId, userId);

  requireCommunityBoardEnabled(membership);
  requirePollReadPermission(membership);

  return (
    <ForumThreadDetail
      communityId={communityId}
      threadId={parsedThreadId}
      isAdmin={membership.isAdmin}
      userId={userId}
    />
  );
}
