import {
  createScopedClient,
} from '@propertypro/db';
import {
  getFeaturesForCommunity,
} from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import {
  type DashboardAnnouncement,
  type DashboardMeeting,
  type DashboardViolationSummary,
  toFirstName,
} from './dashboard-selectors';
import { resolveTimezone } from '@/lib/utils/timezone';
import { listMyPendingSigners } from '@/lib/services/esign-service';
import {
  getDashboardOpenMaintenanceCount,
  getDashboardUserLookup,
  getDashboardViolationSummary,
  listDashboardAnnouncements,
  listDashboardMeetings,
} from './dashboard-queries';

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
  membership: CommunityMembership,
): Promise<DashboardData> {
  const scoped = createScopedClient(communityId);
  const features = getFeaturesForCommunity(membership.communityType);
  const userLookupPromise = getDashboardUserLookup(scoped, userId);
  const pendingSignersPromise = userLookupPromise.then(async (userLookup) => {
    if (!features.hasEsign || !userLookup.email) {
      return [] as DashboardPendingSigner[];
    }

    const raw = await listMyPendingSigners(communityId, userId, userLookup.email);
    return raw.map((r) => ({
      signerId: r.signerId,
      templateName: r.templateName,
      messageSubject: r.messageSubject,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      submissionExternalId: r.submissionExternalId,
      slug: r.slug,
      createdAt: r.createdAt.toISOString(),
    }));
  });

  const [
    userLookup,
    announcements,
    meetings,
    violationSummary,
    openMaintenanceCount,
    pendingSigners,
  ] = await Promise.all([
    userLookupPromise,
    listDashboardAnnouncements(scoped, membership),
    listDashboardMeetings(scoped),
    getDashboardViolationSummary(scoped),
    getDashboardOpenMaintenanceCount(scoped),
    pendingSignersPromise,
  ]);

  return {
    communityName: membership.communityName,
    firstName: toFirstName(userLookup.fullName),
    timezone: resolveTimezone(membership.timezone),
    announcements,
    meetings,
    violationSummary,
    pendingSigners,
    openMaintenanceCount,
  };
}
