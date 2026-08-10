import { defineConfig } from "vitest/config";

export default defineConfig({
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
