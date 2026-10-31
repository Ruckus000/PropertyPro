/**
 * Per-worker setup for the `scripts` vitest project: remove every `GIT_*`
 * variable from the worker before any test file runs, so a git call that a
 * test makes, directly or through a guard it runs, finds its repo from its own
 * cwd or `-C`.
 *
 * Why every worker and not each call site: a pre-push hook exports `GIT_DIR`,
 * and under it a single unscrubbed `git init <tmpdir>` wrote `core.bare = true`
 * into the shared repo config (see `lib/git-env.ts`). Passing `withoutGitEnv()`
 * at each call fixes the calls that exist; this covers the next one too.
 */
import { withoutGitEnv } from './lib/git-env';

declare global {
  /** Read by `__tests__/vitest-setup.test.ts` to prove the config loads this file. */
  var __scriptsGitEnvScrubbed: boolean | undefined;
}

const kept = withoutGitEnv();
for (const key of Object.keys(process.env)) {
  if (!(key in kept)) delete process.env[key];
}
globalThis.__scriptsGitEnvScrubbed = true;
