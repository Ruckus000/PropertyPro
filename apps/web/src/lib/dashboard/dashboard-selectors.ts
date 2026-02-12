import type { Announcement, Meeting } from '@propertypro/db';

export interface DashboardAnnouncement {
  id: number;
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: string;
}

export interface DashboardMeeting {
  id: number;
  title: string;
  meetingType: string;
  startsAt: string;
  location: string;
}

export function toFirstName(fullName: string | null | undefined): string {
  if (!fullName) return 'Resident';
  const trimmed = fullName.trim();
  if (!trimmed) return 'Resident';
  return trimmed.split(/\s+/)[0] ?? 'Resident';
}

export function selectRecentAnnouncements(rows: Announcement[]): DashboardAnnouncement[] {
  return rows
    .filter((row) => row.archivedAt == null)
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    })
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      isPinned: row.isPinned,
      publishedAt: new Date(row.publishedAt).toISOString(),
    }));
}

export function selectUpcomingMeetings(rows: Meeting[]): DashboardMeeting[] {
  const now = Date.now();
  return rows
    .filter((row) => {
      const startsAt = new Date(row.startsAt).getTime();
      return startsAt >= now;
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      title: row.title,
      meetingType: row.meetingType,
      startsAt: new Date(row.startsAt).toISOString(),
      location: row.location,
    }));
}
