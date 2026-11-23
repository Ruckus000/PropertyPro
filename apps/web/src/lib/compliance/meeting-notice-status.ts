/**
 * Moved to `@propertypro/shared` (compliance/scoring/meeting-notice-status.ts) so the admin
 * console scores compliance with the same rule. Re-exported so existing
 * imports keep working.
 */
export {
  MEETING_NOTICE_TEMPLATE_KEYS,
  MEETING_NOTICE_WINDOW_MONTHS,
  meetingNoticeStatus,
  summarizeMeetingNotices,
  type MeetingNoticeInput,
  type MeetingNoticeMiss,
  type MeetingNoticeSummary,
  type MeetingNoticeUpcoming,
} from '@propertypro/shared';
