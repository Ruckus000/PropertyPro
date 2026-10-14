/**
 * Every elections route must AWAIT requireElectionsEnabled.
 *
 * The gate is async (it reads the plan). An unawaited call fails OPEN: the
 * rejection is dropped and the handler carries on. The route tests mock the
 * helper, so they cannot see a missing `await` except at the one site that
 * tests an async rejection; this source check covers all of them.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../src/app/api/v1/elections');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

describe('elections routes await the elections gate', () => {
  const files = routeFiles(ROOT);
  const calls = files.flatMap((file) => {
    const lines = readFileSync(file, 'utf8').split('\n');
    return lines
      .map((line, i) => ({ file: relative(ROOT, file), line: i + 1, text: line.trim() }))
      .filter(({ text }) => /\brequireElectionsEnabled\(/.test(text) && !text.startsWith('*'));
  });

  it('finds the call sites it is checking', () => {
    // 15 calls across 14 route files on 2026-10-14. A drop to zero means the
    // scan broke, not that the routes are safe.
    expect(calls.length).toBeGreaterThanOrEqual(15);
  });

  it('awaits every call', () => {
    const unawaited = calls.filter(({ text }) => !/\bawait requireElectionsEnabled\(/.test(text));
    expect(unawaited.map(({ file, line }) => `${file}:${line}`)).toEqual([]);
  });
});
