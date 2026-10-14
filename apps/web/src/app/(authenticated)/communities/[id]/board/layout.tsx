import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { BoardChrome } from '@/components/board/board-chrome';
import { FeatureGate } from '@/components/billing/feature-gate';
import { requireCommunityBoardEnabled } from '@/lib/polls/common';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';

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
  // Plan-aware, so the Elections tab is hidden where the API would 403.
  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);

  return (
    <FeatureGate feature="hasCommunityBoard" communityId={communityId}>
      <BoardChrome
        communityId={communityId}
        communityName={membership.communityName}
        electionsEnabled={features.hasVoting && membership.electionsAttorneyReviewed}
      >
        {children}
      </BoardChrome>
    </FeatureGate>
  );
}
