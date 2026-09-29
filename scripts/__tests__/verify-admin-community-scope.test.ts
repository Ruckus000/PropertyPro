import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { parserSelfTest, scanSource } from '../verify-admin-community-scope';

/**
 * Self-test for `pnpm guard:admin-community-scope` (roadmap 2.10). The guard
 * already runs inline fixtures on every invocation; these tests make that
 * visible to `pnpm test` and pin the real-repo run.
 */
const repoRoot = join(__dirname, '..', '..');
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');
const run = (...args: string[]) =>
  spawnSync(tsxBin, [join(repoRoot, 'scripts/verify-admin-community-scope.ts'), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

describe('scanSource', () => {
  it('flags a communities read missing the real-community predicate', () => {
    const { violations } = scanSource(
      'x.ts',
      `const r = await db.from('communities').select('id').is('deleted_at', null);`,
    );
    expect(violations).toHaveLength(1);
  });

  it('accepts a read carrying both halves of the predicate', () => {
    const { violations, reads } = scanSource(
      'x.ts',
      `const r = await db.from('communities').select('id').eq('is_demo', false).is('deleted_at', null);`,
    );
    expect(reads).toHaveLength(1);
    expect(violations).toHaveLength(0);
  });

  it('flags the inversion: the right column with the wrong value', () => {
    const { violations } = scanSource(
      'x.ts',
      `const r = await db.from('communities').select('id').eq('is_demo', true).is('deleted_at', null);`,
    );
    expect(violations).toHaveLength(1);
  });
});

describe('parserSelfTest', () => {
  it('confirms the parse-failure detector still works', () => {
    expect(parserSelfTest()).toBe(true);
  });
});

describe('guard process', () => {
  it('exits 0 on the real repository', () => {
    expect(run().status).toBe(0);
  });

  it('exits 0 in --selftest mode (its inline fixtures all pass)', () => {
    expect(run('--selftest').status).toBe(0);
  });
});
