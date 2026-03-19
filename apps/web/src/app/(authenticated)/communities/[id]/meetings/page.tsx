import { communities, createScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { MeetingsPageShell } from '@/components/meetings/meetings-page-shell';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MeetingsPage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Meetings</h1>
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
      permissions: membership.permissions,
    },
  );

  const scoped = createScopedClient(communityId);
  const communityRows = await scoped.selectFrom<{ slug: string }>(
    communities,
    { slug: communities.slug },
    eq(communities.id, communityId),
  );
  const communitySlug = communityRows[0]?.slug ?? '';

  return (
    <MeetingsPageShell
      communityId={communityId}
      userId={userId}
      role={membership.role}
      permissions={membership.permissions}
      timezone={membership.timezone}
      canWrite={canWrite}
      communitySlug={communitySlug}
    />
  );
}
