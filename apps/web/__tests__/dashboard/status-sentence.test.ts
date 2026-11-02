/**
 * buildStatusSentence / resolveDashboardAudience (spec section 4). Pure: no DB, no mocks.
 */
import { describe, expect, it } from 'vitest';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { buildStatusSentence, resolveDashboardAudience } from '@/lib/dashboard/status-sentence';
import { formatDeadlineStamp } from '@/lib/meetings/meeting-status';

const TZ = 'America/New_York';
const READINESS = { satisfied: 9, applicableTotal: 12 };
const READINESS_LINE = '9 of 12 checklist documents are posted.';
const MEETING = { title: 'Board meeting', startsAt: '2026-11-10T23:00:00.000Z' };

function sentence(over: Partial<Parameters<typeof buildStatusSentence>[0]> = {}) {
  return buildStatusSentence({
    audience: 'manager',
    criticalCount: 0,
    urgentCount: 0,
    pendingSignatures: 0,
    readiness: READINESS,
    nextMeeting: null,
    timeZone: TZ,
    incomplete: false,
    ...over,
  });
}

describe('buildStatusSentence', () => {
  it('O=1 is singular and U>0 adds the due-this-week lead', () => {
    expect(sentence({ criticalCount: 1, urgentCount: 1 })).toEqual({
      tone: 'critical',
      chipLabel: 'Late items',
      headline: '1 required item is late.',
      body: `1 more is due this week. ${READINESS_LINE}`,
    });
  });

  it('O=2 is plural', () => {
    const s = sentence({ criticalCount: 2, urgentCount: 3 });
    expect(s.headline).toBe('2 required items are late.');
    expect(s.body).toBe(`3 more are due this week. ${READINESS_LINE}`);
  });

  it('critical with U=0 drops the lead', () => {
    expect(sentence({ criticalCount: 2 }).body).toBe(READINESS_LINE);
  });

  it('O=0, U=1 is attention, singular', () => {
    expect(sentence({ urgentCount: 1 })).toEqual({
      tone: 'attention',
      chipLabel: 'Needs attention',
      headline: 'Almost up to date. 1 thing is due this week.',
      body: READINESS_LINE,
    });
  });

  it('O=0, U=2 is plural', () => {
    expect(sentence({ urgentCount: 2 }).headline).toBe('Almost up to date. 2 things are due this week.');
  });

  it('O=0, U=0 is good', () => {
    expect(sentence()).toEqual({
      tone: 'good',
      chipLabel: 'Up to date',
      headline: "You're up to date.",
      body: `Nothing is late or due this week. ${READINESS_LINE}`,
    });
  });

  it('a failed read with nothing late or due is not an all-clear (R16)', () => {
    for (const audience of ['manager', 'board'] as const) {
      expect(sentence({ audience, incomplete: true })).toEqual({
        tone: 'attention',
        chipLabel: 'Needs attention',
        headline: "We couldn't check everything.",
        body: `Part of your to-do list didn't load. Please refresh the page. ${READINESS_LINE}`,
      });
    }
    // Without a readiness line the body is just the notice.
    expect(sentence({ incomplete: true, readiness: null }).body).toBe(
      "Part of your to-do list didn't load. Please refresh the page.",
    );
    // Control: a complete read still says it.
    expect(sentence({ incomplete: false }).headline).toBe("You're up to date.");
  });

  it('a failed read keeps the late/due copy when counts are non-zero', () => {
    expect(sentence({ incomplete: true, criticalCount: 1 }).headline).toBe('1 required item is late.');
    expect(sentence({ incomplete: true, urgentCount: 2 }).headline).toBe('Almost up to date. 2 things are due this week.');
  });

  it('a failed read does not change the resident sentence', () => {
    expect(sentence({ audience: 'resident', incomplete: true }).headline).toBe("You're all caught up.");
  });

  it('board reads like the manager', () => {
    expect(sentence({ audience: 'board', criticalCount: 1 }).headline).toBe('1 required item is late.');
  });

  it('omits readiness when checklist is null', () => {
    expect(sentence({ readiness: null }).body).toBe('Nothing is late or due this week.');
    expect(sentence({ readiness: null, urgentCount: 1 }).body).toBe('');
    expect(sentence({ readiness: null, criticalCount: 1, urgentCount: 2 }).body).toBe('2 more are due this week.');
  });

  it('readiness line never says required', () => {
    for (const over of [{}, { urgentCount: 1 }, { criticalCount: 1 }]) {
      expect(sentence(over).body).toContain('checklist documents');
      expect(sentence(over).body).not.toMatch(/required/i);
    }
  });

  it('resident with signatures waiting', () => {
    expect(sentence({ audience: 'resident', pendingSignatures: 1, nextMeeting: MEETING })).toEqual({
      tone: 'attention',
      chipLabel: 'Needs attention',
      headline: '1 document is waiting for your signature.',
      body: `The next meeting is Board meeting on ${formatDeadlineStamp(MEETING.startsAt, TZ)}.`,
    });
    expect(sentence({ audience: 'resident', pendingSignatures: 2 }).headline).toBe(
      '2 documents are waiting for your signature.',
    );
  });

  it('unknown next meeting omits the meeting line', () => {
    expect(sentence({ audience: 'resident', pendingSignatures: 1, nextMeeting: undefined }).body).toBe('');
    expect(sentence({ audience: 'resident', nextMeeting: undefined })).toMatchObject({
      headline: "You're all caught up.",
      body: '',
    });
    // Control: null still means nothing is scheduled.
    expect(sentence({ audience: 'resident', nextMeeting: null }).body).toBe('No meetings are scheduled.');
  });

  it('resident with nothing pending', () => {
    expect(sentence({ audience: 'resident' })).toEqual({
      tone: 'good',
      chipLabel: 'Up to date',
      headline: "You're all caught up.",
      body: 'No meetings are scheduled.',
    });
  });

  it('resident ignores counts and readiness', () => {
    const s = sentence({ audience: 'resident', criticalCount: 5, urgentCount: 5 });
    expect(s.headline).toBe("You're all caught up.");
  });
});

describe('resolveDashboardAudience', () => {
  const m = (over: Partial<CommunityMembership>) =>
    ({ isAdmin: false, designation: null, ...over }) as CommunityMembership;

  it('maps admin, board seat and resident', () => {
    expect(resolveDashboardAudience(m({ isAdmin: true }))).toBe('manager');
    expect(resolveDashboardAudience(m({ designation: 'board_member' }))).toBe('board');
    expect(resolveDashboardAudience(m({}))).toBe('resident');
  });
});
