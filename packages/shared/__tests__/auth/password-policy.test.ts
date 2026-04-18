import { describe, expect, it } from 'vitest';
import {
  PASSWORD_POLICY,
  buildPasswordZodSchema,
  getPasswordChecks,
  scorePassword,
} from '../../src/auth/password-policy';

describe('password policy', () => {
  describe('getPasswordChecks', () => {
    it('returns all-false for empty input', () => {
      const checks = getPasswordChecks('');
      expect(checks).toEqual({
        length: false,
        lowercase: false,
        uppercase: false,
        number: false,
        special: false,
      });
    });

    it('returns all-true for a fully compliant password', () => {
      const checks = getPasswordChecks('Secure!123');
      expect(checks).toEqual({
        length: true,
        lowercase: true,
        uppercase: true,
        number: true,
        special: true,
      });
    });

    it('flags missing character classes', () => {
      const checks = getPasswordChecks('abcdefgh');
      expect(checks.length).toBe(true);
      expect(checks.lowercase).toBe(true);
      expect(checks.uppercase).toBe(false);
      expect(checks.number).toBe(false);
      expect(checks.special).toBe(false);
    });
  });

  describe('scorePassword', () => {
    it('empty password is weak with all rules failed', () => {
      const { score, level, failedRules } = scorePassword('');
      expect(score).toBe(0);
      expect(level).toBe('weak');
      expect(failedRules).toEqual(['length', 'lowercase', 'uppercase', 'number', 'special']);
    });

    it('single lowercase letter scores weak', () => {
      const result = scorePassword('a');
      expect(result.level).toBe('weak');
      expect(result.score).toBeLessThanOrEqual(2);
    });

    it('Abcdefg1 satisfies 4 rules (length + lower + upper + number), length < 12 → good', () => {
      const { score, level } = scorePassword('Abcdefg1');
      expect(score).toBe(4);
      expect(level).toBe('good');
    });

    it('Abcdefgh1234! satisfies 5 rules + length bonus → strong', () => {
      const { score, level, failedRules } = scorePassword('Abcdefgh1234!');
      expect(score).toBe(6);
      expect(level).toBe('strong');
      expect(failedRules).toEqual([]);
    });

    it('Secure!123 satisfies 5 rules but length < 12 → strong by satisfied count', () => {
      const { score, level } = scorePassword('Secure!123');
      expect(score).toBe(5);
      expect(level).toBe('strong');
    });

    it('3-rule band is fair', () => {
      // length + lower + upper, no number or special
      const { score, level } = scorePassword('Abcdefgh');
      expect(score).toBe(3);
      expect(level).toBe('fair');
    });
  });

  describe('buildPasswordZodSchema', () => {
    const schema = buildPasswordZodSchema();

    it('rejects a password shorter than the minimum', () => {
      const result = schema.safeParse('Ab!1');
      expect(result.success).toBe(false);
    });

    it('rejects a password longer than the maximum', () => {
      const long = `${'a'.repeat(PASSWORD_POLICY.maxLength)}A1!`;
      const result = schema.safeParse(long);
      expect(result.success).toBe(false);
    });

    it('rejects a password missing a lowercase letter', () => {
      const result = schema.safeParse('ABCDEFG1!');
      expect(result.success).toBe(false);
    });

    it('rejects a password missing an uppercase letter', () => {
      const result = schema.safeParse('abcdefg1!');
      expect(result.success).toBe(false);
    });

    it('rejects a password missing a number', () => {
      const result = schema.safeParse('Abcdefgh!');
      expect(result.success).toBe(false);
    });

    it('rejects a password missing a special character', () => {
      const result = schema.safeParse('Abcdefg1');
      expect(result.success).toBe(false);
    });

    it('accepts a valid password', () => {
      const result = schema.safeParse('Secure!123');
      expect(result.success).toBe(true);
    });
  });
});
