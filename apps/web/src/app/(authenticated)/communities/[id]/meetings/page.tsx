import { headers } from 'next/headers';
import { communities, createScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermissionV2, requirePermission } from '@/lib/db/access-control';
import { MeetingsPageShell } from '@/components/meetings/meetings-page-shell';
import { buildCalendarSubscribeUrl } from '@/lib/calendar/subscribe-url';
import { generateMyMeetingsSubscriptionToken } from '@/lib/calendar/subscription-token';

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
  const canSubscribe = checkPermissionV2(
    membership.role,
    membership.communityType,
    'calendar_sync',
    'read',
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
  const headerStore = await headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const protocol = headerStore.get('x-forwarded-proto')
    ?? (host?.includes('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https');
  const currentOrigin = host ? `${protocol}://${host}` : null;

  const publicSubscribeUrl = buildCalendarSubscribeUrl({
    communityId,
    communitySlug,
    currentOrigin,
    feed: 'community',
  });
  let personalSubscribeUrl: string | null = null;
  if (canSubscribe) {
    try {
      personalSubscribeUrl = buildCalendarSubscribeUrl({
        communityId,
        communitySlug,
        currentOrigin,
        feed: 'personal',
        subscriptionToken: generateMyMeetingsSubscriptionToken({
          communityId,
          userId,
        }),
      });
    } catch (error) {
      console.error('[meetings-page] failed to generate personal calendar subscription URL', {
        communityId,
        userId,
        error,
      });
    }
  }

  return (
    <MeetingsPageShell
      communityId={communityId}
      userId={userId}
      role={membership.role}
      timezone={membership.timezone}
      canWrite={canWrite}
      canSubscribe={canSubscribe}
      publicSubscribeUrl={publicSubscribeUrl}
      personalSubscribeUrl={personalSubscribeUrl}
    />
  );
}
