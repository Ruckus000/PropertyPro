import { describe, expect, it } from 'vitest';
import { finingCommitteeIneligibility } from '../fining-committee';

const owner = { userId: 'u-1', role: 'resident', isUnitOwner: true, designation: null };

describe('finingCommitteeIneligibility', () => {
  it('admits an owner with no board seat who is not imposing the fine', () => {
    expect(finingCommitteeIneligibility(owner, 'actor')).toBeNull();
  });

  it('excludes board seats, non-owners, managers and the person imposing the fine', () => {
    expect(finingCommitteeIneligibility({ ...owner, designation: 'board_member' }, 'actor')).toBe('board_seat');
    expect(finingCommitteeIneligibility({ ...owner, designation: 'board_president' }, 'actor')).toBe('board_seat');
    expect(finingCommitteeIneligibility({ ...owner, isUnitOwner: false }, 'actor')).toBe('not_an_owner');
    expect(finingCommitteeIneligibility({ ...owner, role: 'property_manager', isUnitOwner: null }, 'actor')).toBe('not_an_owner');
    expect(finingCommitteeIneligibility(owner, 'u-1')).toBe('imposing_the_fine');
  });
});
