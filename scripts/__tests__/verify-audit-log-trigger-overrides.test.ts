import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_LOG_TRIGGER_APPROVED_FILES } from '../lib/audit-log-trigger-approved-files';

/**
 * `verify-audit-log-trigger-overrides.ts` walks `apps/` and `packages/` looking
 * for unapproved `ALTER TABLE compliance_audit_log … TRIGGER
 * compliance_audit_log_append_only_guard` statements. It used to skip only
 * `node_modules` and `dist`, so a local `pnpm build` made `pnpm lint` fail:
 * bundlers inline approved source (`packages/db/src/seed/community/users.ts`)
 * into compiled chunks, and `apps/admin/.next/server/app/api/admin/demos/route.js`
 * got reported as an unauthorized override.
 *
 * The guard is a top-level script with no exported functions, so these are
 * subprocess tests: build a fixture tree, run the real script over it with
 * `--root`, assert on its exit code.
 *
 * Fixtures go in a temp directory, never in the real working tree. This file
 * used to plant them under `apps/` and `packages/`, and other guard tests walk
 * those trees in parallel vitest workers: `verify-call-ceilings.test.ts` would
 * list a planted file, find it deleted by the time it read it, and exit 2. That
 * failed the unit suite in 3 of 5 whole-suite runs (2026-10-29).
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const guardScript = join(repoRoot, 'scripts', 'verify-audit-log-trigger-overrides.ts');
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');

const OVERRIDE_STATEMENT =
  'ALTER TABLE compliance_audit_log DISABLE TRIGGER compliance_audit_log_append_only_guard';

const OVERRIDE_SOURCE = `const q = ${JSON.stringify(OVERRIDE_STATEMENT)};\n`;
const APPROVED_SOURCE = `await tx.execute('select pg_advisory_xact_lock(1)');\n${OVERRIDE_SOURCE}`;

function runGuard(args: string[] = []): { status: number; output: string } {
  const result = spawnSync(tsxBin, [guardScript, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

let fixtureRoot: string;

function plant(relPath: string, content: string): void {
  const abs = join(fixtureRoot, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf8');
}

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'audit-log-trigger-overrides-'));
  // The guard checks each approved file against the root it scans, so every
  // fixture tree carries them.
  for (const file of AUDIT_LOG_TRIGGER_APPROVED_FILES) plant(file, APPROVED_SOURCE);
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('guard:audit-log-trigger-overrides', () => {
  // Read-only: scans the real tree and writes nothing to it.
  it('passes on the working tree as checked in', () => {
    const { status, output } = runGuard();
    expect(output).toContain('Audit-log trigger override guard passed');
    expect(status).toBe(0);
  }, 60_000);

  // Control for every fixture-tree case below: the tree they start from passes,
  // so a failure in one of them is caused by what that case planted.
  it('passes on a fixture tree holding only the approved overrides', () => {
    const { status, output } = runGuard(['--root', fixtureRoot]);
    expect(output).toContain('Audit-log trigger override guard passed');
    expect(status).toBe(0);
  }, 60_000);

  it('ignores build output — a bundled override in .next must not fail the guard', () => {
    plant('apps/admin/.next/server/app/api/admin/demos/route.js', OVERRIDE_SOURCE);

    const { status, output } = runGuard(['--root', fixtureRoot]);
    expect(output).not.toContain('Unauthorized');
    expect(status).toBe(0);
  }, 60_000);

  it.each(['dist', 'build', '.turbo', '.vercel', 'coverage'])(
    'ignores build output in %s/',
    (dir) => {
      plant(`packages/db/${dir}/bundle.js`, OVERRIDE_SOURCE);

      const { status, output } = runGuard(['--root', fixtureRoot]);
      expect(output).not.toContain('Unauthorized');
      expect(status).toBe(0);
    },
    60_000,
  );

  it('still fails on an unapproved override in source', () => {
    const relPath = 'apps/web/src/lib/__audit-log-guard-fixture__.ts';
    plant(relPath, OVERRIDE_SOURCE);

    const { status, output } = runGuard(['--root', fixtureRoot]);
    expect(output).toContain('Unauthorized compliance_audit_log trigger override(s)');
    expect(output).toContain(join(fixtureRoot, relPath));
    expect(status).not.toBe(0);
  }, 60_000);

  // The `=` spelling must scan the fixture too, not fall back to the repo:
  // the unapproved override is only in the fixture, so a pass here would mean
  // the real tree was scanned instead.
  it('honours --root=<dir> as well as --root <dir>', () => {
    const relPath = 'apps/web/src/lib/__audit-log-guard-fixture__.ts';
    plant(relPath, OVERRIDE_SOURCE);

    const { status, output } = runGuard([`--root=${fixtureRoot}`]);
    expect(output).toContain(join(fixtureRoot, relPath));
    expect(status).toBe(1);
  }, 60_000);

  // A mistyped --root must refuse (exit 2, "could not check"), never fall back
  // to scanning the repo and pass, and never report a violation (exit 1). Every
  // parse form is covered in root-arg.test.ts; this proves the guard wires it.
  it.each([
    ['a bare --root', ['--root']],
    ['a directory that does not exist', ['--root', join(tmpdir(), 'no-such-dir-4c1e9b')]],
  ])('refuses (exit 2) %s', (_label, args) => {
    const { status, output } = runGuard(args);
    expect(output).toContain('Usage:');
    expect(output).not.toContain('guard passed');
    expect(status).toBe(2);
  }, 60_000);

  // A root that exists but lacks apps/ (or packages/) is the same "could not
  // check": an empty walk must not read as clean.
  it('refuses (exit 2) a root with no apps/ directory', () => {
    rmSync(join(fixtureRoot, 'apps'), { recursive: true, force: true });
    const { status, output } = runGuard(['--root', fixtureRoot]);
    expect(output).toContain('Cannot check');
    expect(status).toBe(2);
  }, 60_000);

  // So is a root missing an approved file: the list or the root is wrong, which
  // is not an unauthorized override.
  it('refuses (exit 2) a root missing an approved file', () => {
    const missing = AUDIT_LOG_TRIGGER_APPROVED_FILES[2];
    rmSync(join(fixtureRoot, missing));
    const { status, output } = runGuard(['--root', fixtureRoot]);
    expect(output).toContain(`Cannot check: approved file ${join(fixtureRoot, missing)} is missing.`);
    expect(status).toBe(2);
  }, 60_000);
});
