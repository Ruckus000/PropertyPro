/**
 * The meeting-notice checklist row, scored per meeting (audit 2026-11-05, H-4).
 *
 * Before: any one document titled "notice" or "agenda" satisfied the row for a
 * year, and an empty row was never overdue. After: each meeting in the past 12
 * months counts, from `meetings.notice_posted_at`.
 */
import { describe, expect, it } from 'vitest';
import {
  meetingNoticeStatus,
  summarizeMeetingNotices,
  type MeetingNoticeInput,
} from '@/lib/compliance/meeting-notice-status';
import { withDerivedStatus } from '@/lib/compliance/derive-checklist-status';

const NOW = new Date('2026-11-21T15:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function meeting(over: Partial<MeetingNoticeInput> & { startsAt: Date }): MeetingNoticeInput {
  return { id: 1, title: 'Annual Meeting', meetingType: 'annual', noticePostedAt: null, ...over };
}

const daysFromNow = (d: number) => new Date(NOW.getTime() + d * DAY);

describe('summarizeMeetingNotices', () => {
  it('counts an owner meeting noticed 14 days ahead as on time', () => {
    const startsAt = daysFromNow(-30);
    const summary = summarizeMeetingNotices(
      [meeting({ startsAt, noticePostedAt: new Date(startsAt.getTime() - 14 * DAY) })],
      'condo_718',
      NOW,
    );
    expect(summary).toMatchObject({ dueCount: 1, onTimeCount: 1, missed: [], nextDue: null });
  });

  it('counts an owner meeting noticed 13 days ahead as missed, with the post-by it missed', () => {
    const startsAt = daysFromNow(-30);
    const postedAt = new Date(startsAt.getTime() - 13 * DAY);
    const summary = summarizeMeetingNotices([meeting({ startsAt, noticePostedAt: postedAt })], 'condo_718', NOW);
    expect(summary.onTimeCount).toBe(0);
    expect(summary.missed).toEqual([
      {
        meetingId: 1,
        title: 'Annual Meeting',
        startsAt: startsAt.toISOString(),
        postBy: new Date(startsAt.getTime() - 14 * DAY).toISOString(),
        noticePostedAt: postedAt.toISOString(),
      },
    ]);
  });

  it('gives a board meeting 48 hours, not 14 days', () => {
    const startsAt = daysFromNow(-10);
    const summary = summarizeMeetingNotices(
      [meeting({ meetingType: 'board', startsAt, noticePostedAt: new Date(startsAt.getTime() - 48 * HOUR) })],
      'hoa_720',
      NOW,
    );
    expect(summary).toMatchObject({ dueCount: 1, onTimeCount: 1 });
  });

  it('counts a past meeting with no recorded notice as missed', () => {
    const summary = summarizeMeetingNotices([meeting({ startsAt: daysFromNow(-3) })], 'condo_718', NOW);
    expect(summary.missed).toHaveLength(1);
    expect(summary.missed[0]?.noticePostedAt).toBeNull();
  });

  it('ignores meetings older than 12 months', () => {
    const summary = summarizeMeetingNotices([meeting({ startsAt: daysFromNow(-400) })], 'condo_718', NOW);
    expect(summary).toMatchObject({ dueCount: 0, missed: [] });
  });

  it('counts an upcoming meeting already inside its window, unposted, as missed', () => {
    const summary = summarizeMeetingNotices([meeting({ startsAt: daysFromNow(10) })], 'condo_718', NOW);
    expect(summary).toMatchObject({ dueCount: 1, onTimeCount: 0 });
    expect(summary.missed).toHaveLength(1);
  });

  it('names the soonest unposted upcoming notice as nextDue, and does not score it', () => {
    const summary = summarizeMeetingNotices(
      [
        meeting({ id: 1, startsAt: daysFromNow(40) }),
        meeting({ id: 2, meetingType: 'board', startsAt: daysFromNow(5) }),
      ],
      'condo_718',
      NOW,
    );
    expect(summary.dueCount).toBe(0);
    expect(summary.nextDue).toMatchObject({ meetingId: 2, postBy: daysFromNow(3).toISOString() });
  });
});

describe('meetingNoticeStatus', () => {
  const onTime = meeting({ startsAt: daysFromNow(-30), noticePostedAt: daysFromNow(-45) });

  it('is overdue when any notice was missed', () => {
    const summary = summarizeMeetingNotices([onTime, meeting({ id: 2, startsAt: daysFromNow(-2) })], 'condo_718', NOW);
    expect(meetingNoticeStatus(summary, NOW)?.status).toBe('overdue');
  });

  it('is unsatisfied, with the deadline, when the next notice is due within 7 days', () => {
    const summary = summarizeMeetingNotices(
      [onTime, meeting({ id: 2, meetingType: 'board', startsAt: daysFromNow(6) })],
      'condo_718',
      NOW,
    );
    expect(meetingNoticeStatus(summary, NOW)).toEqual({
      status: 'unsatisfied',
      deadline: daysFromNow(4).toISOString(),
    });
  });

  it('is satisfied when every due notice was on time and the next is more than 7 days off', () => {
    const summary = summarizeMeetingNotices([onTime, meeting({ id: 2, startsAt: daysFromNow(40) })], 'condo_718', NOW);
    expect(meetingNoticeStatus(summary, NOW)?.status).toBe('satisfied');
  });

  it('says nothing when no notice has come due', () => {
    const summary = summarizeMeetingNotices([meeting({ startsAt: daysFromNow(40) })], 'condo_718', NOW);
    expect(meetingNoticeStatus(summary, NOW)).toBeNull();
  });
});

describe('withDerivedStatus on a meeting-notice row', () => {
  const linkedRow = {
    templateKey: '718_meeting_notices',
    isApplicable: true,
    documentId: 9,
    documentPostedAt: daysFromNow(-20).toISOString(),
    deadline: null,
    rollingWindow: { months: 12 },
  };
  const docs = new Map([[9, { deletedAt: null, isDraft: false }]]);
  const missed = summarizeMeetingNotices([meeting({ startsAt: daysFromNow(-3) })], 'condo_718', NOW);

  it('a linked "notice" document no longer satisfies the row once a meeting missed its notice', () => {
    // Control: without meetings, the document still satisfies it.
    expect(withDerivedStatus(linkedRow, docs, true, null, NOW)['status']).toBe('satisfied');
    const derived = withDerivedStatus(linkedRow, docs, true, missed, NOW);
    expect(derived['status']).toBe('overdue');
    expect(derived['meetingNotices']).toBe(missed);
  });

  it('leaves every other row alone', () => {
    const other = { ...linkedRow, templateKey: '718_budget' };
    const derived = withDerivedStatus(other, docs, true, missed, NOW);
    expect(derived['status']).toBe('satisfied');
    expect(derived).not.toHaveProperty('meetingNotices');
  });

  it('does not override "doesn\'t apply" or a community below the size threshold', () => {
    expect(withDerivedStatus({ ...linkedRow, isApplicable: false }, docs, true, missed, NOW)['status']).toBe(
      'not_applicable',
    );
    expect(withDerivedStatus(linkedRow, docs, false, missed, NOW)['status']).toBe('satisfied');
  });

  it('keeps the document status when no meeting notice has come due', () => {
    const quiet = summarizeMeetingNotices([], 'condo_718', NOW);
    expect(withDerivedStatus(linkedRow, docs, true, quiet, NOW)['status']).toBe('satisfied');
  });
});
