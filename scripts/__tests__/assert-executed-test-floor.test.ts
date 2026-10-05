/**
 * The TST-06 executed-test floor (scripts/assert-executed-test-floor.ts),
 * which CI runs after each integration suite (vitest) and each e2e suite
 * (Playwright). Each case below is a branch the
 * workflow depends on: a mass skip must fail a green run, a red run must not get
 * a second red X, and a floor that reads `null` must never pass as armed.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluateFloor, type FloorInput, type ReportInput } from '../assert-executed-test-floor';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const script = join(repoRoot, 'scripts', 'assert-executed-test-floor.ts');
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');

const FLOOR = 491;

function report(passed: number, failed = 0, skipped = 0): string {
  const results = [
    ...Array.from({ length: passed }, (_, i) => ({ status: 'passed', fullName: `p${i}` })),
    ...Array.from({ length: failed }, (_, i) => ({ status: 'failed', fullName: `f${i}` })),
    ...Array.from({ length: skipped }, (_, i) => ({ status: 'skipped', fullName: `s${i}` })),
  ];
  return JSON.stringify({ testResults: [{ name: '/repo/a/b/c.integration.test.ts', assertionResults: results }] });
}

function run(r: ReportInput, conclusion: string, floor: FloorInput = { value: FLOOR }) {
  return evaluateFloor({
    label: 'test-suite',
    floorFile: 'floor.json',
    floor,
    reportPath: '/tmp/report.json',
    report: r,
    testsConclusion: conclusion,
  });
}

const errors = (r: ReturnType<typeof run>) => r.err.filter((l) => l.startsWith('::error::'));
const warnings = (r: ReturnType<typeof run>) => r.err.filter((l) => l.startsWith('::warning::'));

describe('evaluateFloor — a green test step is held to the floor', () => {
  it('passes at exactly the floor, naming the expected skips as a warning', () => {
    const r = run(report(491, 0, 2), 'success');
    expect(r.exitCode).toBe(0);
    expect(r.out).toEqual([
      'integration floor [test-suite]: executed=491 collected=493 passed=491 failed=0 skipped=2 todo=0 pending=0 floor=491',
    ]);
    expect(errors(r)).toEqual([]);
    expect(warnings(r)).toHaveLength(1);
    expect(warnings(r)[0]).toContain('2 test(s) NOT executed');
    expect(warnings(r)[0]).toContain('a/b/c.integration.test.ts :: s0');
  });

  it('passes above the floor (it is a floor, not an equality)', () => {
    const r = run(report(500), 'success');
    expect(r.exitCode).toBe(0);
    expect(r.err).toEqual([]);
  });

  it('refuses one below the floor', () => {
    const r = run(report(490), 'success');
    expect(r.exitCode).toBe(1);
    expect(errors(r)[0]).toContain('executed=490 is BELOW the floor 491');
  });

  it('refuses a mass skip: everything collected, nothing executed', () => {
    const r = run(report(0, 0, 493), 'success');
    expect(r.exitCode).toBe(1);
    expect(r.out[0]).toContain('executed=0 collected=493');
    expect(errors(r)[0]).toContain('executed=0 is BELOW the floor');
  });

  it('counts failed tests as executed (no flaky bucket in the vitest report)', () => {
    const r = run(report(490, 1), 'success');
    expect(r.exitCode).toBe(0);
    expect(r.out[0]).toContain('executed=491');
  });

  it('refuses a missing report', () => {
    const r = run(null, 'success');
    expect(r.exitCode).toBe(1);
    expect(errors(r)[0]).toContain('no vitest JSON report at /tmp/report.json');
  });

  it('refuses an unparseable report', () => {
    const r = run('{not json', 'success');
    expect(r.exitCode).toBe(1);
    expect(errors(r)[0]).toContain('vitest JSON report unparseable');
  });
});

describe('evaluateFloor — a red test step outranks the floor', () => {
  it('only warns when below the floor', () => {
    const r = run(report(10, 3), 'failure');
    expect(r.exitCode).toBe(0);
    expect(errors(r)).toEqual([]);
    expect(warnings(r)[0]).toContain('executed=13 is BELOW the floor');
    expect(warnings(r)[0]).toContain('the test step already failed');
  });

  it('only warns when there is no report', () => {
    const r = run(null, 'failure');
    expect(r.exitCode).toBe(0);
    expect(errors(r)).toEqual([]);
    expect(warnings(r)[0]).toContain('no vitest JSON report');
  });
});

describe('evaluateFloor — a floor that is not armed is a config fault, refused on any run', () => {
  it.each([
    ['null', { value: null }],
    ['zero', { value: 0 }],
    ['a string', { value: '491' }],
    ['a fraction', { value: 491.5 }],
  ] as const)('refuses a floor that is %s, on a green run', (_name, floor) => {
    const r = run(report(491), 'success', floor);
    expect(r.exitCode).toBe(1);
    expect(errors(r)[0]).toContain('the armed floor needs a positive integer');
  });

  it('refuses a null floor even when the test step failed', () => {
    const r = run(report(491), 'failure', { value: null });
    expect(r.exitCode).toBe(1);
    expect(errors(r)[0]).toContain('the armed floor needs a positive integer');
  });

  it('refuses an unreadable floor file', () => {
    const r = run(report(491), 'success', { error: 'ENOENT' });
    expect(r.exitCode).toBe(1);
    expect(errors(r)[0]).toContain('floor file floor.json unreadable (ENOENT)');
  });
});

/** A Playwright JSON report: nested suites → specs → per-project tests. */
function pwReport(tests: { status: string; projectName?: string; title?: string }[]): string {
  return JSON.stringify({
    suites: [
      {
        title: 'admin-shell.spec.ts',
        file: 'admin-shell.spec.ts',
        suites: [
          {
            title: 'Admin shell',
            specs: tests.map((t, i) => ({
              title: t.title ?? `case ${i}`,
              file: 'admin-shell.spec.ts',
              tests: [{ projectName: t.projectName ?? 'chromium', status: t.status }],
            })),
          },
        ],
      },
    ],
  });
}

