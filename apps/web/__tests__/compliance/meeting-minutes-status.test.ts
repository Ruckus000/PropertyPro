/**
 * The minutes checklist row, scored per board meeting (audit 2026-11-05, H-5).
 *
 * Before: one linked minutes document satisfied the row for a year, whatever
 * the other meetings had. After: each board meeting held in the past 12
 * months counts, from `meetings.minutes_approved_at` and the approval date on
 * its minutes document.
 */
import { describe, expect, it } from 'vitest';
import {
  meetingMinutesStatus,
  summarizeMeetingMinutes,
  toMinutesInputs,
  type ComplianceScoringMeeting,
  type MeetingMinutesInput,
} from '@/lib/compliance/meeting-minutes-status';
import { withDerivedStatus } from '@/lib/compliance/derive-checklist-status';

const NOW = new Date('2026-11-21T15:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * DAY);

let nextId = 1;
function board(over: Partial<MeetingMinutesInput> & { startsAt: Date }): MeetingMinutesInput {
  return {
    id: nextId++,
    title: 'Board Meeting',
    meetingType: 'board',
    minutesPostedAt: null,
    minutesDocument: null,
    ...over,
  };
}

/** Posted `postedDaysAfterApproval` days after an approval `approvedDaysAgo` days ago. */
function posted(approvedDaysAgo: number, postedDaysAfterApproval: number) {
  const approvedAt = daysFromNow(-approvedDaysAgo);
  return {
    minutesPostedAt: new Date(approvedAt.getTime() + postedDaysAfterApproval * DAY),
    minutesDocument: { receivedAt: approvedAt, available: true },
  };
}

describe('summarizeMeetingMinutes', () => {
  it('counts minutes posted within 30 days of approval as on time', () => {
    const summary = summarizeMeetingMinutes(
      [board({ startsAt: daysFromNow(-60), ...posted(40, 30) }), board({ startsAt: daysFromNow(-20) })],
      NOW,
    );
    expect(summary).toMatchObject({ dueCount: 1, onTimeCount: 1, missed: [] });
  });

  it('counts minutes posted 30 days and one millisecond after approval as late, with the post-by they missed', () => {
    const approvedAt = daysFromNow(-50);
    const postBy = new Date(approvedAt.getTime() + 30 * DAY);
    const postedAt = new Date(postBy.getTime() + 1);
    const late = board({
      startsAt: daysFromNow(-60),
      minutesPostedAt: postedAt,
      minutesDocument: { receivedAt: approvedAt, available: true },
    });
    const summary = summarizeMeetingMinutes([late, board({ startsAt: daysFromNow(-10) })], NOW);
    expect(summary.onTimeCount).toBe(0);
    expect(summary.missed).toEqual([
      {
        meetingId: late.id,
        title: 'Board Meeting',
        startsAt: late.startsAt.toISOString(),
        postBy: postBy.toISOString(),
        minutesPostedAt: postedAt.toISOString(),
        reason: 'posted_late',
      },
    ]);
  });

  it('treats posted minutes with no approval date as on time (no lateness claimed)', () => {
    const summary = summarizeMeetingMinutes(
      [board({ startsAt: daysFromNow(-60), minutesPostedAt: daysFromNow(-1) })],
      NOW,
    );
    expect(summary).toMatchObject({ dueCount: 1, onTimeCount: 1, missed: [] });
  });

  it('holds the latest meeting as awaiting approval, not due, until a later board meeting is held', () => {
    const latest = board({ startsAt: daysFromNow(-5) });
    const summary = summarizeMeetingMinutes([latest], NOW);
    expect(summary).toMatchObject({ dueCount: 0, onTimeCount: 0, missed: [] });
    expect(summary.nextDue).toEqual({
      meetingId: latest.id,
      title: 'Board Meeting',
      startsAt: latest.startsAt.toISOString(),
    });
  });

  it('counts minutes missing once a later board meeting has been held', () => {
    const earlier = board({ startsAt: daysFromNow(-40) });
    const summary = summarizeMeetingMinutes([earlier, board({ startsAt: daysFromNow(-10) })], NOW);
    expect(summary.dueCount).toBe(1);
    expect(summary.missed).toEqual([
      expect.objectContaining({ meetingId: earlier.id, reason: 'not_posted', postBy: null }),
    ]);
  });

  it('does not let an UPCOMING board meeting make earlier minutes due', () => {
    const held = board({ startsAt: daysFromNow(-5) });
    const summary = summarizeMeetingMinutes([held, board({ startsAt: daysFromNow(10) })], NOW);
    expect(summary.dueCount).toBe(0);
    expect(summary.nextDue?.meetingId).toBe(held.id);
  });

  it('reads deleted or un-posted minutes as not posted', () => {
    const summary = summarizeMeetingMinutes(
      [
        board({
          startsAt: daysFromNow(-40),
          minutesPostedAt: daysFromNow(-30),
          minutesDocument: { receivedAt: null, available: false },
        }),
        board({ startsAt: daysFromNow(-10) }),
      ],
      NOW,
    );
    expect(summary.missed).toEqual([expect.objectContaining({ reason: 'not_posted' })]);
  });

  it('counts board and budget meetings only, and only inside the 12-month window', () => {
    const summary = summarizeMeetingMinutes(
      [
        board({ startsAt: daysFromNow(-400) }), // outside the window
        board({ meetingType: 'annual', startsAt: daysFromNow(-100) }), // an owner meeting
        board({ meetingType: 'budget', startsAt: daysFromNow(-90) }),
        board({ startsAt: daysFromNow(-10) }),
      ],
      NOW,
    );
    expect(summary.dueCount).toBe(1);
    expect(summary.missed).toEqual([expect.objectContaining({ reason: 'not_posted' })]);
  });
});

describe('meetingMinutesStatus', () => {
  it('is overdue for a late posting, carrying the deadline it missed', () => {
    const summary = summarizeMeetingMinutes(
      [board({ startsAt: daysFromNow(-90), ...posted(80, 45) }), board({ startsAt: daysFromNow(-10) })],
      NOW,
    );
    const status = meetingMinutesStatus(summary);
    expect(status?.status).toBe('overdue');
    expect(status?.deadline).toBe(summary.missed[0]!.postBy);
  });

  it('is unsatisfied with NO deadline when minutes are missing: no approval deadline is invented', () => {
    const summary = summarizeMeetingMinutes(
      [board({ startsAt: daysFromNow(-40) }), board({ startsAt: daysFromNow(-10) })],
      NOW,
    );
    expect(meetingMinutesStatus(summary)).toEqual({ status: 'unsatisfied', deadline: null, postedAt: null });
  });

  it('is satisfied when every due meeting has minutes on time', () => {
    const summary = summarizeMeetingMinutes(
      [board({ startsAt: daysFromNow(-40), ...posted(10, 1) }), board({ startsAt: daysFromNow(-10) })],
      NOW,
    );
    expect(meetingMinutesStatus(summary)?.status).toBe('satisfied');
  });

  it('says nothing when no minutes are due yet', () => {
    expect(meetingMinutesStatus(summarizeMeetingMinutes([board({ startsAt: daysFromNow(-3) })], NOW))).toBeNull();
    expect(meetingMinutesStatus(summarizeMeetingMinutes([], NOW))).toBeNull();
  });
});

describe('toMinutesInputs', () => {
  const scoring = (over: Partial<ComplianceScoringMeeting>): ComplianceScoringMeeting => ({
    id: 1,
    title: 'Board',
    meetingType: 'board',
    startsAt: daysFromNow(-10),
    noticePostedAt: null,
    minutesApprovedAt: daysFromNow(-1),
    minutesDocumentId: null,
    ...over,
  });

  it('joins the minutes document and reads its approval date', () => {
    const receivedAt = daysFromNow(-5);
    const [input] = toMinutesInputs(
      [scoring({ minutesDocumentId: 7 })],
      new Map([[7, { deletedAt: null, isDraft: false, receivedAt }]]),
    );
    expect(input!.minutesDocument).toEqual({ receivedAt, available: true });
    expect(input!.minutesPostedAt).toEqual(daysFromNow(-1));
  });

  it('marks a named document that is missing, deleted or a draft as not available', () => {
    const docs = new Map([
      [8, { deletedAt: daysFromNow(-1), isDraft: false }],
      [9, { deletedAt: null, isDraft: true }],
    ]);
    const inputs = toMinutesInputs(
      [scoring({ minutesDocumentId: 7 }), scoring({ minutesDocumentId: 8 }), scoring({ minutesDocumentId: 9 })],
      docs,
    );
    expect(inputs.map((i) => i.minutesDocument?.available)).toEqual([false, false, false]);
  });

  it('leaves minutes posted before the column existed with no document', () => {
    expect(toMinutesInputs([scoring({})], new Map())[0]!.minutesDocument).toBeNull();
  });
});

describe('withDerivedStatus on the minutes row', () => {
  const minutesRow = {
    id: 1,
    templateKey: '718_minutes_rolling_12m',
    isApplicable: true,
    documentId: 9,
    documentPostedAt: daysFromNow(-20).toISOString(),
    deadline: null,
    rollingWindow: { months: 12 },
  };
  const docs = new Map([[9, { deletedAt: null, isDraft: false }]]);
  const missing = summarizeMeetingMinutes(
    [board({ startsAt: daysFromNow(-40) }), board({ startsAt: daysFromNow(-10) })],
    NOW,
  );

  it('one linked minutes document no longer satisfies the row once a meeting lacks minutes', () => {
    // Control: without meetings, the linked document satisfies it, as before.
    expect(withDerivedStatus(minutesRow, docs, true, null, NOW)['status']).toBe('satisfied');
    const derived = withDerivedStatus(minutesRow, docs, true, { notices: null, minutes: missing }, NOW);
    expect(derived['status']).toBe('unsatisfied');
    expect(derived['meetingMinutes']).toBe(missing);
    expect(derived['clock']).toMatchObject({ state: 'no_clock', deadline: null, basis: 'statute' });
  });

  it('marks a late posting met-late and carries the missed deadline', () => {
    const late = summarizeMeetingMinutes(
      [board({ startsAt: daysFromNow(-90), ...posted(80, 45) }), board({ startsAt: daysFromNow(-10) })],
      NOW,
    );
    const derived = withDerivedStatus(minutesRow, docs, true, { notices: null, minutes: late }, NOW);
    expect(derived['status']).toBe('overdue');
    expect(derived['deadline']).toBe(late.missed[0]!.postBy);
    expect(derived['clock']).toMatchObject({
      state: 'met_late',
      deadline: late.missed[0]!.postBy,
      postedAt: late.missed[0]!.minutesPostedAt,
    });
  });

  it('labels the HOA minutes clock a product default', () => {
    const derived = withDerivedStatus(
      { ...minutesRow, templateKey: '720_minutes_rolling_12m' },
      docs,
      true,
      { notices: null, minutes: missing },
      NOW,
    );
    expect(derived['clock']).toMatchObject({ basis: 'product_default' });
  });

  it('leaves every other row alone, and respects "doesn\'t apply" and the size threshold', () => {
    const other = withDerivedStatus({ ...minutesRow, templateKey: '718_bylaws', rollingWindow: null }, docs, true, {
      notices: null,
      minutes: missing,
    }, NOW);
    expect(other['status']).toBe('satisfied');
    expect(other).not.toHaveProperty('meetingMinutes');
    expect(
      withDerivedStatus({ ...minutesRow, isApplicable: false }, docs, true, { notices: null, minutes: missing }, NOW)[
        'status'
      ],
    ).toBe('not_applicable');
    expect(withDerivedStatus(minutesRow, docs, false, { notices: null, minutes: missing }, NOW)['status']).toBe(
      'satisfied',
    );
  });

  it('keeps the document status when no minutes are due yet', () => {
    const quiet = summarizeMeetingMinutes([board({ startsAt: daysFromNow(-3) })], NOW);
    expect(withDerivedStatus(minutesRow, docs, true, { notices: null, minutes: quiet }, NOW)['status']).toBe(
      'satisfied',
    );
  });
});
