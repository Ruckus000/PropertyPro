import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/db",
  "packages/email",
  "packages/theme",
  "packages/ui",
  "packages/shared",
  // apps/web is split into a node and a jsdom project (most of its suite needs
  // no DOM). Reference the two project configs directly: naming the directory
  // instead would load apps/web/vitest.config.ts, whose nested `projects` this
  // workspace does not expand — every web test would then run under a single
  // environment and the DOM ones would fail on `document is not defined`.
  "apps/web/vitest.node.config.ts",
  "apps/web/vitest.jsdom.config.ts",
  "apps/admin",
  "scripts",
]);
