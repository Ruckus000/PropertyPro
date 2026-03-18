import { describe, expect, it } from 'vitest';
import { MEETING_TYPE_TOKENS } from '../../src/lib/calendar/event-types';

describe('meeting type token map', () => {
  it('covers all five meeting types', () => {
    expect(MEETING_TYPE_TOKENS).toEqual({
      board: { badgeVariant: 'info', label: 'Board' },
      annual: { badgeVariant: 'success', label: 'Annual' },
      special: { badgeVariant: 'warning', label: 'Special' },
      budget: { badgeVariant: 'neutral', label: 'Budget' },
      committee: { badgeVariant: 'info', label: 'Committee' },
    });
  });
});
