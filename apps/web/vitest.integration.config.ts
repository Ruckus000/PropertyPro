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
