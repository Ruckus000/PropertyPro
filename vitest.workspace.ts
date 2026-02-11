import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/db",
  "packages/email",
  "packages/ui",
  "packages/shared",
  "apps/web",
]);
