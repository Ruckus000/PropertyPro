import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    "drizzle-orm",
    "postgres",
    "next/headers",
    "next/server",
    "@supabase/ssr",
    "@supabase/supabase-js",
    "@propertypro/shared",
  ],
});
