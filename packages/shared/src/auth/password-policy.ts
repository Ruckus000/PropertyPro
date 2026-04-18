/**
 * Shared password policy — single source of truth.
 *
 * Consumers:
 * - `apps/web/src/lib/auth/signup-schema.ts` (Zod validation on signup API)
 * - `apps/web/src/lib/auth/schemas.ts` (Zod validation on reset)
 * - `apps/web/src/components/auth/password-strength-indicator.tsx` (UI)
 * - `apps/web/src/components/auth/set-password-form.tsx` (invitation flow)
 *
 * Rule order here must match the order of surfaced messages so the first
 * failing rule is a deterministic user-facing error.
 */
import { z } from 'zod';

export type PasswordRuleId = 'length' | 'lowercase' | 'uppercase' | 'number' | 'special';

export interface PasswordRule {
  id: PasswordRuleId;
  label: string;
  test: (pw: string) => boolean;
  message: string;
}

export type PasswordStrengthLevel = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordPolicy {
  readonly minLength: number;
  readonly maxLength: number;
  readonly strongLengthBonus: number;
  readonly rules: readonly PasswordRule[];
}

const MIN_LENGTH = 8;
const MAX_LENGTH = 72;
const STRONG_LENGTH_BONUS = 12;

export const PASSWORD_POLICY: PasswordPolicy = {
  minLength: MIN_LENGTH,
  maxLength: MAX_LENGTH,
  strongLengthBonus: STRONG_LENGTH_BONUS,
  rules: [
    {
      id: 'length',
      label: `${MIN_LENGTH}+ characters`,
      test: (pw: string) => pw.length >= MIN_LENGTH && pw.length <= MAX_LENGTH,
      message: `Password must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters`,
    },
    {
      id: 'lowercase',
      label: 'Lowercase letter',
      test: (pw: string) => /[a-z]/.test(pw),
      message: 'Password must include a lowercase letter',
    },
    {
      id: 'uppercase',
      label: 'Uppercase letter',
      test: (pw: string) => /[A-Z]/.test(pw),
      message: 'Password must include an uppercase letter',
    },
    {
      id: 'number',
      label: 'Number',
      test: (pw: string) => /\d/.test(pw),
      message: 'Password must include a number',
    },
    {
      id: 'special',
      label: 'Special character',
      test: (pw: string) => /[^A-Za-z0-9]/.test(pw),
      message: 'Password must include a special character',
    },
  ] as const,
} as const;

/**
 * Evaluate each policy rule against the given password.
 */
export function getPasswordChecks(pw: string): Record<PasswordRuleId, boolean> {
  const checks = {} as Record<PasswordRuleId, boolean>;
  for (const rule of PASSWORD_POLICY.rules) {
    checks[rule.id] = rule.test(pw);
  }
  return checks;
}

export interface PasswordScore {
  score: number;
  level: PasswordStrengthLevel;
  failedRules: PasswordRuleId[];
}

/**
 * Score a password on a 0..6 scale.
 *
 * Score = number of satisfied rules (0..5) + 1 length bonus if
 * pw.length >= PASSWORD_POLICY.strongLengthBonus.
 *
 * Bands (inclusive upper bound):
 *   <=2 → weak, 3 → fair, 4 → good, 5..6 → strong
 */
export function scorePassword(pw: string): PasswordScore {
  const checks = getPasswordChecks(pw);
  const satisfied = PASSWORD_POLICY.rules.filter((rule) => checks[rule.id]).length;
  const lengthBonus = pw.length >= PASSWORD_POLICY.strongLengthBonus ? 1 : 0;
  const score = satisfied + lengthBonus;

  const failedRules = PASSWORD_POLICY.rules
    .filter((rule) => !checks[rule.id])
    .map((rule) => rule.id);

  let level: PasswordStrengthLevel;
  if (score <= 2) level = 'weak';
  else if (score === 3) level = 'fair';
  else if (score === 4) level = 'good';
  else level = 'strong';

  return { score, level, failedRules };
}

/**
 * Build a Zod string schema from `PASSWORD_POLICY.rules`.
 * Each rule contributes one issue with `rule.message`.
 * Callers compose this into higher-level objects (signup, reset, etc.).
 */
export function buildPasswordZodSchema(): z.ZodString {
  let schema = z
    .string()
    .min(PASSWORD_POLICY.minLength, {
      message: `Password must be at least ${PASSWORD_POLICY.minLength} characters`,
    })
    .max(PASSWORD_POLICY.maxLength, {
      message: `Password must be at most ${PASSWORD_POLICY.maxLength} characters`,
    });

  for (const rule of PASSWORD_POLICY.rules) {
    if (rule.id === 'length') continue;
    schema = schema.refine(rule.test, { message: rule.message });
  }

  return schema as z.ZodString;
}
