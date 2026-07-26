import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `verify-audit-log-trigger-overrides.ts` walks `apps/` and `packages/` looking
 * for unapproved `ALTER TABLE compliance_audit_log … TRIGGER
 * compliance_audit_log_append_only_guard` statements. It used to skip only
 * `node_modules` and `dist`, so a local `pnpm build` made `pnpm lint` fail:
 * bundlers inline approved source (`packages/db/src/seed/seed-community.ts`)
 * into compiled chunks, and `apps/admin/.next/server/app/api/admin/demos/route.js`
 * got reported as an unauthorized override.
 *
 * The guard is a top-level script with no exported functions, so these are
 * subprocess tests: plant a fixture, run the real script, assert on its exit
 * code.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const guardScript = join(repoRoot, 'scripts', 'verify-audit-log-trigger-overrides.ts');
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');

const OVERRIDE_STATEMENT =
  'ALTER TABLE compliance_audit_log DISABLE TRIGGER compliance_audit_log_append_only_guard';

function runGuard(): { status: number; output: string } {
  const result = spawnSync(tsxBin, [guardScript], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

/**
 * Writes `content` to `relPath`, creating any missing parent directories.
 * Returns a cleanup fn that removes ONLY what this call created — a developer
 * with a real `.next/` build tree must not have it deleted by the test suite.
 */
function plantFixture(relPath: string, content: string): () => void {
  const abs = join(repoRoot, relPath);
  const missingDirs: string[] = [];
  for (let dir = dirname(abs); !existsSync(dir); dir = dirname(dir)) {
    missingDirs.push(dir);
  }
  const shallowestCreated = missingDirs.at(-1);

  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');

  return () => {
    if (shallowestCreated) {
      rmSync(shallowestCreated, { recursive: true, force: true });
    } else {
      rmSync(abs, { force: true });
    }
  };
}

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('guard:audit-log-trigger-overrides', () => {
  it('passes on the working tree as checked in', () => {
    const { status, output } = runGuard();
    expect(output).toContain('Audit-log trigger override guard passed');
    expect(status).toBe(0);
  }, 60_000);

  it('ignores build output — a bundled override in .next must not fail the guard', () => {
    cleanup = plantFixture(
      'apps/admin/.next/server/app/api/admin/demos/route.js',
      `const q = ${JSON.stringify(OVERRIDE_STATEMENT)};\n`,
    );

    const { status, output } = runGuard();
    expect(output).not.toContain('Unauthorized');
    expect(status).toBe(0);
  }, 60_000);

  it.each(['dist', 'build', '.turbo', '.vercel', 'coverage'])(
    'ignores build output in %s/',
    (dir) => {
      cleanup = plantFixture(
        `packages/db/${dir}/bundle.js`,
        `const q = ${JSON.stringify(OVERRIDE_STATEMENT)};\n`,
      );

      const { status, output } = runGuard();
      expect(output).not.toContain('Unauthorized');
      expect(status).toBe(0);
    },
    60_000,
  );

  it('still fails on an unapproved override in source', () => {
    const relPath = 'apps/web/src/lib/__audit-log-guard-fixture__.ts';
    cleanup = plantFixture(relPath, `const q = ${JSON.stringify(OVERRIDE_STATEMENT)};\n`);

    const { status, output } = runGuard();
    expect(output).toContain('Unauthorized compliance_audit_log trigger override(s)');
    expect(output).toContain(relPath);
    expect(status).not.toBe(0);
  }, 60_000);
});
