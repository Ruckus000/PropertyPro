import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  esbuild: {
    jsxInject: `import React from 'react'`,
  },
  test: {
    environment: 'node',
    globals: true,
    // Clear mock call history before every test. Vitest does this BEFORE each
    // test's own `beforeEach`, so per-test implementations and
    // `mockResolvedValueOnce` queues set there still apply — only leaked
    // `mock.calls` / `mock.results` from a previous test are dropped.
    //
    // Added after a real leak: `search-route.test.ts` carried mock state across
    // tests, which is the quiet way an assertion stops measuring what it names —
    // a call count can be satisfied by the PREVIOUS test's invocation. Seven of
    // the shell test files use `vi.mock()` with no reset of their own, so the
    // isolation belongs in the config rather than in seven copies of a
    // `beforeEach`. Deliberately NOT `mockReset`/`restoreMocks`, which would
    // also drop implementations defined in `vi.mock()` factories.
    clearMocks: true,
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    exclude: ['__tests__/**/*.integration.test.ts'],
    server: {
      deps: {
        inline: ['@propertypro/tokens', '@propertypro/ui'],
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
      '@propertypro/db': resolve(import.meta.dirname, '../../packages/db/src'),
      // Source, not dist: @propertypro/email's package entry points at a build
      // output that is absent on a clean checkout and stale the moment anyone
      // edits the package. apps/web/vitest.shared.ts aliases it the same way.
      '@propertypro/email': resolve(import.meta.dirname, '../../packages/email/src'),
      '@propertypro/shared': resolve(import.meta.dirname, '../../packages/shared/src'),
      '@propertypro/ui': resolve(import.meta.dirname, '../../packages/ui/src'),
    },
  },
});
