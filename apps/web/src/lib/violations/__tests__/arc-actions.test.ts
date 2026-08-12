/**
 * `allowedArcActions` must agree with the service, which is the authority.
 *
 * The pairs asserted below mirror the throw-branches in
 * `violations-service.ts`:
 *   - review:   rejects unless status is 'submitted' | 'under_review'
 *   - decide:   rejects 'withdrawn', 'approved', 'denied'
 *   - withdraw: rejects 'approved', 'denied'
 *
 * If someone widens or narrows one of those branches without touching this
 * table, the UI starts offering a button that 422s — or hiding one that would
 * have worked. That is the whole failure mode this file guards.
 */
import { describe, expect, it } from 'vitest';
import type { ArcSubmissionStatus } from '@/hooks/use-arc';
import { allowedArcActions, isArcActionAllowed, isArcDecided } from '../arc-actions';

const ALL_STATUSES: ArcSubmissionStatus[] = [
  'submitted',
  'under_review',
  'approved',
  'denied',
  'withdrawn',
];

describe('allowedArcActions', () => {
  it('lets a reviewer act on a submitted application', () => {
    expect(allowedArcActions('submitted')).toEqual(['review', 'decide', 'withdraw']);
  });

  it('lets review be re-entered while under review, so notes can be amended before deciding', () => {
    expect(allowedArcActions('under_review')).toEqual(['review', 'decide', 'withdraw']);
  });

  it.each(['approved', 'denied'] as const)('offers nothing once %s — the service refuses', (status) => {
    expect(allowedArcActions(status)).toEqual([]);
    expect(isArcDecided(status)).toBe(true);
  });

  it('offers nothing on a withdrawn application', () => {
    // The service would technically permit withdrawing again (it blocks only
    // approved/denied), but re-withdrawing is a no-op nobody wants offered.
    expect(allowedArcActions('withdrawn')).toEqual([]);
    expect(isArcDecided('withdrawn')).toBe(false);
  });

  it('never offers review or decide on a terminal status', () => {
    // Stated as an invariant rather than per-status, so a new status added to
    // the union without a considered entry cannot quietly become actionable.
    for (const status of ALL_STATUSES) {
      const actionable = status === 'submitted' || status === 'under_review';
      expect(isArcActionAllowed(status, 'review')).toBe(actionable);
      expect(isArcActionAllowed(status, 'decide')).toBe(actionable);
    }
  });

  it('covers every status in the union', () => {
    // `allowedArcActions` falls back to `[]` for an unknown key, which would
    // silently hide every action for a status someone forgot to add. This
    // fails loudly instead.
    for (const status of ALL_STATUSES) {
      expect(allowedArcActions(status)).toBeInstanceOf(Array);
    }
    expect(ALL_STATUSES).toHaveLength(5);
  });
});
