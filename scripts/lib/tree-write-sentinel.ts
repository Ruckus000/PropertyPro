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
 * Which directories: those git would show you (tracked or untracked, not
 * ignored), minus any path with a dot-prefixed segment. Gitignored trees are
 * build output and tool state (`dist/`, `.next/`, `.claude/worktrees/`) that
 * tools rewrite mid-run; dot directories are agent and tool config, and the
 * harness writes lock files into the tracked `.claude/`. The repo root itself
 * is watched (a fixture directory planted there moves its mtime).
 *
 * ponytail: in-place rewrites of existing files are not seen (dir mtime
 * unchanged). Trigger: a guard test fails on a file another test rewrote in place.
 * ponytail: a tool run alongside the tests can still trip it: a concurrent
 * `pnpm build` (tsup writes and deletes `tsup.config.bundled_*.mjs` in each
 * package root; that file also races the guards that walk `packages/`) or the
 * first `*.tsbuildinfo` from a concurrent typecheck. Trigger: a sentinel
 * failure that no test caused.
 * ponytail: writes inside an existing ignored or dot dir are not seen; no guard
 * scans those. Trigger: a guard starts scanning one.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Top-level directories whose absence means we are not looking at the repo. */
export const REQUIRED_ROOTS = ['apps', 'packages', 'scripts'] as const;

/** Below this many directories the listing examined too little to be trusted. */
export const MIN_DIRECTORIES = 500;

export interface DirState {
  /** `mtimeNs` as a string, so the snapshot stays JSON-friendly. */
  mtimeNs: string;
  entries: string[];
}

/** Repo-relative POSIX directory path → state. The root itself is `.`. */
export type TreeSnapshot = Map<string, DirState>;

export class SentinelCouldNotCheckError extends Error {}

const refuse = (message: string): never => {
  throw new SentinelCouldNotCheckError(`tree-write sentinel: ${message}; refusing to report a clean tree`);
};

/**
 * Every directory holding a file git would show (tracked or untracked, not
 * ignored), every ancestor of one, and `.`, excluding dot-prefixed segments.
 * Same enumeration as `verify-service-dead-exports.ts`.
 */
export function listWatchedDirectories(
  root: string,
  options: { requiredRoots?: readonly string[]; minDirectories?: number } = {},
): string[] {
  const requiredRoots = options.requiredRoots ?? REQUIRED_ROOTS;
  const minDirectories = options.minDirectories ?? MIN_DIRECTORIES;

  const res = spawnSync(
    'git',
    ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.error) refuse(`could not run git ls-files in ${root}: ${String(res.error)}`);
  if (res.status !== 0) refuse(`git ls-files exited ${res.status} in ${root}: ${res.stderr.trim()}`);

  const dirs = new Set<string>(['.']);
  for (const file of res.stdout.split('\0')) {
    const segments = file.split('/');
    for (let i = 1; i < segments.length; i += 1) {
      if (segments[i - 1]!.startsWith('.')) break;
      dirs.add(segments.slice(0, i).join('/'));
    }
  }

  for (const name of requiredRoots) {
    if (!dirs.has(name)) refuse(`git lists no files under "${name}" in ${root}`);
  }
  if (dirs.size < minDirectories) {
    refuse(`found only ${dirs.size} directories under ${root} (minimum ${minDirectories})`);
  }
  return [...dirs].sort();
}

/** Record each directory's mtime and entry names. A missing directory is skipped. */
export function snapshotDirectories(root: string, dirs: readonly string[]): TreeSnapshot {
  const snapshot: TreeSnapshot = new Map();
  for (const dir of dirs) {
    const abs = join(root, dir);
    try {
      const { mtimeNs } = statSync(abs, { bigint: true });
      snapshot.set(dir, { mtimeNs: mtimeNs.toString(), entries: readdirSync(abs).sort() });
    } catch (err) {
      // Gone (a tracked file deleted in the worktree, or removed mid-run): the
      // parent's mtime records the change, so there is nothing to read here.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
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
 * and deleted again during the run.
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
    `tree-write sentinel: tests changed ${changes.length} director${changes.length === 1 ? 'y' : 'ies'} inside the repo while they ran:`,
    ...lines,
    '',
    'Other guard tests scan these trees in parallel workers, and a file that is listed and then',
    'deleted before it is read makes them fail at random. Build fixtures under os.tmpdir()',
    '(mkdtempSync) and point the guard at them with a --root option or a root parameter.',
    'If YOU created or deleted files in the repo during the run (an editor swap file, a',
    'branch switch), re-run.',
  ].join('\n');
}
