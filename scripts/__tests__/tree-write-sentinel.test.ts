import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { withoutGitEnv } from '../lib/git-env';
import {
  diffSnapshots,
  formatChanges,
  listWatchedDirectories,
  SentinelCouldNotCheckError,
  snapshotDirectories,
} from '../lib/tree-write-sentinel';

// Fixtures live under os.tmpdir(), never in the repo: this file tests the
// sentinel that forbids the latter.
let root: string;

const DIRS = ['.', 'apps', 'apps/web', 'apps/web/src', 'apps/web/src/lib', 'packages', 'packages/shared', 'packages/shared/src'];

// Linux stamps mtimes from a coarse clock (a few ms). A directory created a
// moment before the first snapshot could get the same stamp again from the
// write under test, and the change would be missed. Backdating every fixture
// directory makes any later create/delete a visible change.
const smallTree = (): void => {
  mkdirSync(join(root, 'apps/web/src/lib'), { recursive: true });
  mkdirSync(join(root, 'packages/shared/src'), { recursive: true });
  writeFileSync(join(root, 'apps/web/src/lib/existing.ts'), 'export {};\n');
  const past = new Date('2020-01-01T00:00:00Z');
  for (const dir of DIRS) utimesSync(join(root, dir), past, past);
};

const snap = () => snapshotDirectories(root, DIRS);

// Every git call here runs without the inherited GIT_* variables: localci runs
// this suite from the pre-push hook, which exports the real repo's GIT_DIR, and
// `git init` then re-initialises THAT repo as bare instead of creating one in
// `dir`. `-C dir` alone does not prevent it. The developer's global and system
// config are ignored too, so their hooks and templates never run here. Built per
// call: a test may stub process.env.
const testGitEnv = (): NodeJS.ProcessEnv => ({
  ...withoutGitEnv(),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
});

const gitInit = (dir: string): void => {
  const init = spawnSync('git', ['-C', dir, 'init', '-q'], { encoding: 'utf-8', env: testGitEnv() });
  expect(init.status, init.stderr).toBe(0);
};

const write = (rel: string, content = 'x\n'): void => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tree-write-sentinel-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('diffSnapshots', () => {
  it('reports nothing when nothing changed (control)', () => {
    smallTree();
    const before = snap();
    expect(diffSnapshots(before, snap())).toEqual([]);
  });

  it('reports nothing when an existing file is rewritten in place (out of scope)', () => {
    smallTree();
    const before = snap();
    writeFileSync(join(root, 'apps/web/src/lib/existing.ts'), 'export const x = 1;\n');
    expect(diffSnapshots(before, snap())).toEqual([]);
  });

  it('catches a fixture planted and deleted again before the second snapshot', () => {
    smallTree();
    const before = snap();
    const planted = join(root, 'apps/web/src/lib/__fixture.ts');
    writeFileSync(planted, 'export {};\n');
    rmSync(planted);
    expect(diffSnapshots(before, snap())).toEqual([
      { dir: 'apps/web/src/lib', added: [], removed: [] },
    ]);
  });

  it('names a fixture that was left behind', () => {
    smallTree();
    const before = snap();
    writeFileSync(join(root, 'packages/shared/src/leftover.ts'), 'export {};\n');
    expect(diffSnapshots(before, snap())).toEqual([
      { dir: 'packages/shared/src', added: ['leftover.ts'], removed: [] },
    ]);
  });

  it('catches a planted directory tree at the repo root', () => {
    smallTree();
    const before = snap();
    mkdirSync(join(root, '.fixture-123/nested'), { recursive: true });
    rmSync(join(root, '.fixture-123'), { recursive: true });
    expect(diffSnapshots(before, snap())).toEqual([{ dir: '.', added: [], removed: [] }]);
  });

  it('catches a deletion and a rename', () => {
    smallTree();
    const before = snap();
    renameSync(join(root, 'apps/web/src/lib/existing.ts'), join(root, 'apps/web/src/lib/moved.ts'));
    expect(diffSnapshots(before, snap())).toEqual([
      { dir: 'apps/web/src/lib', added: ['moved.ts'], removed: ['existing.ts'] },
    ]);
  });
});

