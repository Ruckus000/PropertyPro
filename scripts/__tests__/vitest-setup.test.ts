import { afterEach, describe, expect, it, vi } from 'vitest';

// Read at import, before any test re-runs the setup file and sets it again.
const setupRanBeforeThisFile = globalThis.__scriptsGitEnvScrubbed;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('scripts vitest setup file', () => {
  // If `setupFiles` is dropped from scripts/vitest.config.ts, a pre-push run
  // hands every test the pushing worktree's GIT_DIR again.
  it('is loaded by the scripts project config', () => {
    expect(setupRanBeforeThisFile).toBe(true);
  });

  // A normal run has no GIT_DIR to remove, so checking process.env alone would
  // pass with the delete loop gone. Plant the variables a hook exports, then
  // run the file again.
  it('removes the GIT_* variables a pre-push hook exports and keeps the rest', async () => {
    vi.stubEnv('GIT_DIR', '/repo/.git/worktrees/wt');
    vi.stubEnv('GIT_INDEX_FILE', '/repo/.git/worktrees/wt/index');
    vi.stubEnv('NOT_GIT_DIR', 'kept');

    vi.resetModules();
    await import('../vitest.setup');

    expect(process.env.GIT_DIR).toBeUndefined();
    expect(process.env.GIT_INDEX_FILE).toBeUndefined();
    expect(process.env.NOT_GIT_DIR).toBe('kept');
  });
});
