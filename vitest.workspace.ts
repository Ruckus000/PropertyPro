import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/db",
  "packages/email",
  "packages/theme",
  "packages/ui",
  "packages/shared",
  "packages/theme",
  "apps/web",
  "apps/admin",
]);
