import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` is provided by Next at build time and has no standalone
      // module in node_modules; the no-op stub lets a test import the
      // server-only public-site layouts. Same alias as vitest.shared.ts and
      // packages/db/vitest.integration.config.ts.
      'server-only': path.resolve(__dirname, '__tests__/stubs/server-only.ts'),
      '@': path.resolve(__dirname, 'src'),
      // The public-site layouts reach `cn` through `@/lib/utils`, which
      // re-exports it from `@propertypro/ui`. That package points `main` and
      // `exports` at a git-ignored `dist/`, and the CI integration job builds
      // only shared, email, db and api-contract, so there the import fails with
      // "Failed to resolve entry for package". Read it from source, as
      // vitest.shared.ts does. A local run can pass without this because
      // `turbo run typecheck` builds `packages/ui/dist` as a side effect.
      '@propertypro/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  // tsconfig says `jsx: preserve` (Next compiles the JSX), which leaves esbuild
  // emitting bare `React.createElement` calls with no React in scope. A test
  // that renders a component (the public site's layouts) needs the transform.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['apps/web/__tests__/**/*integration.test.ts'],
    // Runs once in the main process (survives worker crashes/timeouts) — sweeps
    // orphaned test communities left by prior crashed runs. See the file header.
    globalSetup: ['apps/web/__tests__/integration/global-setup-integration.ts'],
    setupFiles: ['apps/web/__tests__/integration/setup-integration.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
