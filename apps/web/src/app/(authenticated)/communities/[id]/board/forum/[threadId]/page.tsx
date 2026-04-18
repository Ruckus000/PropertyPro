import { ForumThreadDetail } from '@/components/board/forum/forum-thread-detail';
import { checkPermissionV2 } from '@/lib/db/access-control';
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
  const canModerateReplies = membership.isAdmin && checkPermissionV2(
    membership.role,
    membership.communityType,
    'polls',
    'write',
    {
      isUnitOwner: membership.isUnitOwner,
      permissions: membership.permissions,
    },
  );

  return (
    <ForumThreadDetail
      communityId={communityId}
      threadId={parsedThreadId}
      isAdmin={membership.isAdmin}
      canModerateReplies={canModerateReplies}
    />
  );
}
