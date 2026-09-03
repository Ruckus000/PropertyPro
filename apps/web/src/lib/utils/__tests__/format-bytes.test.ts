/**
 * Tests for the shared binary-prefix byte formatter.
 *
 * These live here, colocated with the util, rather than riding along in
 * `__tests__/export/export-notification.test.ts` — reaching a pure formatter
 * through that module meant mocking `@propertypro/db`, `/filters`, `/unsafe`
 * and `@propertypro/email` just to assert a string.
 *
 * The domain cases below are the point of the file: the formatter used to be a
 * private helper behind a single call site that only ever passed positive
 * integers, and it mishandled everything outside that range.
 */
import { describe, expect, it } from 'vitest';

import { formatBytes } from '../format-bytes';

describe('formatBytes', () => {
  describe('the range the original helper was written for', () => {
    it.each([
      [0, '0 B'],
      [512, '512 B'],
      [1023, '1023 B'],
      [1024, '1.0 KB'],
      [1024 * 1024 * 3.5, '3.5 MB'],
    ])('formats %s as %s', (input, expected) => {
      expect(formatBytes(input)).toBe(expected);
    });
  });

  describe('unit selection at each exact boundary', () => {
    it.each([
      [1024 ** 1, '1.0 KB'],
      [1024 ** 2, '1.0 MB'],
      [1024 ** 3, '1.0 GB'],
      [1024 ** 4, '1.0 TB'],
    ])('formats 1024^n = %s as %s', (input, expected) => {
      expect(formatBytes(input)).toBe(expected);
    });

    it('clamps above the largest unit rather than indexing past the array', () => {
      // TB is the last unit; a petabyte keeps counting in TB.
      expect(formatBytes(1024 ** 5)).toBe('1024.0 TB');
    });
  });

  describe('absent and non-positive input', () => {
    it.each([
      [null, '0 B'],
      [undefined, '0 B'],
      [0, '0 B'],
      [-1, '0 B'],
      [-1024, '0 B'],
    ])('formats %s as %s', (input, expected) => {
      expect(formatBytes(input)).toBe(expected);
    });
  });

  describe('non-finite input', () => {
    it.each([
      [Number.NaN, '0 B'],
      [Number.POSITIVE_INFINITY, '0 B'],
      [Number.NEGATIVE_INFINITY, '0 B'],
    ])('formats %s as %s', (input, expected) => {
      expect(formatBytes(input)).toBe(expected);
    });

    it('never emits the string "Infinity"', () => {
      expect(formatBytes(Number.POSITIVE_INFINITY)).not.toContain('Infinity');
    });
  });

  describe('fractional bytes below 1', () => {
    // log(x)/log(1024) is negative here, so an unclamped exponent indexes
    // units[-1] and the formatter emits the literal text "undefined".
    it.each([
      [0.5, '0.5 B'],
      [0.001, '0.001 B'],
      [0.999, '0.999 B'],
    ])('formats %s as %s', (input, expected) => {
      expect(formatBytes(input)).toBe(expected);
    });

    it('never emits the string "undefined"', () => {
      for (const input of [0.5, 0.001, 0.999]) {
        expect(formatBytes(input)).not.toContain('undefined');
      }
    });
  });
});
