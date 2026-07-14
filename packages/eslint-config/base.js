import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Build-artifact ignores shared by every workspace config (next.js extends
 * this list with app-specific entries). node_modules and .git are already
 * ignored by ESLint's defaults and are deliberately not repeated here.
 */
export const sharedIgnores = ['**/dist/**', '**/.turbo/**', '**/coverage/**'];

/**
 * Severity baseline shared by base and next configs. The codebase predates
 * ESLint, so these high-volume looseness rules start as warnings. Warnings
 * are advisory (nothing gates on warning count today — `eslint .` exits 0);
 * the intent is to tighten them to errors over time, not to loosen further.
 */
export const ratchetRules = {
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': [
    'warn',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
};

/**
 * Base flat config for TypeScript workspace packages (non-Next.js).
 *
 * Uses the non-type-checked typescript-eslint preset so lint stays fast and
 * does not require built workspace dependencies (the turbo `lint` task has no
 * `^build` dependency).
 */
export const baseConfig = tseslint.config(
  { ignores: sharedIgnores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: ratchetRules },
);
