/**
 * The meeting half of the notice-window check: which statute, how much lead
 * time, and what to tell the person who just scheduled it.
 *
 * Fills the acceptance criterion at
 * `specs/phase-1-compliance-core/16-meeting-management.md:31` — the app has
 * always *displayed* a post-by deadline after the fact, but would accept a
 * meeting scheduled for tomorrow without ever saying that its 14-day notice was
 * unreachable before the save.
 *
 * **Warns, never blocks.** There is no `emergency` meeting type in
 * `createMeetingSchema`, so a hard rejection would leave no escape hatch for a
 * meeting Florida law permits on short notice. The board is told; the board
 * decides.
 *
 * The lead time is not restated here. It comes from `calculateNoticePostBy`,
 * the same function that produces the deadline the detail modal renders, so a
 * warning can never disagree with the deadline shown next to it.
 */
import type { CommunityType } from '@propertypro/shared';
import { noticeShortfall, type NoticeWarning } from '@/lib/compliance/notice-window';
import {
  calculateNoticePostBy,
  getNoticeLeadDays,
  type MeetingType,
} from '@/lib/utils/meeting-calculator';

export const MEETING_NOTICE_WARNING_CODE = 'notice_window_missed';

/**
 * `null` when the notice deadline is still reachable.
 *
 * `now` is injected rather than read from the clock so the route, the form and
 * the tests all agree on when "now" is.
 */
export function buildMeetingNoticeWarning(params: {
  startsAt: Date;
  meetingType: MeetingType;
  communityType: CommunityType;
  now: Date;
}): NoticeWarning | null {
  const { startsAt, meetingType, communityType, now } = params;
  const deadline = calculateNoticePostBy(startsAt, meetingType, communityType);
  const shortfall = noticeShortfall(deadline, now);
  if (!shortfall) {
    return null;
  }

  const leadDays = getNoticeLeadDays(meetingType, communityType);
  const window = leadDays === 2 ? '48-hour' : `${leadDays}-day`;

  return {
    code: MEETING_NOTICE_WARNING_CODE,
    // Phrased so it reads correctly both before the save (the live hint under
    // the Start field) and after it (the warning the API returns). It states
    // the fact and the consequence, and takes no position on whether the row
    // exists yet.
    message:
      `This meeting is inside its ${window} notice window — the deadline to post notice ` +
      `passed ${shortfall.shortfallLabel} ago. Florida law grants no extension for short ` +
      `notice, so an action taken at this meeting can be challenged. Reschedule with a ` +
      `compliant notice unless this is an emergency.`,
  };
}
