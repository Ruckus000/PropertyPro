import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { MeetingsPageShell } from '@/components/meetings/meetings-page-shell';
import { PageHeader } from '@/components/shared/page-header';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MeetingsPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Meetings" />
        <p className="mt-2 text-sm text-[var(--status-danger)]">Invalid community ID.</p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'meetings', 'read');

  const canWrite = checkPermissionV2(
    membership.role,
    membership.communityType,
    'meetings',
    'write',
    {
      isUnitOwner: membership.isUnitOwner,
    },
  );

  return (
    <MeetingsPageShell
      communityId={communityId}
      userId={userId}
      role={membership.role}
      timezone={membership.timezone}
      communityType={membership.communityType}
      canWrite={canWrite}
    />
  );
}
