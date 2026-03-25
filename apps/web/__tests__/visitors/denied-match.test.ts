import { describe, expect, it } from 'vitest';
import { filterDeniedVisitorMatches } from '../../src/lib/visitors/visitor-logic';

const deniedRows = [
  { id: 1, fullName: 'Jane Smith', vehiclePlate: 'ABC123', isActive: true },
  { id: 2, fullName: 'jane smith', vehiclePlate: null, isActive: true },
  { id: 3, fullName: 'Alan Guest', vehiclePlate: 'XYZ789', isActive: false },
  { id: 4, fullName: 'Taylor Vendor', vehiclePlate: 'TRK404', isActive: true },
];

describe('filterDeniedVisitorMatches', () => {
  it('matches exact name case-insensitively', () => {
    expect(filterDeniedVisitorMatches(deniedRows, 'JANE SMITH', null).map((row) => row.id)).toEqual([1, 2]);
  });

  it('matches vehicle plate case-insensitively', () => {
    expect(filterDeniedVisitorMatches(deniedRows, null, 'abc123').map((row) => row.id)).toEqual([1]);
  });

  it('returns no matches when name and plate do not match', () => {
    expect(filterDeniedVisitorMatches(deniedRows, 'No Match', 'NONE')).toEqual([]);
  });

  it('returns multiple matches when more than one row qualifies', () => {
    expect(filterDeniedVisitorMatches(deniedRows, 'Jane Smith', 'ABC123')).toHaveLength(2);
  });

  it('filters inactive entries out even if they would otherwise match', () => {
    expect(filterDeniedVisitorMatches(deniedRows, 'Alan Guest', 'XYZ789')).toEqual([]);
  });
});
