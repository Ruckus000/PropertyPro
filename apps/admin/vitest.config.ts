import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  esbuild: {
    jsxInject: `import React from 'react'`,
  },
  test: {
    environment: 'node',
    globals: true,
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
