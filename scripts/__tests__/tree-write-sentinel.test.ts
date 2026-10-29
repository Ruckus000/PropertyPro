import { mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  diffSnapshots,
  formatChanges,
  SentinelCouldNotCheckError,
  snapshotTree,
} from '../lib/tree-write-sentinel';

// Fixtures live under os.tmpdir(), never in the repo: this file tests the
// sentinel that forbids the latter.
let root: string;

// Linux stamps mtimes from a coarse clock (a few ms). A directory created a
// moment before the first snapshot could get the same stamp again from the
// write under test, and the change would be missed. Backdating every fixture
// directory makes any later create/delete a visible change.
const backdate = (...dirs: string[]): void => {
  const past = new Date('2020-01-01T00:00:00Z');
  for (const dir of dirs) utimesSync(dir, past, past);
};

const smallTree = (): { root: string; dirs: string[] } => {
  const dirs = ['apps/web/src/lib', 'packages/shared/src', 'scripts/__tests__'];
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, 'apps/web/src/lib/existing.ts'), 'export {};\n');
  const all = [
    root,
    join(root, 'apps'),
    join(root, 'apps/web'),
    join(root, 'apps/web/src'),
    join(root, 'apps/web/src/lib'),
    join(root, 'packages'),
    join(root, 'packages/shared'),
    join(root, 'packages/shared/src'),
    join(root, 'scripts'),
    join(root, 'scripts/__tests__'),
  ];
  backdate(...all);
  return { root, dirs: all };
};

const snap = () => snapshotTree(root, { minDirectories: 1 });

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

  it('ignores writes inside skipped cache directories', () => {
    smallTree();
    for (const name of ['node_modules', '.next', '.turbo', 'coverage', '.git']) {
      mkdirSync(join(root, 'apps/web', name));
    }
    backdate(join(root, 'apps/web'));
    const before = snap();
    for (const name of ['node_modules', '.next', '.turbo', 'coverage', '.git']) {
      writeFileSync(join(root, 'apps/web', name, 'cache.json'), '{}');
    }
    expect(diffSnapshots(before, snap())).toEqual([]);
  });
});

describe('snapshotTree refuses to report on a tree it could not check', () => {
  it('refuses when a required top-level directory is missing', () => {
    mkdirSync(join(root, 'apps'));
    mkdirSync(join(root, 'packages'));
    expect(() => snapshotTree(root, { minDirectories: 1 })).toThrow(SentinelCouldNotCheckError);
    expect(() => snapshotTree(root, { minDirectories: 1 })).toThrow(/expected directory "scripts"/);
  });

  it('refuses when the root does not exist', () => {
    expect(() => snapshotTree(join(root, 'nope'))).toThrow(SentinelCouldNotCheckError);
  });

  it('refuses when the walk examined too few directories', () => {
    smallTree();
    expect(() => snapshotTree(root, { minDirectories: 50 })).toThrow(/walked only 10 directories/);
  });

  it('walks the real repo with a non-trivial population', () => {
    const repo = join(import.meta.dirname, '..', '..');
    expect(snapshotTree(repo).size).toBeGreaterThan(500);
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
  // If `globalSetup` is dropped from scripts/vitest.config.ts, nothing would
  // notice: every other test here passes either way. This one would not.
  it('the scripts project global setup armed the sentinel for this run', () => {
    const state = inject('treeWriteSentinel');
    expect(state).toBeDefined();
    if (state.mode === 'armed') expect(state.directories).toBeGreaterThan(500);
    else expect(state.mode).toBe('watch');
  });
});
