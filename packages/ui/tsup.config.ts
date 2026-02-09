import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/tokens/index.ts",
    "src/primitives/index.ts",
    "src/components/index.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  loader: {
    ".css": "copy",
  },
});
