import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/integration/**/*.integration.test.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
      '@propertypro/db': resolve(import.meta.dirname, '../../packages/db/src'),
      '@propertypro/shared': resolve(import.meta.dirname, '../../packages/shared/src'),
    },
  },
});
