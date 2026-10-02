import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    // Several verify-*.test.ts cases run their guard over the WHOLE repo. Alone
    // they take ~1s, but inside the full local suite on a loaded laptop one hit
    // the 5s default (verify-call-ceilings, 2026-10-02) and turned localci red
    // with nothing wrong. This is a ceiling, not a target: a guard that truly
    // hangs still fails.
    testTimeout: 30_000,
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
      // Must precede the bare '@propertypro/db' entry: Vite matches aliases in
      // order, so the shorter key would swallow this subpath and pull in the
      // root barrel -> drizzle.ts -> "Missing DATABASE_URL" at import time.
      '@propertypro/db/constants': `${repoRoot}packages/db/src/constants`,
      '@propertypro/db/unsafe': `${repoRoot}packages/db/src/unsafe`,
      '@propertypro/db': `${repoRoot}packages/db/src`,
    },
  },
});
