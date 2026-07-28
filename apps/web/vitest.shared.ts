import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, type UserWorkspaceConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Single source of truth for the apps/web unit-test projects.
 *
 * There are two consumers, and they must agree:
 *   - `apps/web/vitest.config.ts` — what CI runs (`cd apps/web && vitest run`)
 *   - the repo-root `vitest.workspace.ts` — what `pnpm test` runs
 *
 * Both reference vitest.node.config.ts / vitest.jsdom.config.ts, which are thin
 * wrappers around the objects below, so neither can drift from the other.
 *
 * Defining the projects here rather than inline in vitest.config.ts is
 * deliberate: inline projects with `extends: true` inherit the root `test`
 * block, and a root-level `include` then unions back over each project's own
 * include — which silently put all 790 files back on jsdom.
 */

const resolveConfig = {
  alias: {
    // `server-only` is provided by Next at build time and has no standalone
    // module in node_modules; alias it to a no-op stub so files guarded with
    // `import 'server-only'` remain importable under vitest.
    'server-only': path.resolve(__dirname, '__tests__/stubs/server-only.ts'),
    '@': path.resolve(__dirname, 'src'),
    '@propertypro/db': path.resolve(__dirname, '../../packages/db/src'),
    '@propertypro/email': path.resolve(__dirname, '../../packages/email/src'),
    '@propertypro/shared': path.resolve(__dirname, '../../packages/shared/src'),
    '@propertypro/theme': path.resolve(__dirname, '../../packages/theme/src'),
    '@propertypro/tokens': path.resolve(__dirname, '../../packages/tokens/src'),
    '@propertypro/ui': path.resolve(__dirname, '../../packages/ui/src'),
  },
};

const esbuildConfig = {
  jsxInject: `import React from 'react'`,
};

/**
 * Files that genuinely need a DOM.
 *
 * Everything else runs under `environment: 'node'`. Constructing a JSDOM
 * instance costs roughly a second per test file, and it used to be paid by all
 * 790 files even though only 285 touch the DOM — jsdom construction was the
 * single largest bucket in the CI unit-test job (803s of environment setup
 * against 218s of actual assertions).
 *
 * These are deliberately directory-shaped rather than a hand-maintained list of
 * individual paths. Note the polarity: this is an allowlist for jsdom, and the
 * node project is "everything else". A newly added test file therefore defaults
 * to node — and if it needs a DOM it fails loudly with `document is not
 * defined` rather than being silently skipped by both projects.
 *
 * To put a single file back on jsdom without widening a glob, add a top-of-file
 * `// @vitest-environment jsdom` docblock; it overrides the project setting.
 */
export const JSDOM_FILES = [
  'src/**/*.test.tsx',
  '__tests__/**/*.test.tsx',
  // All 35 .test.ts files here use renderHook — no false inclusions.
  'src/hooks/__tests__/**/*.test.ts',
  '__tests__/hooks/**/*.test.ts',
  // Sweeps in the site-editor-v3 hook tests (use-canvas-selection, useAutosave).
  '__tests__/components/**/*.test.ts',
  // The one file that isn't directory-shaped: uses localStorage directly.
  '__tests__/pm/use-selected-community.test.ts',
];

const SHARED_EXCLUDE = [
  // The pre-split config replaced Vitest's default excludes entirely. Spread
  // them back in so node_modules/dist/config files stay out.
  ...configDefaults.exclude,
  // Deliberately `.ts` only, matching the pre-split config. Broadening this to
  // `__tests__/integration/**` looks like a tidy-up but silently drops
  // help-docs-modal.integration.test.tsx, which this pattern never matched and
  // which has therefore always run as part of the unit suite.
  '__tests__/**/*integration.test.ts',
];

const ALL_TESTS = ['src/**/*.test.{ts,tsx}', '__tests__/**/*.test.{ts,tsx}'];

export const nodeProject: UserWorkspaceConfig = {
  esbuild: esbuildConfig,
  resolve: resolveConfig,
  test: {
    name: 'node',
    environment: 'node',
    setupFiles: [path.resolve(__dirname, '__tests__/setup.common.ts')],
    root: __dirname,
    include: ALL_TESTS,
    exclude: [...SHARED_EXCLUDE, ...JSDOM_FILES],
  },
};

export const jsdomProject: UserWorkspaceConfig = {
  esbuild: esbuildConfig,
  resolve: resolveConfig,
  test: {
    name: 'jsdom',
    environment: 'jsdom',
    setupFiles: [
      path.resolve(__dirname, '__tests__/setup.common.ts'),
      path.resolve(__dirname, '__tests__/setup.jsdom.ts'),
    ],
    root: __dirname,
    include: JSDOM_FILES,
    exclude: SHARED_EXCLUDE,
  },
};
