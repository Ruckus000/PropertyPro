import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const configDir = path.dirname(fileURLToPath(import.meta.url));

// eslint-config-next still ships eslintrc-style configs; FlatCompat resolves
// them (and their plugins) from this package, where they are declared as deps.
const compat = new FlatCompat({ baseDirectory: configDir });

/**
 * Flat config for the Next.js apps (apps/web, apps/admin).
 *
 * `next/core-web-vitals` + `next/typescript` — the same pair a fresh
 * create-next-app scaffold uses. Type-aware linting is intentionally off so
 * lint does not require built workspace deps.
 */
export const nextConfig = [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'next-env.d.ts',
      // Static/vendored assets (pdf.js worker sync output, tailwind.min.js, …)
      'public/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Ratchet baseline: the codebase predates ESLint. Correctness rules
      // (react-hooks/rules-of-hooks, @next/next/*) stay at their preset
      // severity; high-volume looseness/stylistic rules start as warnings.
      // Tighten over time rather than loosening further.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Converting existing <a href="/…"> to next/link changes navigation
      // behavior (client-side transitions) — with subdomain-per-tenant
      // routing, full page loads can be intentional. Review case by case.
      '@next/next/no-html-link-for-pages': 'warn',
      // Debugging aid (component names in devtools), not a correctness issue.
      'react/display-name': 'warn',
      // Literal apostrophes/quotes render identically; the rule mainly guards
      // against typo'd braces. Not worth an error on a pre-existing codebase.
      'react/no-unescaped-entities': 'warn',
    },
  },
];
