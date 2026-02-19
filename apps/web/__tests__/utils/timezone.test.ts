import { describe, expect, it } from 'vitest';
import { resolveTimezone } from '@/lib/utils/timezone';

describe('resolveTimezone', () => {
  it('returns default for undefined', () => {
    expect(resolveTimezone(undefined)).toBe('America/New_York');
  });

  it('returns default for null', () => {
    expect(resolveTimezone(null)).toBe('America/New_York');
  });

  it('returns default for empty string', () => {
    expect(resolveTimezone('')).toBe('America/New_York');
  });

  it('returns default for an invalid IANA timezone string', () => {
    expect(resolveTimezone('Invalid/Zone')).toBe('America/New_York');
  });

  it('returns default for a plausible but invalid string', () => {
    expect(resolveTimezone('America/Fake')).toBe('America/New_York');
  });

  it('returns America/New_York unchanged', () => {
    expect(resolveTimezone('America/New_York')).toBe('America/New_York');
  });

  it('returns a valid non-Eastern timezone unchanged', () => {
    expect(resolveTimezone('America/Chicago')).toBe('America/Chicago');
  });

  it('returns a valid international timezone unchanged', () => {
    expect(resolveTimezone('Europe/London')).toBe('Europe/London');
  });
});
