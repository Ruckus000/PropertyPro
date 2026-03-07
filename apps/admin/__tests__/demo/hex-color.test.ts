import { describe, expect, it } from 'vitest';
import { hasInvalidHexColorValues, isSixDigitHexColor } from '../../src/lib/utils/hex-color';

describe('hex color validation utilities', () => {
  it('accepts only #RRGGBB values', () => {
    expect(isSixDigitHexColor('#2563EB')).toBe(true);
    expect(isSixDigitHexColor('#6b7280')).toBe(true);
    expect(isSixDigitHexColor('#abc')).toBe(false);
    expect(isSixDigitHexColor('2563EB')).toBe(false);
    expect(isSixDigitHexColor('#GGGGGG')).toBe(false);
  });

  it('flags when any value is invalid', () => {
    expect(hasInvalidHexColorValues(['#2563EB', '#6B7280', '#DBEAFE'])).toBe(false);
    expect(hasInvalidHexColorValues(['#2563EB', '#BAD', '#DBEAFE'])).toBe(true);
  });
});
