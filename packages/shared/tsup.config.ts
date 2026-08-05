import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts", "src/http/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
