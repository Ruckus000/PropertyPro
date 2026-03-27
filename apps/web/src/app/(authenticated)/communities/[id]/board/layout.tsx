import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { BoardChrome } from '@/components/board/board-chrome';
import { requireCommunityBoardEnabled } from '@/lib/polls/common';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function BoardLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    return children;
  }

  const userId = await requirePageAuthenticatedUserId();
  const membership = await requirePageCommunityMembership(communityId, userId);
  requireCommunityBoardEnabled(membership);

  return (
    <BoardChrome
      communityId={communityId}
      communityName={membership.communityName}
      electionsEnabled={membership.electionsAttorneyReviewed}
    >
      {children}
    </BoardChrome>
  );
}
