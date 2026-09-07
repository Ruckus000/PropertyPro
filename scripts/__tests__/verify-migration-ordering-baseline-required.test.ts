import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The baseline check must not be able to pass by not running.
 *
 * `checkBaselineCollisions` is the ONLY check in the ordering guard that looks
 * outside the working tree, so it is the only one that can see one branch
 * claiming a migration index another branch already owns. When it cannot read
 * the baseline ref it does not report a clean tree — it reports nothing, and the
 * script still exits 0. That is how index 0069 ended up claimed twice.
 *
 * Two contexts want different answers, so the severity is a flag rather than a
 * constant, and both directions are pinned here. Either case alone would be
 * vacuous: the warning case passes for a script that can never fail, and the
 * error case passes for one that can never succeed.
 *
 * Subprocess rather than a direct call, because the severity decision lives in
 * `main()` — and because "what exit code does the gate see?" is the actual
 * question. An exit code is the only thing localci reads.
 */
const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'verify-migration-ordering.ts',
);

/** A ref that cannot exist, so `git show` fails the way a shallow clone does. */
const UNREACHABLE_REF = 'refs/heads/definitely-not-a-real-baseline-ref';

function run(env: Record<string, string>) {
  return spawnSync('pnpm', ['exec', 'tsx', SCRIPT], {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
    encoding: 'utf-8',
    env: { ...process.env, MIGRATION_BASELINE_REF: UNREACHABLE_REF, ...env },
  });
}

describe('an unreadable baseline', () => {
  it('is a WARNING by default, so a shallow CI clone reports the tree not the environment', () => {
    const result = run({});

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skipped');
    // It must still say so out loud — a silent skip is indistinguishable from a
    // clean run, which is the whole defect.
    expect(result.stdout).toContain('baseline-collision check');
  });

  it('is an ERROR under MIGRATION_BASELINE_REQUIRED=1, which is what the push gate sets', () => {
    const result = run({ MIGRATION_BASELINE_REQUIRED: '1' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Could not run');
    // The message has to name the fix, or the gate just blocks people.
    expect(result.stdout).toContain('git fetch origin main');
  });
});

describe('a readable baseline', () => {
  it('passes with the flag set, so the gate is not simply always red', () => {
    // The anti-vacuity half: without this, both cases above are satisfied by a
    // script that fails whenever the flag is present, regardless of the tree.
    const result = spawnSync('pnpm', ['exec', 'tsx', SCRIPT], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
      encoding: 'utf-8',
      env: { ...process.env, MIGRATION_BASELINE_REQUIRED: '1' },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Migration ordering is valid');
  });
});
