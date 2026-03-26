import type { CommunityType } from '@propertypro/shared';
import {
  calculateMinutesPostingDeadline,
  calculateNoticePostBy,
  calculateOwnerVoteDocsDeadline,
  type MeetingType,
} from '@/lib/utils/meeting-calculator';
import { formatMeetingTitle } from '@/lib/utils/format-meeting-title';

export interface MeetingDeadlines {
  noticePostBy: string;
  ownerVoteDocsBy: string;
  minutesPostBy: string;
}

export interface MeetingResponseRecord {
  [key: string]: unknown;
  id: number;
  title: string;
  meetingType: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  noticePostedAt: Date | null;
  minutesApprovedAt: Date | null;
}

export function buildMeetingDeadlines(
  startsAt: Date,
  meetingType: MeetingType,
  communityType: CommunityType,
): MeetingDeadlines {
  return {
    noticePostBy: calculateNoticePostBy(startsAt, meetingType, communityType).toISOString(),
    ownerVoteDocsBy: calculateOwnerVoteDocsDeadline(startsAt).toISOString(),
    minutesPostBy: calculateMinutesPostingDeadline(startsAt).toISOString(),
  };
}

export function serializeMeetingResponse(
  meeting: MeetingResponseRecord,
  communityType: CommunityType,
) {
  return {
    id: meeting.id,
    title: formatMeetingTitle(meeting.title),
    meetingType: meeting.meetingType,
    startsAt: meeting.startsAt.toISOString(),
    endsAt: meeting.endsAt?.toISOString() ?? null,
    location: meeting.location,
    noticePostedAt: meeting.noticePostedAt?.toISOString() ?? null,
    minutesApprovedAt: meeting.minutesApprovedAt?.toISOString() ?? null,
    deadlines: buildMeetingDeadlines(
      meeting.startsAt,
      meeting.meetingType as MeetingType,
      communityType,
    ),
  };
}
