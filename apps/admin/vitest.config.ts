import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  esbuild: {
    jsxInject: `import React from 'react'`,
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
      '@propertypro/db': resolve(import.meta.dirname, '../../packages/db/src'),
      '@propertypro/shared': resolve(import.meta.dirname, '../../packages/shared/src'),
    },
  },
});
