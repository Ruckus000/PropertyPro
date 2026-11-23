/**
 * Moved to `@propertypro/shared` (compliance/scoring/meeting-deadlines.ts) so the admin
 * console scores compliance with the same rule. Re-exported so existing
 * imports keep working.
 */
export {
  calculateMinutesPostingDeadline,
  calculateNoticePostBy,
  calculateOwnerVoteDocsDeadline,
  getNoticeLeadDays,
  type MeetingType,
} from '@propertypro/shared';
