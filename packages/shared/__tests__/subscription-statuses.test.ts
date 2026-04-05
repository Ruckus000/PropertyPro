import { describe, expect, it } from 'vitest';
import {
  ALL_STATUSES,
  BILLABLE_STATUSES,
  TRIAL_STATUSES,
  CHURNED_STATUSES,
} from '../src/constants/subscription-statuses';

describe('subscription-statuses', () => {
  it('ALL_STATUSES contains all 7 known values', () => {
    expect(new Set(ALL_STATUSES)).toEqual(
      new Set([
        'active', 'trialing', 'past_due',
        'canceled', 'expired', 'unpaid', 'incomplete_expired',
      ]),
    );
  });

  it('BILLABLE, TRIAL, and CHURNED are disjoint subsets of ALL_STATUSES', () => {
    const billable = new Set(BILLABLE_STATUSES);
    const trial = new Set(TRIAL_STATUSES);
    const churned = new Set(CHURNED_STATUSES);
    for (const s of billable) expect(trial.has(s)).toBe(false);
    for (const s of billable) expect(churned.has(s)).toBe(false);
    for (const s of trial) expect(churned.has(s)).toBe(false);
    for (const s of [...billable, ...trial, ...churned]) {
      expect(ALL_STATUSES).toContain(s);
    }
  });

  it('union of subsets equals ALL_STATUSES', () => {
    const union = new Set([...BILLABLE_STATUSES, ...TRIAL_STATUSES, ...CHURNED_STATUSES]);
    expect(union).toEqual(new Set(ALL_STATUSES));
  });
});
