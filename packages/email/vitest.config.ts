import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      /**
       * Resolve the workspace SOURCE, not `dist`.
       *
       * Two templates (subscription-canceled, subscription-expiry-warning)
       * import @propertypro/shared, whose package entry points at a build
       * output. On a fresh checkout that output does not exist and three test
       * files fail to collect; once it does exist it is stale the moment
       * anyone edits shared. apps/web/vitest.shared.ts already aliases the same
       * way, for the same reason.
       */
      "@propertypro/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  test: {
    include: ["__tests__/**/*.test.{ts,tsx}"],
    exclude: ["__tests__/**/*.integration.test.{ts,tsx}"],
    server: {
      deps: {
        inline: ["@propertypro/tokens"],
      },
    },
  },
  esbuild: {
    jsx: "automatic",
  },
});
