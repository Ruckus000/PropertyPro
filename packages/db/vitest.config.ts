import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      /**
       * Resolve the workspace source, not `dist`.
       *
       * `@propertypro/shared`'s package entry points at a build output that is
       * absent on a clean checkout and stale the moment someone edits the
       * source — so a test importing it either fails to resolve (as this one
       * did) or silently asserts against the previous build. Same aliasing
       * apps/web already does in vitest.shared.ts.
       */
      '@propertypro/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    exclude: ['__tests__/**/*.integration.test.ts'],
  },
});
