/**
 * Global setup for the `scripts` vitest project: fail the run if any test
 * created, deleted or renamed a file inside the repo, even one it cleaned up
 * again. See `scripts/lib/tree-write-sentinel.ts` for why this exists. Also
 * fail it if `core.bare` flipped to true in the repo config, which breaks every
 * checkout (see `scripts/lib/git-env.ts`).
 *
 * Teardown runs once, after every test in the run has finished. In a root
 * `pnpm test` (every workspace project at once) it therefore also sees writes
 * made by other projects' tests. That is deliberate: those writes race these
 * guards in exactly the same way.
 *
 * The teardown never throws. vitest runs project teardowns in sequence inside
 * `close()`, so a throw would skip the other projects' teardowns and the pool
 * shutdown, and print as a "Startup Error". It logs and sets the exit code;
 * vitest itself only ever raises `process.exitCode`, never resets it.
 *
 * ponytail: names directories, not the test, and a JSON report still records
 * success. Trigger: a failure that takes more than one grep to trace, or a CI
 * step that reads the scripts project's JSON report.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import {
  coreBareFlipMessage,
  diffSnapshots,
  formatChanges,
  listWatchedDirectories,
  snapshotDirectories,
} from './lib/tree-write-sentinel';
import { withoutGitEnv } from './lib/git-env';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Read by `__tests__/tree-write-sentinel.test.ts` to prove this setup ran. */
    treeWriteSentinel: { mode: 'armed'; directories: number } | { mode: 'watch' };
  }
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** `core.bare` from this checkout's (shared) repo config; undefined if git could not be asked. */
const readCoreBare = (): string | undefined => {
  const res = spawnSync('git', ['-C', repoRoot, 'config', '--get', 'core.bare'], {
    encoding: 'utf-8',
    env: withoutGitEnv(),
  });
  return res.status === 0 ? res.stdout.trim() : undefined;
};

export default function setup(project: TestProject): (() => void) | undefined {
  // The ROOT config: in workspace mode the project's own config has no `watch`.
  // In watch mode the developer is editing the tree on purpose.
  if (project.vitest.config.watch) {
    project.provide('treeWriteSentinel', { mode: 'watch' });
    return undefined;
  }

  const bareBefore = readCoreBare();
  // A refusal here throws: vitest reports it as a startup failure, which it is.
  const dirs = listWatchedDirectories(repoRoot);
  const before = snapshotDirectories(repoRoot, dirs);
  project.provide('treeWriteSentinel', { mode: 'armed', directories: before.size });

  return () => {
    const messages: string[] = [];
    try {
      const changes = diffSnapshots(before, snapshotDirectories(repoRoot, dirs));
      if (changes.length > 0) messages.push(formatChanges(changes));
    } catch (err) {
      messages.push(`tree-write sentinel: could not re-check the tree: ${String(err)}`);
    }
    const flipped = coreBareFlipMessage(bareBefore, readCoreBare(), repoRoot);
    if (flipped !== undefined) messages.push(flipped);
    if (messages.length === 0) return;
    project.vitest.logger.error(`\n${messages.join('\n\n')}\n`);
    process.exitCode = 1;
  };
}
