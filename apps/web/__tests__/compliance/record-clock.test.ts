/**
 * Each record judged against its own 30-day clock, and yearly records that age
 * out (audit 2026-11-05, H-2). Also the clock each row carries, in the design
 * direction's closed state set (page-anatomy spec §12).
 */
import { describe, expect, it } from 'vitest';
import {
  buildComplianceSummary,
  calculateComplianceClock,
  needsAttention,
} from '@/lib/utils/compliance-calculator';
import { withDerivedStatus } from '@/lib/compliance/derive-checklist-status';
import { summarizeMeetingNotices } from '@/lib/compliance/meeting-notice-status';
import { summarizeRecords } from '@/lib/site-editor/records-status';
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';

const NOW = new Date('2026-11-21T15:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * DAY);

describe('calculateComplianceClock: a linked record', () => {
  it('is met when posted within 30 days of being received', () => {
    const receivedAt = daysFromNow(-40);
    const postedAt = daysFromNow(-15);
    expect(
      calculateComplianceClock({ documentId: 1, documentReceivedAt: receivedAt, documentPublishedAt: postedAt, now: NOW }),
    ).toEqual({
      status: 'satisfied',
      clock: {
        state: 'met',
        deadline: new Date(receivedAt.getTime() + 30 * DAY).toISOString(),
        postedAt: postedAt.toISOString(),
        basis: 'statute',
      },
    });
  });

  it('is met late — and overdue — when posted after its own deadline', () => {
    const receivedAt = daysFromNow(-100);
    const result = calculateComplianceClock({
      documentId: 1,
      documentReceivedAt: receivedAt,
      documentPublishedAt: daysFromNow(-60),
      now: NOW,
    });
    expect(result.status).toBe('overdue');
    expect(result.clock).toMatchObject({
      state: 'met_late',
      deadline: new Date(receivedAt.getTime() + 30 * DAY).toISOString(),
      postedAt: daysFromNow(-60).toISOString(),
    });
  });

  it('stops counting a late posting against the score a year after it was posted', () => {
    const result = calculateComplianceClock({
      documentId: 1,
      documentReceivedAt: daysFromNow(-500),
      documentPublishedAt: daysFromNow(-400),
      now: NOW,
    });
    expect(result.status).toBe('satisfied');
    expect(result.clock.state).toBe('met_late');
  });

  it('judges the document\'s own posted_at, not the time it was linked to the row', () => {
    // Linked yesterday (documentPostedAt), but owners could open it 10 days
    // after it was received: on time.
    const result = calculateComplianceClock({
      documentId: 1,
      documentReceivedAt: daysFromNow(-50),
      documentPublishedAt: daysFromNow(-40),
      documentPostedAt: daysFromNow(-1),
      deadline: daysFromNow(-200), // the row's old setup clock, long past
      now: NOW,
    });
    expect(result.status).toBe('satisfied');
  });

  it('claims no lateness for a record with no received date, whatever the setup clock says', () => {
    const result = calculateComplianceClock({
      documentId: 1,
      documentPublishedAt: daysFromNow(-1),
      deadline: daysFromNow(-200),
      now: NOW,
    });
    expect(result).toEqual({
      status: 'satisfied',
      clock: { state: 'met', deadline: null, postedAt: daysFromNow(-1).toISOString(), basis: 'statute' },
    });
  });
});

describe('calculateComplianceClock: yearly records', () => {
  it('a yearly record over a year old is out of its window: unsatisfied, with no invented deadline', () => {
    const result = calculateComplianceClock({
      documentId: 1,
      documentReceivedAt: daysFromNow(-400),
      documentPublishedAt: daysFromNow(-390),
      yearlyCycle: true,
      now: NOW,
    });
    expect(result.status).toBe('unsatisfied');
    expect(result.clock).toMatchObject({ state: 'out_of_window', deadline: null });
  });

  it('a yearly record posted late stays overdue (met late), even when its received date is over a year old', () => {
    // Received 13 months ago, posted 2 months ago: late. Moving a received
    // date earlier must never trade "overdue" for a quieter "out of date".
    const result = calculateComplianceClock({
      documentId: 1,
      documentReceivedAt: daysFromNow(-395),
      documentPublishedAt: daysFromNow(-60),
      yearlyCycle: true,
      now: NOW,
    });
    expect(result.status).toBe('overdue');
    expect(result.clock.state).toBe('met_late');
  });

  it('control: the same record without a yearly cycle stays met', () => {
    expect(
      calculateComplianceClock({
        documentId: 1,
        documentReceivedAt: daysFromNow(-400),
        documentPublishedAt: daysFromNow(-390),
        now: NOW,
      }).status,
    ).toBe('satisfied');
  });

  it('a yearly record inside its year is current', () => {
    expect(
      calculateComplianceClock({
        documentId: 1,
        documentReceivedAt: daysFromNow(-300),
        documentPublishedAt: daysFromNow(-290),
        yearlyCycle: true,
        now: NOW,
      }).status,
    ).toBe('satisfied');
  });

  it('falls back to the posting date when no received date is recorded', () => {
    expect(
      calculateComplianceClock({
        documentId: 1,
        documentPublishedAt: daysFromNow(-400),
        yearlyCycle: true,
        now: NOW,
      }).clock.state,
    ).toBe('out_of_window');
  });
});

describe('calculateComplianceClock: nothing linked, and exact time', () => {
  it('open while the setup deadline is ahead, overdue one millisecond after it', () => {
    const deadline = new Date(NOW.getTime());
    expect(calculateComplianceClock({ deadline, now: NOW }).clock.state).toBe('open');
    expect(calculateComplianceClock({ deadline, now: new Date(NOW.getTime() + 1) }).clock).toMatchObject({
      state: 'overdue',
      deadline: deadline.toISOString(),
    });
  });

  it('no clock when there is no deadline at all, and not_applicable when marked so', () => {
    expect(calculateComplianceClock({ now: NOW }).clock.state).toBe('no_clock');
    expect(calculateComplianceClock({ isApplicable: false, documentId: 1, now: NOW })).toMatchObject({
      status: 'not_applicable',
      clock: { state: 'not_applicable' },
    });
  });
});

describe('withDerivedStatus: the record clock in context', () => {
  const budgetRow = {
    id: 1,
    templateKey: '718_budget',
    title: 'Annual Budget',
    category: 'financial_records',
    isApplicable: true,
    documentId: 5,
    documentPostedAt: daysFromNow(-390).toISOString(),
    deadline: daysFromNow(-500).toISOString(),
    rollingWindow: null,
  };
  const oldBudget = new Map([
    [5, { deletedAt: null, isDraft: false, postedAt: daysFromNow(-390), receivedAt: daysFromNow(-400) }],
  ]);

  it('applies the yearly cycle to the budget, insurance and financial report keys', () => {
    for (const templateKey of ['718_budget', '718_insurance', '720_financial_report']) {
      const derived = withDerivedStatus({ ...budgetRow, templateKey }, oldBudget, true, null, NOW);
      expect(derived['status']).toBe('unsatisfied');
      expect((derived['clock'] as { state: string }).state).toBe('out_of_window');
      // Not last year's setup clock: no surface may read it as due or overdue.
      expect(derived['deadline']).toBeNull();
    }
  });

  it('control: an evergreen record with the same old file stays met', () => {
    const derived = withDerivedStatus({ ...budgetRow, templateKey: '718_bylaws' }, oldBudget, true, null, NOW);
    expect(derived['status']).toBe('satisfied');
  });

  it('runs no record clock and no yearly cycle below the size threshold', () => {
    const late = new Map([
      [5, { deletedAt: null, isDraft: false, postedAt: daysFromNow(-60), receivedAt: daysFromNow(-100) }],
    ]);
    expect(withDerivedStatus(budgetRow, oldBudget, false, null, NOW)['status']).toBe('satisfied');
    expect(withDerivedStatus({ ...budgetRow, templateKey: '718_bylaws' }, late, false, null, NOW)['status']).toBe(
      'satisfied',
    );
    // Control: above the threshold the same late record is overdue.
    expect(withDerivedStatus({ ...budgetRow, templateKey: '718_bylaws' }, late, true, null, NOW)['status']).toBe(
      'overdue',
    );
  });

  it('an overdue late record carries the deadline it missed, not the setup clock', () => {
    const receivedAt = daysFromNow(-100);
    const late = new Map([[5, { deletedAt: null, isDraft: false, postedAt: daysFromNow(-60), receivedAt }]]);
    const derived = withDerivedStatus({ ...budgetRow, templateKey: '718_bylaws' }, late, true, null, NOW);
    expect(derived['deadline']).toBe(new Date(receivedAt.getTime() + 30 * DAY).toISOString());
  });

  it('labels HOA document clocks a product default, and HOA meeting notices statutory', () => {
    const hoa = withDerivedStatus({ ...budgetRow, templateKey: '720_governing_docs' }, new Map(), true, null, NOW);
    expect((hoa['clock'] as { basis: string }).basis).toBe('product_default');
    const condo = withDerivedStatus({ ...budgetRow, templateKey: '718_bylaws' }, new Map(), true, null, NOW);
    expect((condo['clock'] as { basis: string }).basis).toBe('statute');
    const notices = withDerivedStatus(
      { ...budgetRow, templateKey: '720_meeting_notices', documentId: null },
      new Map(),
      true,
      {
        notices: summarizeMeetingNotices(
          [{ id: 1, title: 'Annual', meetingType: 'annual', startsAt: daysFromNow(-3), noticePostedAt: null }],
          'hoa_720',
          NOW,
        ),
        minutes: null,
      },
      NOW,
    );
    expect(notices['clock']).toMatchObject({ state: 'overdue', basis: 'statute' });
  });

  it('a notice recorded late is met late; one never recorded is overdue', () => {
    const startsAt = daysFromNow(-3);
    const recordedLate = new Date(startsAt.getTime() - 2 * DAY);
    const derive = (noticePostedAt: Date | null) =>
      withDerivedStatus(
        { ...budgetRow, templateKey: '718_meeting_notices', documentId: null },
        new Map(),
        true,
        {
          notices: summarizeMeetingNotices(
            [{ id: 1, title: 'Annual', meetingType: 'annual', startsAt, noticePostedAt }],
            'condo_718',
            NOW,
          ),
          minutes: null,
        },
        NOW,
      )['clock'];
    expect(derive(recordedLate)).toMatchObject({ state: 'met_late', postedAt: recordedLate.toISOString() });
    expect(derive(null)).toMatchObject({ state: 'overdue', postedAt: null });
  });
});

describe('out-of-window records surface as something to do', () => {
  const item = (over: Partial<ChecklistItemData>): ChecklistItemData => ({
    id: 1,
    templateKey: '718_budget',
    title: 'Annual Budget',
    category: 'financial_records',
    status: 'unsatisfied',
    documentId: 5,
    documentState: 'posted',
    deadline: null,
    clock: { state: 'out_of_window', deadline: null, postedAt: null, basis: 'statute' },
    ...over,
  });

  it('needs attention, and counts in the summary\'s attention count', () => {
    expect(needsAttention(item({}), NOW)).toBe(true);
    expect(buildComplianceSummary([item({})], NOW).attentionCount).toBe(1);
    // Control: an unsatisfied row with no clock and no deadline does not.
    expect(
      needsAttention(item({ templateKey: '718_bylaws', clock: { state: 'no_clock', deadline: null, postedAt: null, basis: 'statute' } }), NOW),
    ).toBe(false);
  });

  it('reads "out of date" on the website records summary, not "up to date"', () => {
    const [group] = summarizeRecords([item({})]);
    expect(group!.status).toBe('out_of_date');
  });
});