function runPw(
  r: ReportInput,
  conclusion: string,
  floorValue: number,
  opts: { excludeProjects?: string[]; refuseSkips?: boolean } = {},
) {
  return evaluateFloor({
    label: 'e2e',
    floorFile: 'ci-safe-specs.json',
    floor: { value: floorValue },
    reportPath: '/tmp/pw.json',
    report: r,
    testsConclusion: conclusion,
    format: 'playwright',
    floorKey: 'expectedTestCount',
    ...opts,
  });
}

const many = (n: number, status: string) => Array.from({ length: n }, () => ({ status }));

describe('evaluateFloor — Playwright reports', () => {
  it('counts expected + unexpected + FLAKY as executed (flaky is a separate fourth bucket)', () => {
    const r = runPw(pwReport([...many(57, 'expected'), ...many(1, 'unexpected'), ...many(1, 'flaky')]), 'success', 59);
    expect(r.exitCode).toBe(0);
    expect(r.out).toEqual([
      'e2e floor [e2e]: executed=59 collected=59 expected=57 unexpected=1 flaky=1 skipped=0 floor=59',
    ]);
  });

  it('excludes the warmup project from every count, so it cannot hide a missing spec', () => {
    const tests = [...many(58, 'expected'), { status: 'expected', projectName: 'warmup' }];
    const counted = runPw(pwReport(tests), 'success', 59, { excludeProjects: ['warmup'] });
    expect(counted.exitCode).toBe(1);
    expect(counted.out[0]).toContain('executed=58 collected=58');
    // Control: without the exclusion the warmup test would make up the shortfall.
    expect(runPw(pwReport(tests), 'success', 59).exitCode).toBe(0);
  });

  it('refuses a skip with --refuse-skips, naming the spec', () => {
    const r = runPw(pwReport([...many(59, 'expected'), { status: 'skipped', title: 'esign template' }]), 'success', 59, {
      refuseSkips: true,
    });
    expect(r.exitCode).toBe(1);
    expect(errors(r)[0]).toContain('1 test(s) NOT executed');
    expect(errors(r)[0]).toContain('admin-shell.spec.ts :: Admin shell › esign template');
    expect(errors(r)[0]).toContain('must not self-skip');
  });

  it('only warns about a skip without --refuse-skips', () => {
    const r = runPw(pwReport([...many(59, 'expected'), ...many(1, 'skipped')]), 'success', 59);
    expect(r.exitCode).toBe(0);
    expect(warnings(r)[0]).toContain('1 test(s) NOT executed');
  });

  it('refuses below the floor (a spec renamed out of the allowlist)', () => {
    const r = runPw(pwReport(many(56, 'expected')), 'success', 59);
    expect(r.exitCode).toBe(1);
    expect(errors(r)[0]).toContain('executed=56 is BELOW the floor 59 in ci-safe-specs.json');
  });

  it('stands down on a red run, even for a refused skip', () => {
    const r = runPw(pwReport([...many(10, 'unexpected'), ...many(1, 'skipped')]), 'failure', 59, { refuseSkips: true });
    expect(r.exitCode).toBe(0);
    expect(errors(r)).toEqual([]);
  });

  it('names the floor key it read when the floor is not armed', () => {
    const r = evaluateFloor({
      label: 'e2e',
      floorFile: 'ci-safe-specs.json',
      floor: { value: undefined },
      reportPath: '/tmp/pw.json',
      report: pwReport(many(59, 'expected')),
      testsConclusion: 'success',
      format: 'playwright',
      floorKey: 'expectedTestCount',
    });
    expect(r.exitCode).toBe(1);
    expect(errors(r)[0]).toContain('expectedTestCount in ci-safe-specs.json is undefined');
  });
});

