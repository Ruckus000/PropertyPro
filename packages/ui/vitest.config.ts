import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./__tests__/setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}", "src/**/__tests__/**/*.test.{ts,tsx}"],
    server: {
      deps: {
        // jest-dom inlined so Vite, not Node, resolves its `import 'vitest'`,
        // so it cannot extend a second chai. See jsdomProject in
        // apps/web/vitest.shared.ts for the incident.
        inline: ["@propertypro/tokens", "@testing-library/jest-dom"],
      },
    },
  },
});
