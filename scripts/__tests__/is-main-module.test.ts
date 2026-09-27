/**
 * `isMainModule` decides whether a guard's main() runs at all. A false
 * negative is a vacuous green — the guard exits 0 having examined nothing —
 * so the symlinked and space-containing invocations the bare
 * `file://${process.argv[1]}` comparison got wrong are pinned here.
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isMainModule } from '../lib/is-main-module';

let dir: string;
let guard: string;
let guardUrl: string;

beforeAll(() => {
  // realpath: on macOS tmpdir() is itself under a symlink (/var → /private/var),
  // and import.meta.url is always the resolved path.
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'is main module ')));
  guard = join(dir, 'verify-thing.ts');
  writeFileSync(guard, '');
  writeFileSync(join(dir, 'other.ts'), '');
  symlinkSync(guard, join(dir, 'link-to-guard.ts'));
  guardUrl = pathToFileURL(guard).href;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('isMainModule', () => {
  it('is true when invoked by its direct path (which here contains spaces)', () => {
    expect(dir).toContain(' ');
    expect(isMainModule(guardUrl, guard)).toBe(true);
  });

  it('is true when invoked through a symlink', () => {
    expect(isMainModule(guardUrl, join(dir, 'link-to-guard.ts'))).toBe(true);
  });

  it('is false when a different file was invoked (the module was imported)', () => {
    expect(isMainModule(guardUrl, join(dir, 'other.ts'))).toBe(false);
  });

  it('is false with no argv[1], or an argv[1] that is not on disk', () => {
    expect(isMainModule(guardUrl, undefined)).toBe(false);
    expect(isMainModule(guardUrl, join(dir, 'missing.ts'))).toBe(false);
  });

  it('the bare template comparison it replaces fails both real cases', () => {
    // Documents the defect: argv[1] is neither encoded nor resolved.
    expect(guardUrl === `file://${guard}`).toBe(false);
    expect(guardUrl === `file://${join(dir, 'link-to-guard.ts')}`).toBe(false);
  });
});