describe('listWatchedDirectories', () => {
  it('lists what git would show, minus ignored and dot-prefixed directories', () => {
    gitInit(root);
    write('.gitignore', 'dist/\n');
    write('apps/web/src/a.ts');
    write('packages/ui/src/index.ts');
    write('packages/ui/dist/bundle.js');
    write('.claude/x/lock');
    write('apps/web/.cache/y');
    write('scripts/new/untracked.ts');

    expect(listWatchedDirectories(root, { minDirectories: 1 })).toEqual([
      '.',
      'apps',
      'apps/web',
      'apps/web/src',
      'packages',
      'packages/ui',
      'packages/ui/src',
      'scripts',
      'scripts/new',
    ]);
  });

  it('refuses outside a git work tree', () => {
    mkdirSync(join(root, 'apps'));
    expect(() => listWatchedDirectories(root, { minDirectories: 1 })).toThrow(SentinelCouldNotCheckError);
    expect(() => listWatchedDirectories(root, { minDirectories: 1 })).toThrow(/git ls-files exited/);
  });

  it('refuses when git lists nothing under a required root', () => {
    gitInit(root);
    write('apps/a.ts');
    write('packages/b.ts');
    expect(() => listWatchedDirectories(root, { minDirectories: 1 })).toThrow(/no files under "scripts"/);
  });

  it('refuses when it found too few directories', () => {
    gitInit(root);
    for (const dir of ['apps', 'packages', 'scripts']) write(`${dir}/a.ts`);
    expect(() => listWatchedDirectories(root, { minDirectories: 50 })).toThrow(/found only 4 directories/);
  });

  it('finds a non-trivial population in the real repo', () => {
    expect(listWatchedDirectories(join(import.meta.dirname, '..', '..')).length).toBeGreaterThan(500);
  });
});

describe('an inherited git environment', () => {
  // The pre-push hook that starts localci exports GIT_DIR, and this suite
  // inherits it. In a linked worktree that is `.git/worktrees/<name>`, whose
  // config is the main repo's shared `.git/config`; a `git init` under it
  // writes `core.bare = true` there (with or without `-C`). Recreate that
  // shape under os.tmpdir() and check nothing here touches it.
  let decoy: string;
  let worktreeGitDir: string;

  const git = (...args: string[]): string => {
    const res = spawnSync('git', args, { encoding: 'utf-8', env: testGitEnv() });
    expect(res.status, res.stderr).toBe(0);
    return res.stdout.trim();
  };

  const mainIsBare = (): string => git('config', '--file', join(decoy, 'main', '.git', 'config'), '--get', 'core.bare');

  beforeEach(() => {
    decoy = mkdtempSync(join(tmpdir(), 'tree-write-sentinel-decoy-'));
    const main = join(decoy, 'main');
    mkdirSync(main);
    gitInit(main);
    // A tracked file only the decoy has: a sentinel that read the decoy's
    // index would list `decoy-only`.
    mkdirSync(join(main, 'decoy-only'));
    writeFileSync(join(main, 'decoy-only', 'tracked.ts'), 'export {};\n');
    git('-C', main, 'add', '.');
    git('-C', main, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'init');
    git('-C', main, 'worktree', 'add', '-q', join(decoy, 'wt'));
    worktreeGitDir = git('-C', join(decoy, 'wt'), 'rev-parse', '--absolute-git-dir');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(decoy, { recursive: true, force: true });
  });

  it('leaves the repository an inherited GIT_DIR points at untouched', () => {
    expect(mainIsBare()).toBe('false');
    vi.stubEnv('GIT_DIR', worktreeGitDir);

    gitInit(root);
    expect(mainIsBare()).toBe('false');
    expect(existsSync(join(root, '.git'))).toBe(true);

    for (const dir of ['apps', 'packages', 'scripts']) write(`${dir}/a.ts`);
    expect(listWatchedDirectories(root, { minDirectories: 1 })).toEqual(['.', 'apps', 'packages', 'scripts']);
    expect(mainIsBare()).toBe('false');
  });

  it('strips every GIT_* variable and keeps the rest', () => {
    const env = { GIT_DIR: '/x', GIT_WORK_TREE: '/y', GIT_INDEX_FILE: '/z', NODE_ENV: 'test', PATH: '/bin' } as const;
    expect(withoutGitEnv(env)).toEqual({ NODE_ENV: 'test', PATH: '/bin' });
    expect(env.GIT_DIR).toBe('/x'); // the input is not mutated
  });
});

describe('formatChanges', () => {
  it('names every directory and says what to do instead', () => {
    const message = formatChanges([
      { dir: '.', added: [], removed: [] },
      { dir: 'apps/web/src/lib', added: ['a.ts'], removed: ['b.ts'] },
    ]);
    expect(message).toContain('changed 2 directories');
    expect(message).toContain('  - ./: an entry was created and deleted again during the run');
    expect(message).toContain('  - apps/web/src/lib/: added a.ts; removed b.ts');
    expect(message).toContain('os.tmpdir()');
  });
});

describe('wiring', () => {
  // If `globalSetup` is dropped from scripts/vitest.config.ts, or reads the
  // wrong config's `watch`, nothing else here would notice.
  it('the scripts project global setup armed the sentinel to match the run mode', () => {
    const state = inject('treeWriteSentinel');
    expect(state).toBeDefined();
    expect(state.mode).toBe(process.env.VITEST_MODE === 'WATCH' ? 'watch' : 'armed');
    if (state.mode === 'armed') expect(state.directories).toBeGreaterThan(500);
  });
});
