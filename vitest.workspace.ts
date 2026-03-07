import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/db",
  "packages/email",
  "packages/theme",
  "packages/ui",
  "packages/shared",
  "apps/web",
  "apps/admin",
]);
