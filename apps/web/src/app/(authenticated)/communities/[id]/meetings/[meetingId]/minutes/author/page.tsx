// breadcrumbs:exempt — redirect-only page
//
// Entry point #2: creates a draft seeded from the meeting (target_meeting_id
// + auto-titled) and replaces the route with the editor.
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { requirePermission } from '@/lib/db/access-control';
import { CreateAndRedirect } from '@/components/documents/author/create-and-redirect';

interface PageProps {
  params: Promise<{ id: string; meetingId: string }>;
}

export default async function AuthorMeetingMinutesPage({ params }: PageProps) {
  const { id, meetingId: rawMeetingId } = await params;
  const communityId = Number(id);
  const meetingId = Number(rawMeetingId);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Author minutes</h1>
        <p className="mt-2 text-sm text-status-danger">Invalid community ID.</p>
      </div>
    );
  }
  if (!Number.isInteger(meetingId) || meetingId <= 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content">Author minutes</h1>
        <p className="mt-2 text-sm text-status-danger">Invalid meeting ID.</p>
      </div>
    );
  }

  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  requirePermission(membership, 'documents', 'write');

  return (
    <CreateAndRedirect
      communityId={communityId}
      targetMeetingId={meetingId}
      redirectTo={`/communities/${communityId}/documents/author/__DRAFT_ID__`}
    />
  );
}
