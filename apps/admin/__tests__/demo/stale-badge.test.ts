import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { staleBadge, isStaleDemo } from '@/lib/utils/stale-badge';

describe('staleBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('below every threshold: shows the true elapsed days, in green — not the 10+ badge', () => {
    // `staleBadge` used to end in an unconditional return of the 10+ badge,
    // with no branch for anything below the yellow threshold — so every row
    // said "10+ days" regardless of actual age. This is the regression
    // guard: a demo created today must show "0d", not "10+ days".
    const badge = staleBadge('2026-09-10T00:00:00.000Z'); // 0 days old
    expect(badge.label).toBe('0d');
    expect(badge.className).toContain('text-status-success');
    expect(badge.label).not.toContain('10+');
  });

  it('at 5 days: still below-threshold, still the true count', () => {
    const badge = staleBadge('2026-09-05T00:00:00.000Z');
    expect(badge.label).toBe('5d');
    expect(badge.className).toContain('text-status-success');
  });

  it('at exactly 10 days: the yellow 10+ badge', () => {
    const badge = staleBadge('2026-08-31T00:00:00.000Z');
    expect(badge.label).toBe('10+ days');
    expect(badge.className).toContain('text-status-warning');
  });

  it('at exactly 20 days: the orange 20+ badge', () => {
    const badge = staleBadge('2026-08-21T00:00:00.000Z');
    expect(badge.label).toBe('20+ days');
  });

  it('at exactly 30 days: the red 30+ badge', () => {
    const badge = staleBadge('2026-08-11T00:00:00.000Z');
    expect(badge.label).toBe('30+ days');
    expect(badge.className).toContain('text-status-danger');
  });

  it('agrees with isStaleDemo\'s cutoff — the below-threshold badge and the stale count are the same 10-day line', () => {
    const nineDaysOld = '2026-09-01T00:00:00.000Z';
    expect(isStaleDemo({ created_at: nineDaysOld })).toBe(false);
    expect(staleBadge(nineDaysOld).label).not.toContain('+');

    const tenDaysOld = '2026-08-31T00:00:00.000Z';
    expect(isStaleDemo({ created_at: tenDaysOld })).toBe(true);
    expect(staleBadge(tenDaysOld).label).toContain('10+');
  });
});
