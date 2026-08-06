import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import { ratchetRules, sharedIgnores } from './base.js';

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
      ...sharedIgnores,
      '**/.next/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'next-env.d.ts',
      // Static/vendored assets (pdf.js worker sync output, …)
      'public/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Shared warn-severity baseline — see base.js for the rationale.
      ...ratchetRules,
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