describe('CLI', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function cli(reportText: string | null, floor: unknown, conclusion = 'success', extraArgs: string[] = []) {
    dir = mkdtempSync(join(tmpdir(), 'floor-cli-'));
    const reportPath = join(dir, 'report.json');
    const floorPath = join(dir, 'floor.json');
    if (reportText !== null) writeFileSync(reportPath, reportText);
    writeFileSync(floorPath, JSON.stringify({ expectedExecutedCount: floor }));
    return spawnSync(
      tsxBin,
      [script, '--label', 'cli', '--report', reportPath, '--floor-file', floorPath, ...extraArgs],
      { encoding: 'utf8', env: { ...process.env, TESTS_CONCLUSION: conclusion } },
    );
  }

  // Proves main() actually runs when invoked; a skipped main() exits 0 having
  // examined nothing, which is the failure isMainModule exists to prevent.
  it('exits 1 and prints the error when invoked below the floor', () => {
    const result = cli(report(5), 6);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('integration floor [cli]: executed=5');
    expect(result.stderr).toContain('::error::[cli] executed=5 is BELOW the floor 6');
  });

  it('exits 0 at the floor', () => {
    const result = cli(report(6), 6);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('executed=6');
  });

  it('reads --floor-key and Playwright options from the command line', () => {
    dir = mkdtempSync(join(tmpdir(), 'floor-cli-'));
    const reportPath = join(dir, 'pw.json');
    const floorPath = join(dir, 'specs.json');
    writeFileSync(reportPath, pwReport([...many(3, 'expected'), { status: 'expected', projectName: 'warmup' }]));
    writeFileSync(floorPath, JSON.stringify({ expectedTestCount: 3, specs: [] }));
    const result = spawnSync(
      tsxBin,
      [script, '--label', 'cli-e2e', '--format', 'playwright', '--exclude-project', 'warmup', '--refuse-skips',
        '--floor-key', 'expectedTestCount', '--report', reportPath, '--floor-file', floorPath],
      { encoding: 'utf8', env: { ...process.env, TESTS_CONCLUSION: 'success' } },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('e2e floor [cli-e2e]: executed=3 collected=3');
  });

  it('exits 2 on an unknown --format', () => {
    const result = spawnSync(tsxBin, [script, '--label', 'x', '--report', 'r', '--floor-file', 'f', '--format', 'junit'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--format must be vitest or playwright');
  });

  it('exits 2 when a required argument is missing', () => {
    const result = spawnSync(tsxBin, [script, '--label', 'cli'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('missing --report <value>');
  });
});
