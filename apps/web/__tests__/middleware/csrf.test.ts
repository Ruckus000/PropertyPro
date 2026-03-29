import { describe, expect, it } from 'vitest';
import { isAllowedReferer } from '../../src/lib/middleware/security-headers';

describe('isAllowedReferer', () => {
  it('extracts origin from referer URL and allows getpropertypro.com', () => {
    expect(isAllowedReferer('https://app.getpropertypro.com/dashboard')).toBe(true);
  });

  it('rejects referer from an unknown origin', () => {
    expect(isAllowedReferer('https://evil.com/attack')).toBe(false);
  });

  it('returns false for a malformed referer', () => {
    expect(isAllowedReferer('not-a-url')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isAllowedReferer('')).toBe(false);
  });
});
