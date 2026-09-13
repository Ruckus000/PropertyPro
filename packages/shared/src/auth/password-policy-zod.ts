/**
 * The Zod face of the password policy.
 *
 * Split out of `./password-policy.ts` so that file can stay zod-free and be
 * exported as `@propertypro/shared/password-policy`. `@propertypro/shared`
 * ships as a SINGLE bundled `dist/index.js`, so importing any value from the
 * barrel — `PASSWORD_POLICY`, a plain object of predicate functions — pulled
 * the whole zod library into the client bundle with it. That cost the two
 * password screens 96.7 KiB each and put both over their route budget:
 * `/auth/accept-invite` carried zod despite importing none, purely through
 * this package.
 *
 * The rule is therefore: anything importable by a CLIENT component belongs in
 * `./password-policy.ts`; anything that needs zod belongs here, and is reached
 * through the barrel by server code, where zod is free.
 */
import { z } from 'zod';

import { PASSWORD_POLICY } from './password-policy';

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
