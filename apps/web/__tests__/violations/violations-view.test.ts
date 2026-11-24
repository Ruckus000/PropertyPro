import { describe, expect, it } from 'vitest';
import type { ViolationStatus } from '@propertypro/db';
import { canActAsBoard } from '@/lib/db/access-control';
import { pickTab, reviewFigures, violationsTabs } from '@/lib/violations/violations-view';

const rows = (...s: ViolationStatus[]) => s.map((status) => ({ status }));
const MIX = rows('reported', 'reported', 'noticed', 'fined', 'resolved', 'dismissed');

describe('violationsTabs', () => {
  it('gives a manager Review only', () => {
    expect(violationsTabs({ isAdmin: true, role: 'property_manager', designation: null })).toEqual(['review']);
  });
  it('gives a board member Review then Mine', () => {
    expect(violationsTabs({ isAdmin: false, role: 'resident', designation: 'board_member' })).toEqual(['review', 'mine']);
  });
  it('gives a plain resident Mine only', () => {
    expect(violationsTabs({ isAdmin: false, role: 'resident', designation: null })).toEqual(['mine']);
  });
  it('rejects an unknown designation string', () => {
    expect(violationsTabs({ isAdmin: false, role: 'resident', designation: 'president' })).toEqual(['mine']);
  });
});

describe('pickTab', () => {
  it('falls back when the requested tab is not allowed', () => {
    expect(pickTab('review', ['mine'])).toBe('mine');
  });
  it('defaults to the first allowed tab', () => {
    expect(pickTab(undefined, ['review', 'mine'])).toBe('review');
  });
  it('honours an allowed request', () => {
    expect(pickTab('mine', ['review', 'mine'])).toBe('mine');
  });
});

describe('reviewFigures', () => {
  it('counts with fines off and hides the Fined filter', () => {
    const f = reviewFigures(MIX, false);
    expect(f.open).toBe(4);
    expect(f.waitingForNotice).toBe(2);
    expect(f.hearings).toBe(0);
    expect(f.counts.all).toBe(6);
    expect(f.counts.fined).toBe(1);
    expect(f.filters).not.toContain('fined');
    expect(f.filters).toHaveLength(5);
  });
  it('offers Fined with fines on', () => {
    const f = reviewFigures(MIX, true);
    expect(f.filters).toContain('fined');
    expect(f.filters).toHaveLength(6);
  });
  it('zero-fills every status', () => {
    const f = reviewFigures([], true);
    expect(f.counts).toEqual({
      all: 0, reported: 0, noticed: 0, hearing_scheduled: 0, fined: 0, resolved: 0, dismissed: 0,
    });
  });
  it('counts hearings', () => {
    expect(reviewFigures(rows('hearing_scheduled', 'hearing_scheduled'), true).hearings).toBe(2);
  });
});

describe('violationsTabs parity with canActAsBoard', () => {
  const roles = ['resident', 'property_manager', 'root_manager'] as const;
  const designations = [null, 'board_member', 'board_president'] as const;
  for (const role of roles)
    for (const isAdmin of [true, false])
      for (const designation of designations)
        it(`${role} isAdmin=${isAdmin} designation=${designation}`, () => {
          const m = { role, isAdmin, designation };
          expect(violationsTabs(m).includes('review')).toBe(canActAsBoard(m));
        });
});

describe('reviewFigures with an unknown status', () => {
  it('skips the row entirely: no NaN, and it is not counted in all', () => {
    const f = reviewFigures(
      [...rows('reported', 'noticed'), { status: 'bogus' as unknown as ViolationStatus }],
      false,
    );
    expect(f.counts.all).toBe(2);
    expect(f.counts.reported).toBe(1);
    expect(f.open).toBe(2);
    expect(Object.values(f.counts).some(Number.isNaN)).toBe(false);
  });
});
