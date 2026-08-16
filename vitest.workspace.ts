import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/db",
  "packages/email",
  "packages/theme",
  "packages/ui",
  "packages/shared",
  // tokens and api-contract were missing here while CI ran them via its own
  // per-package filter step — so `pnpm test` locally was quietly a smaller
  // suite than CI's, and a break in either package could only be found on a PR.
  "packages/tokens",
  "packages/api-contract",
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
