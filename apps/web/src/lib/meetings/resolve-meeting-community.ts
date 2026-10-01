import {
  resolveAccessibleCommunity,
  type AccessibleCommunity,
} from '@/lib/communities/resolve-accessible-community';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { getMeetingDetail } from '@/lib/services/meeting-service';
import type { SupportScope } from '@/lib/support/support-scope';

interface ResolveMeetingCommunityInput {
  userId: string;
  meetingId: number;
  /** The request's community (middleware's `x-community-id`), tried first. */
  preferredCommunityId: number | null;
  /** A support session may only reach its consented community. */
  supportScope: SupportScope | null;
}

/**
 * Which of the caller's communities holds `meetingId` AND lets the caller
 * read meetings there — or null.
 *
 * The same two gates `GET /api/v1/meetings/[id]` applies: `meetings:read` for
 * the caller's role, then the community-scoped read. The permission is checked
 * first so a community that denies it costs no query.
 */
export async function resolveMeetingCommunity({
  meetingId,
  ...input
}: ResolveMeetingCommunityInput): Promise<AccessibleCommunity | null> {
  return resolveAccessibleCommunity({
    ...input,
    canOpenIn: async (membership) =>
      checkPermissionV2(membership.role, membership.communityType, 'meetings', 'read', {
        isUnitOwner: membership.isUnitOwner,
      }) && (await getMeetingDetail(membership.communityId, meetingId)) !== null,
  });
}
