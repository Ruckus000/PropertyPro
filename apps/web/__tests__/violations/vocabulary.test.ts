import { describe, expect, it } from 'vitest';
import {
  OPEN_STATUSES,
  SEVERITY_OPTIONS,
  VIOLATION_CATEGORIES,
  VIOLATION_STATUS_LABELS,
  categoryLabel,
  violationGlyph,
} from '@/lib/violations/vocabulary';

describe('violation vocabulary', () => {
  it.each([
    ['reported', 'attention'],
    ['noticed', 'in-progress'],
    ['hearing_scheduled', 'in-progress'],
    ['fined', 'overdue'],
    ['resolved', 'done'],
    ['dismissed', 'not-started'],
  ] as const)('%s maps to %s glyph', (status, glyph) => {
    expect(violationGlyph(status)).toBe(glyph);
  });

  it('open statuses exclude resolved and dismissed', () => {
    expect([...OPEN_STATUSES].sort()).toEqual(['fined', 'hearing_scheduled', 'noticed', 'reported']);
  });

  it('categories match the report form, in order', () => {
    expect(VIOLATION_CATEGORIES.map((c) => c.value)).toEqual([
      'noise',
      'parking',
      'unauthorized_modification',
      'pet',
      'trash',
      'common_area_misuse',
      'landscaping',
      'property_damage',
      'other',
    ]);
  });

  it('unknown category falls back to the raw value', () => {
    expect(categoryLabel('xyz')).toBe('xyz');
    expect(categoryLabel('pet')).toBe('Pet Violation');
  });

  it('status labels cover all six statuses', () => {
    expect(VIOLATION_STATUS_LABELS).toEqual({
      reported: 'Reported',
      noticed: 'Noticed',
      hearing_scheduled: 'Hearing scheduled',
      fined: 'Fined',
      resolved: 'Resolved',
      dismissed: 'Dismissed',
    });
  });

  it('severity options are Minor, Moderate, Major', () => {
    expect(SEVERITY_OPTIONS.map((o) => [o.value, o.label])).toEqual([
      ['minor', 'Minor'],
      ['moderate', 'Moderate'],
      ['major', 'Major'],
    ]);
  });
});
