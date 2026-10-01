// breadcrumbs:exempt — redirect-only page
import { notFound } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { getOptionalPageCommunityId } from '@/lib/request/page-community-context';
import { resolveMeetingCommunity } from '@/lib/meetings/resolve-meeting-community';
import { redirectIntoCommunity } from '@/lib/communities/redirect-into-community';
import { getPageSupportScope } from '@/lib/support/support-scope';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/meetings/<id>` → `/communities/<cid>/meetings?meeting=<id>`, which opens
 * the meeting's detail dialog.
 *
 * New-meeting notifications and the PM overview's upcoming meetings link here.
 * The request's community is tried first, then the caller's other
 * communities; a meeting the caller may not open 404s exactly like a missing
 * one.
 */
export default async function MeetingRedirectPage({ params }: PageProps) {
  const { id } = await params;

  const meetingId = Number(id);
  if (!Number.isInteger(meetingId) || meetingId <= 0) {
    notFound();
  }

  const userId = await requireAuthenticatedUserId();
  const requestCommunityId = await getOptionalPageCommunityId();
  const match = await resolveMeetingCommunity({
    userId,
    meetingId,
    preferredCommunityId: requestCommunityId,
    supportScope: await getPageSupportScope(),
  });

  if (match === null) {
    notFound();
  }

  return redirectIntoCommunity(
    match,
    `/communities/${match.communityId}/meetings?meeting=${meetingId}`,
    requestCommunityId,
  );
}
