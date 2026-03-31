import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.integration.test.ts'],
    fileParallelism: false,
    hookTimeout: 300_000,
    testTimeout: 300_000,
  },
});
