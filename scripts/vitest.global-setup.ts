/**
 * Global setup for the `scripts` vitest project: fail the run if any test
 * created, deleted or renamed a file inside the repo, even one it cleaned up
 * again. See `scripts/lib/tree-write-sentinel.ts` for why this exists.
 *
 * Teardown runs once, after every test in the run has finished. In a root
 * `pnpm test` (every workspace project at once) it therefore also sees writes
 * made by other projects' tests. That is deliberate: those writes race these
 * guards in exactly the same way.
 */
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { diffSnapshots, formatChanges, snapshotTree } from './lib/tree-write-sentinel';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Read by `__tests__/tree-write-sentinel.test.ts` to prove this setup ran. */
    treeWriteSentinel: { mode: 'armed'; directories: number } | { mode: 'watch' };
  }
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default function setup(project: TestProject): (() => void) | undefined {
  // In watch mode the developer is editing the tree on purpose.
  if (project.config.watch) {
    project.provide('treeWriteSentinel', { mode: 'watch' });
    return undefined;
  }

  const before = snapshotTree(repoRoot);
  project.provide('treeWriteSentinel', { mode: 'armed', directories: before.size });

  return () => {
    const changes = diffSnapshots(before, snapshotTree(repoRoot));
    if (changes.length > 0) throw new Error(formatChanges(changes));
  };
}
