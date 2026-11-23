/**
 * Moved to `@propertypro/shared` (compliance/scoring/meeting-minutes-status.ts) so the admin
 * console scores compliance with the same rule. Re-exported so existing
 * imports keep working.
 */
export {
  MEETING_MINUTES_TEMPLATE_KEYS,
  MEETING_MINUTES_WINDOW_MONTHS,
  MEETING_SCORING_WINDOW_MONTHS,
  MINUTES_MEETING_TYPES,
  meetingMinutesStatus,
  minutesDocumentIds,
  summarizeMeetingMinutes,
  toMinutesInputs,
  type ComplianceScoringMeeting,
  type MeetingMinutesAwaiting,
  type MeetingMinutesInput,
  type MeetingMinutesMiss,
  type MeetingMinutesSummary,
  type MinutesDocumentState,
} from '@propertypro/shared';
