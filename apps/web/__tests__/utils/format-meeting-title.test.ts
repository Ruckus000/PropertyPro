import { describe, expect, it } from 'vitest';
import { formatMeetingTitle } from '../../src/lib/utils/format-meeting-title';

describe('formatMeetingTitle', () => {
  it('removes seeded slug prefix and compliance suffix', () => {
    expect(formatMeetingTitle('sunset-condos Board Meeting (48-hour notice)')).toBe('Board Meeting');
  });

  it('preserves user-authored punctuation and casing', () => {
    expect(formatMeetingTitle('Q2 Budget + Reserve Study')).toBe('Q2 Budget + Reserve Study');
  });
});
