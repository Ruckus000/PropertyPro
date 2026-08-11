import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
  resolve: {
    // Scripts are not a workspace package, so `@propertypro/*` specifiers have
    // no node_modules entry to resolve through here — at runtime `tsx` finds
    // them via pnpm's hoisted root, but Vite's resolver does not. Without these
    // aliases any script that imports a workspace package is untestable, and
    // fails at import time with "Cannot find package", not at the assertion.
    alias: {
      '@propertypro/shared': `${repoRoot}packages/shared/src`,
      '@propertypro/db/filters': `${repoRoot}packages/db/src/filters`,
      '@propertypro/db/unsafe': `${repoRoot}packages/db/src/unsafe`,
      '@propertypro/db': `${repoRoot}packages/db/src`,
    },
  },
});
