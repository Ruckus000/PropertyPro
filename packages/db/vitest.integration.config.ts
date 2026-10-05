import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      /**
       * seed-demo / reset-demo import `scripts/seed-demo.ts`, which reaches into
       * apps/web (billing-group-service → downgrade-notifications →
       * notification-service), and those modules use apps/web's `@/` path
       * alias. The scripts normally run under `tsx --tsconfig
       * apps/web/tsconfig.json`, which supplies it; vitest needs it spelled out.
       * Same entries as apps/web/vitest.shared.ts.
       */
      'server-only': path.resolve(__dirname, '../../apps/web/__tests__/stubs/server-only.ts'),
      '@': path.resolve(__dirname, '../../apps/web/src'),
    },
  },
  test: {
    include: ['__tests__/**/*.integration.test.ts'],
    fileParallelism: false,
    hookTimeout: 300_000,
    testTimeout: 300_000,
  },
});
