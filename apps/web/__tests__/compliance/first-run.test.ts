import { describe, expect, it } from 'vitest';
import { daysUntil, firstRunGroup, groupFirstRun, isComplianceFirstRun, type FirstRunItem } from '@/lib/compliance/first-run';

const item = (over: Partial<FirstRunItem>): FirstRunItem => ({
  id: 1,
  templateKey: '718_x',
  title: 'X',
  status: 'unsatisfied',
  documentId: null,
  ...over,
});

describe('firstRunGroup precedence (plan D17)', () => {
  it('conditional beats a deadline and a rolling window', () => {
    expect(firstRunGroup(item({ isConditional: true, deadline: '2099-01-01T00:00:00Z' }))).toBe('conditional');
    expect(firstRunGroup(item({ isConditional: true, rollingWindow: { months: 12 } }))).toBe('conditional');
  });
  it('a deadline beats a rolling window; neither means post once', () => {
    expect(firstRunGroup(item({ deadline: '2099-01-01T00:00:00Z', rollingWindow: { months: 12 } }))).toBe('due');
    expect(firstRunGroup(item({ rollingWindow: { months: 12 } }))).toBe('rolling');
    expect(firstRunGroup(item({}))).toBe('once');
  });
});

describe('isComplianceFirstRun', () => {
  it('holds while nothing is posted and nothing is overdue', () => {
    expect(isComplianceFirstRun([item({})])).toBe(true);
    expect(isComplianceFirstRun([item({ documentId: 5, documentState: 'posted' })])).toBe(false);
    expect(isComplianceFirstRun([item({ status: 'overdue' })])).toBe(false);
    expect(isComplianceFirstRun([])).toBe(false);
  });
  it('a draft-linked record is not posted', () => {
    expect(isComplianceFirstRun([item({ documentId: 5, documentState: 'draft' })])).toBe(true);
  });
});

describe('groupFirstRun', () => {
  it('leaves out records marked as not applying and finds the first deadline', () => {
    const g = groupFirstRun([
      item({ id: 1, deadline: '2099-02-01T00:00:00Z' }),
      item({ id: 2, deadline: '2099-01-01T00:00:00Z' }),
      item({ id: 3, isConditional: true, isApplicable: false }),
    ]);
    expect(g.required).toBe(2);
    expect(g.conditional).toHaveLength(0);
    expect(g.firstDeadline).toBe('2099-01-01T00:00:00Z');
  });
});

describe('daysUntil', () => {
  it('rounds up partial days and never goes below zero', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    expect(daysUntil('2026-12-20T12:00:00Z', now)).toBe(30);
    expect(daysUntil('2026-11-21T00:00:00Z', now)).toBe(1);
    expect(daysUntil('2026-11-01T00:00:00Z', now)).toBe(0);
  });
});
