/**
 * One community's compliance score: satisfied ÷ applicable checklist rows, each
 * row judged by `withDerivedStatus` — the Compliance page's own rule.
 *
 * Every surface that shows a score calls this (the Compliance page's cards, the
 * PM Communities page and KPI, the admin console), so a manager and an operator
 * never see two different numbers for the same community. A score computed any
 * other way (for example "any linked document counts") is a second rule: a
 * draft or deleted file, a yearly record a year out of date, or a late posting
 * would read as met there and not here.
 *
 * Pure: the caller reads the rows, documents and meetings.
 */
import type { CommunityType } from '../../index';
import { postingClockApplies } from '../posting-deadline';
import { withDerivedStatus, type MeetingScoring } from './derive-checklist-status';
import type { LinkedDocumentState } from './linked-document-state';
import { summarizeMeetingNotices } from './meeting-notice-status';
import {
  summarizeMeetingMinutes,
  toMinutesInputs,
  type ComplianceScoringMeeting,
} from './meeting-minutes-status';

export interface DerivedCompliance {
  /** Null when no row applies. */
  score: number | null;
  /** Rows past their posting deadline (`overdue`). */
  pastDeadline: number;
  satisfied: number;
  applicable: number;
}

/**
 * Count a community's rows by derived status. Rows use the checklist table's
 * camelCase field names (`templateKey`, `isApplicable`, `documentId`,
 * `documentPostedAt`, `deadline`, `rollingWindow`).
 */
export function deriveCompliance(
  rows: ReadonlyArray<Record<string, unknown>>,
  documentStates: Map<number, LinkedDocumentState>,
  clockApplies: boolean,
  meetings: MeetingScoring | null = null,
  now: Date = new Date(),
): DerivedCompliance {
  let applicable = 0;
  let satisfied = 0;
  let pastDeadline = 0;
  for (const row of rows) {
    const status = withDerivedStatus(row, documentStates, clockApplies, meetings, now)['status'];
    if (status === 'not_applicable') continue;
    applicable += 1;
    if (status === 'satisfied') satisfied += 1;
    if (status === 'overdue') pastDeadline += 1;
  }
  return {
    score: applicable > 0 ? Math.round((satisfied / applicable) * 100) : null,
    pastDeadline,
    satisfied,
    applicable,
  };
}

export interface CommunityComplianceInputs {
  communityType: CommunityType;
  unitCount: number | null;
  /** The community's live (not soft-deleted) checklist rows. */
  checklistRows: ReadonlyArray<Record<string, unknown>>;
  /**
   * Every document a row or a meeting names, soft-deleted ones included, and
   * only this community's (an id must never reach across tenants).
   */
  documentStates: Map<number, LinkedDocumentState>;
  /**
   * The community's meetings from `MEETING_SCORING_WINDOW_MONTHS` ago onward.
   * They decide the meeting-notice and minutes rows.
   */
  meetings: readonly ComplianceScoringMeeting[];
  now?: Date;
}

/**
 * The whole rule for one community. Null for an apartment community: it has
 * no posting rules, so it has no score.
 */
export function scoreCommunityCompliance(input: CommunityComplianceInputs): DerivedCompliance | null {
  if (input.communityType === 'apartment') return null;
  const now = input.now ?? new Date();
  const clockApplies = postingClockApplies({
    communityType: input.communityType,
    unitCount: input.unitCount,
  });
  const meetings: MeetingScoring = {
    notices: summarizeMeetingNotices(input.meetings, input.communityType, now),
    minutes: summarizeMeetingMinutes(toMinutesInputs(input.meetings, input.documentStates), now),
  };
  return deriveCompliance(input.checklistRows, input.documentStates, clockApplies, meetings, now);
}
