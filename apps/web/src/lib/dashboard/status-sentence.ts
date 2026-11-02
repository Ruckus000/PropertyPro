/**
 * The dashboard's one-sentence status (spec section 4, D12). Pure: no DB, no clock.
 *
 * The readiness line says "checklist documents", never "required documents":
 * below the posting threshold nothing is legally required (D12).
 */
import type { CommunityMembership } from '@/lib/api/community-membership';
import { canActAsBoard } from '@/lib/db/access-control';
import { formatDeadlineStamp } from '@/lib/meetings/meeting-status';
import type { DashboardAudience } from '@/lib/dashboard/attention-queue';

export interface StatusSentence {
  tone: 'critical' | 'attention' | 'good';
  chipLabel: string;
  headline: string;
  body: string;
}

/** isAdmin is the manager; a board seat (not admin) is the board; everyone else is a resident. */
export function resolveDashboardAudience(m: CommunityMembership): DashboardAudience {
  if (m.isAdmin) return 'manager';
  return canActAsBoard(m) ? 'board' : 'resident';
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

export function buildStatusSentence(input: {
  audience: DashboardAudience;
  criticalCount: number;
  urgentCount: number;
  pendingSignatures: number;
  readiness: { satisfied: number; applicableTotal: number } | null;
  /** null: no meeting is scheduled. undefined: unknown (the read failed), so no meeting line (D21). */
  nextMeeting: { title: string; startsAt: string } | null | undefined;
  timeZone: string;
}): StatusSentence {
  const { audience, criticalCount: o, urgentCount: u, pendingSignatures: s } = input;

  if (audience === 'resident') {
    const meetingLine =
      input.nextMeeting === undefined
        ? ''
        : input.nextMeeting
          ? `The next meeting is ${input.nextMeeting.title} on ${formatDeadlineStamp(input.nextMeeting.startsAt, input.timeZone)}.`
          : 'No meetings are scheduled.';
    return s > 0
      ? {
          tone: 'attention',
          chipLabel: 'Needs attention',
          headline: `${s} ${plural(s, 'document is', 'documents are')} waiting for your signature.`,
          body: meetingLine,
        }
      : {
          tone: 'good',
          chipLabel: 'Up to date',
          headline: "You're all caught up.",
          body: meetingLine,
        };
  }

  const readiness = input.readiness
    ? `${input.readiness.satisfied} of ${input.readiness.applicableTotal} checklist documents are posted.`
    : '';
  const join = (lead: string): string => `${lead}${readiness}`.trim();

  if (o > 0) {
    return {
      tone: 'critical',
      chipLabel: 'Late items',
      headline: `${o} required ${plural(o, 'item is', 'items are')} late.`,
      body: join(u > 0 ? `${u} more ${plural(u, 'is', 'are')} due this week. ` : ''),
    };
  }
  if (u > 0) {
    return {
      tone: 'attention',
      chipLabel: 'Needs attention',
      headline: `Almost up to date. ${u} ${plural(u, 'thing is', 'things are')} due this week.`,
      body: join(''),
    };
  }
  return {
    tone: 'good',
    chipLabel: 'Up to date',
    headline: "You're up to date.",
    body: join('Nothing is late or due this week. '),
  };
}
