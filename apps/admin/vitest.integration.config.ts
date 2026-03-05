import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['apps/admin/__tests__/integration/**/*.integration.test.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
      '@propertypro/db': resolve(import.meta.dirname, '../../packages/db/src'),
      '@propertypro/db/supabase/admin': resolve(
        import.meta.dirname,
        '../../packages/db/src/supabase/admin.ts',
      ),
      '@propertypro/shared': resolve(import.meta.dirname, '../../packages/shared/src'),
      '@propertypro/shared/site-blocks': resolve(
        import.meta.dirname,
        '../../packages/shared/src/site-blocks.ts',
      ),
    },
  },
});
