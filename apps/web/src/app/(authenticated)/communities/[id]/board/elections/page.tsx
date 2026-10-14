import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';
import { BoardElectionsPanel } from '@/components/board/board-elections-panel';
import { canActAsBoard, requirePermission } from '@/lib/db/access-control';
import { getEffectiveFeaturesForPage } from '@/lib/middleware/plan-guard';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BoardElectionsPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);
  const userId = await requirePageAuthenticatedUserId();
  const membership = await requirePageCommunityMembership(communityId, userId);

  // Type AND plan: `hasVoting` is Professional-only, the same check the API's
  // requireElectionsEnabled makes.
  const features = await getEffectiveFeaturesForPage(communityId, membership.communityType);

  // Apartments have the Board (polls and forums), but never the statutory
  // election feature, and a condo below Professional does not have it either.
  // Send a stale/direct election URL to the Board's real entry point instead
  // of implying attorney review could enable it.
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

  return (
    <BoardElectionsPanel
      communityId={communityId}
      isAdmin={membership.isAdmin}
      canAdminister={canActAsBoard(membership)}
      userId={userId}
    />
  );
}
