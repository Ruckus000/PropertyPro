import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server.ts",
    "src/http/index.ts",
    "src/observability/index.ts",
    // Zod-free, so a client component can import the password policy without
    // pulling the whole bundled barrel (and zod with it).
    "src/auth/password-policy.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
