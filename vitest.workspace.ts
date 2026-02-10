import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/db",
  "packages/ui",
  "packages/shared",
  "apps/web",
]);
