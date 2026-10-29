/**
 * Tree-write sentinel: did anything create, delete or rename a file inside the
 * repo while a test run was in progress?
 *
 * Why it exists: guard tests under `scripts/__tests__/` kept planting fixture
 * files in the real tree (`apps/`, `packages/`, the repo root) and deleting
 * them in `afterEach`. Other guard tests scan those trees in parallel workers,
 * so a file listed and then deleted before it is read gives ENOENT, and an
 * unrelated guard test fails with exit 2 ("could not check"). That was fixed
 * one test at a time (`verify-shared-side-effects`, then PR #1415 for
 * `verify-audit-log-trigger-overrides` and `verify-internal-cron-auth`).
 * Nothing stopped the next one. This turns the intermittent race into a
 * failure on every run.
 *
 * How: creating, deleting or renaming an entry updates its parent directory's
 * mtime. So a snapshot of every directory's mtime before the run, compared
 * against one after it, catches a fixture that was planted and removed again
 * within the run, even though no file is left behind.
 *
 * Out of scope: rewriting an EXISTING file in place leaves its directory's
 * mtime alone, so this does not see it. That cannot cause the ENOENT race
 * above, and tracking file mtimes would flag every editor save made during a
 * local run.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Directory names never descended into: dependencies, VCS metadata, and the
 * caches that tooling legitimately writes while tests run (a concurrent
 * `next dev`, turbo, coverage output). Measured 2026-10-29: the full scripts
 * project writes nothing else in the tree.
 */
export const SKIP_DIR_NAMES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'coverage',
]);

/** Top-level directories whose absence means we are not looking at the repo. */
export const REQUIRED_ROOTS = ['apps', 'packages', 'scripts'] as const;

/** Below this many directories the walk examined too little to be trusted. */
export const MIN_DIRECTORIES = 50;

export interface DirState {
  /** `mtimeNs` as a string, so the snapshot stays JSON-friendly. */
  mtimeNs: string;
  entries: string[];
}

/** Repo-relative POSIX directory path → state. The root itself is `.`. */
export type TreeSnapshot = Map<string, DirState>;

export class SentinelCouldNotCheckError extends Error {}

const toKey = (root: string, abs: string): string => {
  const rel = relative(root, abs);
  return rel === '' ? '.' : rel.split(sep).join('/');
};

/**
 * Walk `root` and record every directory's mtime and entry names. Refuses
 * (throws `SentinelCouldNotCheckError`) when the root does not look like the
 * repo or the walk found too few directories to mean anything.
 */
export function snapshotTree(
  root: string,
  options: { requiredRoots?: readonly string[]; minDirectories?: number } = {},
): TreeSnapshot {
  const requiredRoots = options.requiredRoots ?? REQUIRED_ROOTS;
  const minDirectories = options.minDirectories ?? MIN_DIRECTORIES;

  for (const name of requiredRoots) {
    let isDir = false;
    try {
      isDir = statSync(join(root, name)).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      throw new SentinelCouldNotCheckError(
        `tree-write sentinel: expected directory "${name}" under ${root}; refusing to report a clean tree`,
      );
    }
  }

  const snapshot: TreeSnapshot = new Map();
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    let mtimeNs: bigint;
    try {
      mtimeNs = statSync(dir, { bigint: true }).mtimeNs;
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      // A directory that vanished between being listed and being read is
      // itself a change; the parent's mtime records it, so skip it here.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    const names: string[] = [];
    for (const entry of entries) {
      names.push(entry.name);
      if (entry.isDirectory() && !SKIP_DIR_NAMES.has(entry.name)) {
        stack.push(join(dir, entry.name));
      }
    }
    names.sort();
    snapshot.set(toKey(root, dir), { mtimeNs: mtimeNs.toString(), entries: names });
  }

  if (snapshot.size < minDirectories) {
    throw new SentinelCouldNotCheckError(
      `tree-write sentinel: walked only ${snapshot.size} directories under ${root} (minimum ${minDirectories}); refusing to report a clean tree`,
    );
  }
  return snapshot;
}

export interface TreeChange {
  dir: string;
  added: string[];
  removed: string[];
}

/**
 * Directories present in both snapshots whose mtime moved. `added`/`removed`
 * name the entries still visible; both empty means something was created
 * and deleted again during the run. Directories that only appear in `after`
 * or only in `before` are reported through their parent's entry lists.
 */
export function diffSnapshots(before: TreeSnapshot, after: TreeSnapshot): TreeChange[] {
  const changes: TreeChange[] = [];
  for (const [dir, prev] of before) {
    const next = after.get(dir);
    if (!next || next.mtimeNs === prev.mtimeNs) continue;
    const prevSet = new Set(prev.entries);
    const nextSet = new Set(next.entries);
    changes.push({
      dir,
      added: next.entries.filter((name) => !prevSet.has(name)),
      removed: prev.entries.filter((name) => !nextSet.has(name)),
    });
  }
  return changes.sort((a, b) => a.dir.localeCompare(b.dir));
}

export function formatChanges(changes: TreeChange[]): string {
  const lines = changes.map((change) => {
    const parts: string[] = [];
    if (change.added.length > 0) parts.push(`added ${change.added.join(', ')}`);
    if (change.removed.length > 0) parts.push(`removed ${change.removed.join(', ')}`);
    if (parts.length === 0) parts.push('an entry was created and deleted again during the run');
    return `  - ${change.dir}/: ${parts.join('; ')}`;
  });
  return [
    `Tests changed ${changes.length} director${changes.length === 1 ? 'y' : 'ies'} inside the repo while they ran:`,
    ...lines,
    '',
    'Other guard tests scan these trees in parallel workers, and a file that is listed and then',
    'deleted before it is read makes them fail at random. Build fixtures under os.tmpdir()',
    '(mkdtempSync) and point the guard at them with a --root option or a root parameter.',
    'If YOU created or deleted files in the repo during the run (an editor swap file, a',
    'branch switch), re-run.',
  ].join('\n');
}
