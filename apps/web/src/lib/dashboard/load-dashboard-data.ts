import {
  announcements,
  communities,
  createScopedClient,
  meetings,
  users,
  type Announcement,
  type Meeting,
} from '@propertypro/db';
import {
  selectRecentAnnouncements,
  selectUpcomingMeetings,
  toFirstName,
  type DashboardAnnouncement,
  type DashboardMeeting,
} from './dashboard-selectors';
import { resolveTimezone } from '@/lib/utils/timezone';

export interface DashboardData {
  communityName: string;
  firstName: string;
  timezone: string;
  announcements: DashboardAnnouncement[];
  meetings: DashboardMeeting[];
}

export async function loadDashboardData(
  communityId: number,
  userId: string,
): Promise<DashboardData> {
  const scoped = createScopedClient(communityId);
  const [announcementRows, meetingRows, communityRows, userRows] = await Promise.all([
    scoped.query(announcements),
    scoped.query(meetings),
    scoped.query(communities),
    scoped.query(users),
  ]);

  const community = communityRows.find((row) => row['id'] === communityId);
  const communityName =
    typeof community?.['name'] === 'string' ? (community['name'] as string) : 'Community';
  const timezone = resolveTimezone(community?.['timezone'] as string | undefined);

  const user = userRows.find((row) => row['id'] === userId);
  const fullName = typeof user?.['fullName'] === 'string' ? (user['fullName'] as string) : null;

  return {
    communityName,
    firstName: toFirstName(fullName),
    timezone,
    announcements: selectRecentAnnouncements(announcementRows as Announcement[]),
    meetings: selectUpcomingMeetings(meetingRows as Meeting[]),
  };
}
