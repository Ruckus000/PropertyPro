import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
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
