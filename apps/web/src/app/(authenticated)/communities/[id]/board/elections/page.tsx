import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
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

  const features = getFeaturesForCommunity(membership.communityType);

  // Apartments have the Board (polls and forums), but never the statutory
  // election feature. Send a stale/direct election URL to the Board's real
  // entry point instead of implying attorney review could enable it.
  if (!features.hasVoting) {
    redirect(`/communities/${communityId}/board/polls`);
  }

  if (!membership.electionsAttorneyReviewed) {
    return (
      <section className="max-w-2xl rounded-md border border-edge bg-surface-card">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-content">
            Attorney review required before elections
          </h2>
          <p className="mt-2 text-sm text-content-secondary">
            Elections will appear after attorney review is complete. Polls and forum discussions are
            available now.
          </p>
          <Link
            href={`/communities/${communityId}/board/polls`}
            className="mt-4 inline-flex rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Go to polls
          </Link>
        </div>
      </section>
    );
  }

  requirePermission(membership, 'elections', 'read');

  return <BoardElectionsPanel communityId={communityId} isAdmin={membership.isAdmin} userId={userId} />;
}
