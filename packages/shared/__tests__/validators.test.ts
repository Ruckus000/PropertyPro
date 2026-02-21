import { describe, expect, it } from 'vitest';
import { isCommunityRole, isCommunityType } from '../src';

describe('shared runtime validators', () => {
  describe('isCommunityType', () => {
    it('returns true for a valid value', () => {
      expect(isCommunityType('condo_718')).toBe(true);
    });

    it('returns false for an invalid value', () => {
      expect(isCommunityType('invalid')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isCommunityType(undefined)).toBe(false);
    });
  });

  describe('isCommunityRole', () => {
    it('returns true for a valid value', () => {
      expect(isCommunityRole('owner')).toBe(true);
    });

    it('returns false for an invalid value', () => {
      expect(isCommunityRole('superadmin')).toBe(false);
    });
  });
});
