import {
  announcements,
  communities,
  createScopedClient,
  maintenanceRequests,
  meetings,
  users,
  violations,
  type Announcement,
  type Meeting,
  type Violation,
} from '@propertypro/db';
import {
  getFeaturesForCommunity,
  type CommunityType,
} from '@propertypro/shared';
import {
  selectRecentAnnouncements,
  selectUpcomingMeetings,
  selectViolationSummary,
  toFirstName,
  type DashboardAnnouncement,
  type DashboardMeeting,
  type DashboardViolationSummary,
} from './dashboard-selectors';
import { resolveTimezone } from '@/lib/utils/timezone';
import { listMyPendingSigners } from '@/lib/services/esign-service';

export interface DashboardPendingSigner {
  signerId: number;
  templateName: string;
  messageSubject: string | null;
  expiresAt: string | null;
  submissionExternalId: string;
  slug: string | null;
  createdAt: string;
}

export interface DashboardData {
  communityName: string;
  firstName: string;
  timezone: string;
  announcements: DashboardAnnouncement[];
  meetings: DashboardMeeting[];
  violationSummary: DashboardViolationSummary | null;
  pendingSigners: DashboardPendingSigner[];
  openMaintenanceCount: number;
}

export async function loadDashboardData(
  communityId: number,
  userId: string,
): Promise<DashboardData> {
  const scoped = createScopedClient(communityId);
  const [announcementRows, meetingRows, communityRows, userRows, violationRows, maintenanceRows] = await Promise.all([
    scoped.query(announcements),
    scoped.query(meetings),
    scoped.query(communities),
    scoped.query(users),
    scoped.query(violations),
    scoped.query(maintenanceRequests),
  ]);

  const community = communityRows.find((row) => row['id'] === communityId);
  const communityName =
    typeof community?.['name'] === 'string' ? (community['name'] as string) : 'Community';
  const timezone = resolveTimezone(community?.['timezone'] as string | undefined);

  const user = userRows.find((row) => row['id'] === userId);
  const fullName = typeof user?.['fullName'] === 'string' ? (user['fullName'] as string) : null;
  const userEmail = typeof user?.['email'] === 'string' ? (user['email'] as string) : '';

  const openStatuses = new Set(['open', 'submitted', 'in_progress', 'acknowledged']);
  const openMaintenanceCount = maintenanceRows.filter(
    (row) => typeof row['status'] === 'string' && openStatuses.has(row['status'] as string),
  ).length;

  // Load pending e-sign signers if the feature is enabled
  let pendingSigners: DashboardPendingSigner[] = [];
  const communityType = community?.['communityType'] as string | undefined;
  if (communityType) {
    const features = getFeaturesForCommunity(communityType as CommunityType);
    if (features.hasEsign && userEmail) {
      const raw = await listMyPendingSigners(communityId, userId, userEmail);
      pendingSigners = raw.map((r) => ({
        signerId: r.signerId,
        templateName: r.templateName,
        messageSubject: r.messageSubject,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        submissionExternalId: r.submissionExternalId,
        slug: r.slug,
        createdAt: r.createdAt.toISOString(),
      }));
    }
  }

  return {
    communityName,
    firstName: toFirstName(fullName),
    timezone,
    announcements: selectRecentAnnouncements(announcementRows as Announcement[]),
    meetings: selectUpcomingMeetings(meetingRows as Meeting[]),
    violationSummary: selectViolationSummary(violationRows as unknown as Violation[]),
    pendingSigners,
    openMaintenanceCount,
  };
}
