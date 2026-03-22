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
      '@': path.resolve(__dirname, 'src'),
      '@propertypro/theme': path.resolve(__dirname, '../../packages/theme/src'),
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
