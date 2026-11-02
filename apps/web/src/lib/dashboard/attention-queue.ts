/**
 * The dashboard's attention queue (D5-D10): compliance, meeting-notice and
 * hearing-notice deadlines merged into one list, worst first.
 *
 * Pure. Takes `now` and `timeZone`, reads no clock, and imports nothing that
 * loads `@propertypro/db` at runtime (types only, via `import type`).
 */
import type { CommunityType, BoardDesignation } from '@propertypro/shared';
import type { EscalationTier } from '@propertypro/ui/tokens';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';
import type { CalendarMeetingRecord } from '@/lib/services/calendar-data-service';
import type { DashboardHearing } from '@/lib/dashboard/load-dashboard-overview';
import { buildMeetingDeadlines } from '@/lib/meetings/meeting-response';
import {
  deadlineEscalation,
  formatDeadlineStamp,
  noticeWindowLabel,
} from '@/lib/meetings/meeting-status';
import { needsAttention } from '@/lib/utils/compliance-calculator';
import { resolveComplianceCta } from '@/lib/utils/compliance-cta';
import type { MeetingType } from '@/lib/utils/meeting-calculator';
import { HEARING_NOTICE_DAYS } from '@/lib/violations/hearing-notice-warning';

export type DashboardAudience = 'manager' | 'board' | 'resident';
export type AttentionKind = 'compliance' | 'meeting_notice' | 'hearing_notice';
type AttentionTier = Exclude<EscalationTier, 'calm'>;

export interface AttentionItem {
  /** `${kind}:${sourceId}` */
  id: string;
  kind: AttentionKind;
  tier: AttentionTier;
  title: string;
  detail: string;
  /** ISO. Null for a board-action item with no deadline (and an overdue item missing one). */
  dueAt: string | null;
  action: { label: string; href: string };
}

const DAY_MS = 86_400_000;
const TIER_RANK: Record<AttentionTier, number> = { critical: 0, urgent: 1, aware: 2 };

/**
 * Tier of a deadline. `deadlineEscalation` is reused so the dashboard can never
 * disagree with the meetings page about what is urgent (D6); its label is the
 * `EscalationTier` name in title case. Calm comes back as `null`.
 */
function tierOf(deadlineIso: string, now: Date): AttentionTier | null {
  const tier = deadlineEscalation(deadlineIso, now).label.toLowerCase() as EscalationTier;
  return tier === 'calm' ? null : tier;
}

function complianceRows(
  checklist: ChecklistItemData[],
  input: Pick<Args, 'audience' | 'communityId' | 'designation' | 'now' | 'timeZone'>,
): AttentionItem[] {
  const { audience, communityId, designation, now, timeZone } = input;
  const href = `/communities/${communityId}/compliance`;
  return checklist
    .filter((item) => needsAttention(item, now))
    .map((item) => {
      const deadline = item.deadline ?? null;
      const overdue = item.status === 'overdue';
      // Overdue is critical; otherwise the deadline decides. A board-action item
      // can sit more than 30 days out (calm) or have no deadline: both stay in
      // the queue, as `needsAttention` says, and read as aware.
      const tier: AttentionTier = overdue
        ? 'critical'
        : (deadline ? tierOf(deadline, now) : null) ?? 'aware';
      let detail = 'Needs a board action';
      if (deadline) {
        const stamp = formatDeadlineStamp(deadline, timeZone);
        detail = overdue ? `Was due ${stamp}` : `Due ${stamp}`;
      } else if (overdue) {
        detail = 'Overdue';
      }
      const label =
        resolveComplianceCta(item, audience === 'manager', designation)?.label ?? 'View';
      return {
        id: `compliance:${item.id}`,
        kind: 'compliance' as const,
        tier,
        title: item.title,
        detail,
        dueAt: deadline,
        action: { label, href },
      };
    });
}

