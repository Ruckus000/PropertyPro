import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/email.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  onSuccess: "cp src/generated/tokens.css dist/styles.css",
});
