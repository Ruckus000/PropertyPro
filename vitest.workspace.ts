import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/ui",
  "packages/shared",
  "apps/web",
]);