function meetingNoticeRows(
  meetings: CalendarMeetingRecord[],
  input: Pick<Args, 'audience' | 'communityId' | 'communityType' | 'now' | 'timeZone'>,
): AttentionItem[] {
  const { audience, communityId, communityType, now, timeZone } = input;
  const rows: AttentionItem[] = [];
  for (const meeting of meetings) {
    if (meeting.noticePostedAt !== null) continue;
    const deadlines = buildMeetingDeadlines(
      meeting.startsAt,
      meeting.meetingType as MeetingType,
      communityType,
    );
    // A post-by in the past is critical (D8): deadlineEscalation already says so.
    const tier = tierOf(deadlines.noticePostBy, now);
    if (!tier) continue;
    const window = noticeWindowLabel({
      startsAt: meeting.startsAt.toISOString(),
      noticePostedAt: null,
      minutesApprovedAt: null,
      deadlines,
    });
    rows.push({
      id: `meeting_notice:${meeting.id}`,
      kind: 'meeting_notice',
      tier,
      title: `Post notice for ${meeting.title}`,
      detail: `${window} before the meeting · post by ${formatDeadlineStamp(deadlines.noticePostBy, timeZone)}`,
      dueAt: deadlines.noticePostBy,
      action: {
        label: audience === 'manager' ? 'Post notice' : 'View',
        href: `/meetings/${meeting.id}?communityId=${communityId}`,
      },
    });
  }
  return rows;
}

function hearingNoticeRows(
  hearings: DashboardHearing[],
  input: Pick<Args, 'audience' | 'communityId' | 'now' | 'timeZone'>,
): AttentionItem[] {
  const { audience, communityId, now, timeZone } = input;
  const rows: AttentionItem[] = [];
  for (const hearing of hearings) {
    const sendBy = new Date(new Date(hearing.hearingDate).getTime() - HEARING_NOTICE_DAYS * DAY_MS);
    // ponytail: past windows drop because sent-vs-missed is unknowable. Trigger: a hearing-notice-sent column lands.
    if (Number.isNaN(sendBy.getTime()) || sendBy.getTime() <= now.getTime()) continue;
    const sendByIso = sendBy.toISOString();
    const tier = tierOf(sendByIso, now);
    if (!tier) continue;
    rows.push({
      id: `hearing_notice:${hearing.violationId}`,
      kind: 'hearing_notice',
      tier,
      title: `Send hearing notice — ${hearing.unitLabel}`,
      detail: `${HEARING_NOTICE_DAYS}-day hearing notice · send by ${formatDeadlineStamp(sendByIso, timeZone)}`,
      dueAt: sendByIso,
      action: {
        label: audience === 'manager' ? 'Open case' : 'View',
        href: `/violations/${hearing.violationId}?communityId=${communityId}`,
      },
    });
  }
  return rows;
}

interface Args {
  audience: Exclude<DashboardAudience, 'resident'>;
  communityId: number;
  communityType: CommunityType;
  designation: BoardDesignation | null;
  checklist: ChecklistItemData[] | null;
  meetings30d: CalendarMeetingRecord[];
  hearings: DashboardHearing[] | null;
  now: Date;
  timeZone: string;
}

export function buildAttentionQueue(input: Args): AttentionItem[] {
  const items = [
    ...(input.checklist ? complianceRows(input.checklist, input) : []),
    ...meetingNoticeRows(input.meetings30d, input),
    ...(input.hearings ? hearingNoticeRows(input.hearings, input) : []),
  ];
  return items.sort((a, b) => {
    const byTier = TIER_RANK[a.tier] - TIER_RANK[b.tier];
    if (byTier !== 0) return byTier;
    if (a.dueAt !== b.dueAt) {
      if (a.dueAt === null) return 1;
      if (b.dueAt === null) return -1;
      const byDue = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (byDue !== 0) return byDue;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function countByTier(items: AttentionItem[]): Record<AttentionTier, number> {
  const counts: Record<AttentionTier, number> = { critical: 0, urgent: 0, aware: 0 };
  for (const item of items) counts[item.tier] += 1;
  return counts;
}
