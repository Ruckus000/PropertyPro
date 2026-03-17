import { describe, expect, it } from 'vitest';
import {
  normalizeToE164,
  isValidE164,
  maskPhone,
  formatPhoneDisplay,
  phoneE164Schema,
  phoneE164OptionalSchema,
} from '@/lib/utils/phone';

describe('normalizeToE164', () => {
  it('normalizes (XXX) XXX-XXXX format', () => {
    expect(normalizeToE164('(305) 555-1234')).toBe('+13055551234');
  });

  it('normalizes XXX-XXX-XXXX format', () => {
    expect(normalizeToE164('305-555-1234')).toBe('+13055551234');
  });

  it('normalizes XXX.XXX.XXXX format', () => {
    expect(normalizeToE164('305.555.1234')).toBe('+13055551234');
  });

  it('normalizes 10 bare digits', () => {
    expect(normalizeToE164('3055551234')).toBe('+13055551234');
  });

  it('normalizes 11 digits starting with 1', () => {
    expect(normalizeToE164('13055551234')).toBe('+13055551234');
  });

  it('passes through already-formatted E.164', () => {
    expect(normalizeToE164('+13055551234')).toBe('+13055551234');
  });

  it('trims whitespace', () => {
    expect(normalizeToE164('  (305) 555-1234  ')).toBe('+13055551234');
  });

  it('handles spaces between digits', () => {
    expect(normalizeToE164('305 555 1234')).toBe('+13055551234');
  });

  it('returns raw input for un-normalizable strings', () => {
    expect(normalizeToE164('12345')).toBe('12345');
    expect(normalizeToE164('abc')).toBe('abc');
    expect(normalizeToE164('')).toBe('');
  });
});

describe('isValidE164', () => {
  it('accepts valid US E.164 numbers', () => {
    expect(isValidE164('+13055551234')).toBe(true);
    expect(isValidE164('+19175551234')).toBe(true);
  });

  it('rejects numbers without +1 prefix', () => {
    expect(isValidE164('3055551234')).toBe(false);
    expect(isValidE164('13055551234')).toBe(false);
  });

  it('rejects wrong digit count', () => {
    expect(isValidE164('+1305555123')).toBe(false); // 9 digits
    expect(isValidE164('+130555512345')).toBe(false); // 11 digits
  });

  it('rejects non-US country codes', () => {
    expect(isValidE164('+443055551234')).toBe(false);
  });

  it('rejects empty and garbage', () => {
    expect(isValidE164('')).toBe(false);
    expect(isValidE164('not-a-phone')).toBe(false);
  });
});

describe('maskPhone', () => {
  it('masks E.164 numbers (area code hidden)', () => {
    expect(maskPhone('+13055551234')).toBe('+1***5551234');
  });

  it('masks non-normalized numbers best-effort', () => {
    expect(maskPhone('3055551234')).toBe('***5551234');
  });

  it('returns empty string for empty input', () => {
    expect(maskPhone('')).toBe('');
  });

  it('returns *** for very short input', () => {
    expect(maskPhone('123')).toBe('***');
  });
});

describe('formatPhoneDisplay', () => {
  it('formats E.164 to (XXX) XXX-XXXX', () => {
    expect(formatPhoneDisplay('+13055551234')).toBe('(305) 555-1234');
    expect(formatPhoneDisplay('+19175551234')).toBe('(917) 555-1234');
  });

  it('returns input unchanged for non-E.164', () => {
    expect(formatPhoneDisplay('305-555-1234')).toBe('305-555-1234');
    expect(formatPhoneDisplay('invalid')).toBe('invalid');
  });
});

describe('phoneE164Schema', () => {
  it('normalizes and validates valid phone', () => {
    const result = phoneE164Schema.safeParse('(305) 555-1234');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('+13055551234');
    }
  });

  it('rejects empty string', () => {
    const result = phoneE164Schema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('rejects garbage input', () => {
    const result = phoneE164Schema.safeParse('not-a-phone');
    expect(result.success).toBe(false);
  });

  it('rejects too few digits', () => {
    const result = phoneE164Schema.safeParse('305555');
    expect(result.success).toBe(false);
  });
});

describe('phoneE164OptionalSchema', () => {
  it('normalizes and validates present phone', () => {
    const result = phoneE164OptionalSchema.safeParse('(305) 555-1234');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('+13055551234');
    }
  });

  it('allows null', () => {
    const result = phoneE164OptionalSchema.safeParse(null);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  it('allows undefined', () => {
    const result = phoneE164OptionalSchema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  it('rejects invalid phone when provided', () => {
    const result = phoneE164OptionalSchema.safeParse('12345');
    expect(result.success).toBe(false);
  });
});
