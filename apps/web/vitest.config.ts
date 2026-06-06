import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsxInject: `import React from 'react'`,
  },
  resolve: {
    alias: {
      // `server-only` is provided by Next at build time and has no standalone
      // module in node_modules; alias it to a no-op stub so files guarded with
      // `import 'server-only'` remain importable under vitest.
      'server-only': path.resolve(__dirname, '__tests__/stubs/server-only.ts'),
      '@': path.resolve(__dirname, 'src'),
      '@propertypro/db': path.resolve(__dirname, '../../packages/db/src'),
      '@propertypro/email': path.resolve(__dirname, '../../packages/email/src'),
      '@propertypro/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@propertypro/theme': path.resolve(__dirname, '../../packages/theme/src'),
      '@propertypro/tokens': path.resolve(__dirname, '../../packages/tokens/src'),
      '@propertypro/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', '__tests__/**/*.test.{ts,tsx}'],
    exclude: ['__tests__/**/*integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: [
        'src/lib/services/**',
        'src/lib/utils/**',
        'src/hooks/**',
        'src/components/compliance/**',
        'src/components/finance/**',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/__tests__/**',
      ],
    },
  },
});
