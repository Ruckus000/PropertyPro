import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Base flat config for TypeScript workspace packages (non-Next.js).
 *
 * Uses the non-type-checked typescript-eslint preset so lint stays fast and
 * does not require built workspace dependencies (the turbo `lint` task has no
 * `^build` dependency).
 */
export const baseConfig = tseslint.config(
  {
    // Build output and vendored artifacts. `.next`/`e2e` don't exist in
    // packages/* but keeping one shared list avoids per-package drift.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Ratchet baseline (see docs in the PR that introduced linting): the
      // codebase predates ESLint, so stylistic/looseness rules start as
      // warnings while correctness rules stay errors. Tighten over time.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
