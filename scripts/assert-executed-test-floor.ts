/**
 * TST-06 — the EXECUTED-test floor for an integration suite in CI.
 *
 *   pnpm exec tsx scripts/assert-executed-test-floor.ts \
 *     --label apps/web \
 *     --report /tmp/vitest-integration.json \
 *     --floor-file apps/web/__tests__/integration/ci-integration-floor.json
 *
 * with `TESTS_CONCLUSION` set to the conclusion of the step that ran the tests.
 * `.github/workflows/integration-tests.yml` runs it once per vitest suite
 * (apps/web and packages/db), each against its own floor file.
 *
 * PLAYWRIGHT MODE (`--format playwright`) reads a Playwright JSON report. It is
 * used by `.github/workflows/e2e.yml` (the ci-safe-specs suite) and by the
 * production smoke in ci.yml's `perf-check` job. Options:
 *   --exclude-project <name>  drop a project's tests from every count (e2e's
 *                             `warmup` setup project is not a test of the app);
 *   --refuse-skips            any skipped test fails a green run. Both e2e
 *                             suites run a curated list that must not self-skip,
 *                             so a skip there means an incomplete stack;
 *   --floor-key <key>         the floor field to read (default
 *                             `expectedExecutedCount`; ci-safe-specs.json
 *                             calls it `expectedTestCount`).
 * A Playwright test's status is expected | unexpected | flaky | skipped. FLAKY
 * is a fourth bucket, separate from the other two executed ones (a test that
 * failed and then passed on retry), so executed = expected + unexpected + flaky.
 * Omitting it would make one flake trip the floor.
 *
 * WHY AN EXECUTED FLOOR. vitest 3.2.4 already exits 1 when it collects zero
 * files. The silent-green shape that remains is files that ARE collected and
 * then execute nothing: a file-scope `describe.skip`, or an env gate such as
 * `process.env.DATABASE_URL ? describe : describe.skip` flipped to always-skip.
 * That reports `Test Files N passed` and exits 0. Only counting executed tests
 * catches it.
 *
 * ORDERING. An actual failure outranks the floor. When the test step is already
 * red, this prints the buckets for diagnosis and exits 0, so the run does not
 * get a second, misleading red X. Every refusal below applies only when vitest
 * itself reported success:
 *   - no JSON report, or an unparseable one (the run cannot show it ran);
 *   - executed < floor.
 * A floor file that is unreadable, or whose value is not a positive integer, is
 * refused even on a red run. That is a config fault, and an armed check that
 * quietly reads `null` is unarmed.
 *
 * BUCKETS. These were verified against the vitest 3.2.4 JsonReporter source
 * (StatusMap + logTasks), not assumed. The JSON report has NO separate flaky
 * bucket: a test that fails and then passes on retry ends in state "pass" and
 * lands in `passed`. So executed = passed + failed is complete even with
 * retries on. skipped / todo / pending are the not-executed buckets, and an
 * unknown state also falls back to "skipped". The Playwright report that the
 * e2e workflow reads does have a fourth `flaky` bucket; the asymmetry is
 * vitest-vs-Playwright, not an omission.
 *
 * SKIPS are named in a warning, and refused only with --refuse-skips. Both
 * vitest suites have env-gated self-skips in CI (no Supabase Auth, no Stripe
 * key), and the executed floor already catches the mass-skip failure a skip
 * refusal would guard.
 *
 * SETTING A FLOOR. Use the executed count PRINTED by a green CI run, never a
 * local run. Record that run's URL and SHA in the floor file. Raise the floor
 * only by adding tests; lower it only in the PR that removes them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isMainModule } from './lib/is-main-module';

export type TestsConclusion = 'success' | 'failure' | string | undefined;

export type ReportFormat = 'vitest' | 'playwright';

/** The floor, or why it could not be read. */
export type FloorInput = { value: unknown } | { error: string };

/** The report text, or null when there is no report file. */
export type ReportInput = string | null;

export interface FloorResult {
  exitCode: 0 | 1;
  /** stdout lines (the summary). */
  out: string[];
  /** stderr lines (GitHub `::error::` / `::warning::` annotations). */
  err: string[];
}

/** One test, normalised across report formats. */
interface CountedTest {
  file: string;
  name: string;
  status: string;
}

interface VitestFile {
  name?: string;
  assertionResults?: { status?: string; fullName?: string }[];
}

interface PlaywrightSuite {
  title?: string;
  file?: string;
  suites?: PlaywrightSuite[];
  specs?: { title?: string; file?: string; tests?: { projectName?: string; status?: string }[] }[];
}

const VITEST_NOT_EXECUTED = new Set(['skipped', 'todo', 'pending']);
const PLAYWRIGHT_EXECUTED = new Set(['expected', 'unexpected', 'flaky']);

const shortFile = (file: string) => file.split('/').slice(-3).join('/');

function vitestTests(parsed: { testResults?: VitestFile[] }): CountedTest[] {
  return (parsed.testResults ?? []).flatMap((f) =>
    (f.assertionResults ?? []).map((a) => ({
      file: String(f.name ?? ''),
      name: a.fullName ?? '',
      status: a.status ?? 'unknown',
    })),
  );
}

function playwrightTests(
  parsed: { suites?: PlaywrightSuite[] },
  excludeProjects: ReadonlySet<string>,
): CountedTest[] {
  const walk = (suite: PlaywrightSuite, trail: string[]): CountedTest[] => {
    const here = suite.title ? [...trail, suite.title] : trail;
    return [
      ...(suite.suites ?? []).flatMap((child) => walk(child, here)),
      ...(suite.specs ?? []).flatMap((spec) =>
        (spec.tests ?? [])
          .filter((t) => !excludeProjects.has(t.projectName ?? ''))
          .map((t) => ({
            file: String(spec.file ?? suite.file ?? ''),
            name: [...here.slice(1), spec.title ?? ''].join(' › '),
            status: t.status ?? 'unknown',
          })),
      ),
    ];
  };
  return (parsed.suites ?? []).flatMap((suite) => walk(suite, []));
}

export function evaluateFloor(input: {
  label: string;
  floorFile: string;
  floor: FloorInput;
  reportPath: string;
  report: ReportInput;
  testsConclusion: TestsConclusion;
  format?: ReportFormat;
  excludeProjects?: readonly string[];
  refuseSkips?: boolean;
  floorKey?: string;
}): FloorResult {
  const { label, floorFile, reportPath } = input;
  const format = input.format ?? 'vitest';
  const floorKey = input.floorKey ?? 'expectedExecutedCount';
  const out: string[] = [];
  const err: string[] = [];
  const enforce = input.testsConclusion === 'success';

  // Refuse when the tests said green; otherwise the red test step already speaks.
  const refuse = (msg: string): FloorResult => {
    if (enforce) {
      err.push(`::error::[${label}] ${msg}`);
      return { exitCode: 1, out, err };
    }
    err.push(
      `::warning::[${label}] ${msg} (not refusing: the test step already failed, which outranks the floor)`,
    );
    return { exitCode: 0, out, err };
  };

  // Config faults: refused whatever the test step concluded.
  if ('error' in input.floor) {
    err.push(`::error::[${label}] floor file ${floorFile} unreadable (${input.floor.error}).`);
    return { exitCode: 1, out, err };
  }
  const floor = input.floor.value;
  if (typeof floor !== 'number' || !Number.isInteger(floor) || floor <= 0) {
    err.push(
      `::error::[${label}] ${floorKey} in ${floorFile} is ${JSON.stringify(floor)}; the armed floor needs a positive integer.`,
    );
    return { exitCode: 1, out, err };
  }

  if (input.report === null) {
    return refuse(
      `no ${format} JSON report at ${reportPath}: the run did not get far enough to write one, so there is no evidence it executed anything.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.report);
  } catch (e) {
    return refuse(`${format} JSON report unparseable (${(e as Error).message}).`);
  }

  const tests =
    format === 'playwright'
      ? playwrightTests(parsed as { suites?: PlaywrightSuite[] }, new Set(input.excludeProjects ?? []))
      : vitestTests(parsed as { testResults?: VitestFile[] });
  const count = (status: string) => tests.filter((t) => t.status === status).length;

  let executed: number;
  let notExecuted: CountedTest[];
  if (format === 'playwright') {
    executed = tests.filter((t) => PLAYWRIGHT_EXECUTED.has(t.status)).length;
    notExecuted = tests.filter((t) => !PLAYWRIGHT_EXECUTED.has(t.status));
    out.push(
      `e2e floor [${label}]: executed=${executed} collected=${tests.length} expected=${count('expected')} unexpected=${count('unexpected')} flaky=${count('flaky')} skipped=${count('skipped')} floor=${floor}`,
    );
  } else {
    // Unchanged from the line #1316 shipped; CI logs and memory grep for it.
    executed = count('passed') + count('failed');
    notExecuted = tests.filter((t) => VITEST_NOT_EXECUTED.has(t.status));
    out.push(
      `integration floor [${label}]: executed=${executed} collected=${tests.length} passed=${count('passed')} failed=${count('failed')} skipped=${count('skipped')} todo=${count('todo')} pending=${count('pending')} floor=${floor}`,
    );
  }

  if (notExecuted.length > 0) {
    // Name them: a skip that was not there when the floor was set is the
    // earliest visible symptom of the failure mode this guards.
    const names = notExecuted.map((t) => `${shortFile(t.file)} :: ${t.name}`).join(' ; ');
    const msg = `${notExecuted.length} test(s) NOT executed (skipped/todo/pending): ${names}`;
    if (input.refuseSkips) {
      return refuse(
        `${msg}. This suite must not self-skip: either the stack is incomplete (seed? storage bucket? env?) or the test does not belong in it.`,
      );
    }
    err.push(`::warning::[${label}] ${msg}`);
  }

  if (executed < floor) {
    return refuse(
      `executed=${executed} is BELOW the floor ${floor} in ${floorFile}. Either tests were collected but did not run (a file-scope describe.skip, an env gate flipped to always-skip, a spec renamed out of its allowlist), or tests were removed, in which case lower the floor in the same PR.`,
    );
  }
  return { exitCode: 0, out, err };
}

function readFloor(floorFile: string, floorKey: string): FloorInput {
  try {
    const parsed = JSON.parse(readFileSync(floorFile, 'utf8')) as Record<string, unknown>;
    return { value: parsed[floorKey] };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

interface CliArgs {
  label: string;
  report: string;
  floorFile: string;
  format: ReportFormat;
  excludeProjects: string[];
  refuseSkips: boolean;
  floorKey: string;
}

function parseArgs(argv: string[]): CliArgs {
  const valueOf = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    if (i === -1) return undefined;
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing ${flag} <value>`);
    return value;
  };
  const required = (flag: string): string => {
    const value = valueOf(flag);
    if (value === undefined) throw new Error(`missing ${flag} <value>`);
    return value;
  };
  const format = valueOf('--format') ?? 'vitest';
  if (format !== 'vitest' && format !== 'playwright') {
    throw new Error(`--format must be vitest or playwright, not ${format}`);
  }
  const excludeProjects = argv.flatMap((arg, i) => {
    if (arg !== '--exclude-project') return [];
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error('missing --exclude-project <value>');
    return [value];
  });
  return {
    label: required('--label'),
    report: required('--report'),
    floorFile: required('--floor-file'),
    format,
    excludeProjects,
    refuseSkips: argv.includes('--refuse-skips'),
    floorKey: valueOf('--floor-key') ?? 'expectedExecutedCount',
  };
}

function main(): void {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`::error::assert-executed-test-floor: ${(e as Error).message}`);
    process.exit(2);
  }
  const result = evaluateFloor({
    label: args.label,
    floorFile: args.floorFile,
    floor: readFloor(args.floorFile, args.floorKey),
    reportPath: args.report,
    report: existsSync(args.report) ? readFileSync(args.report, 'utf8') : null,
    testsConclusion: process.env.TESTS_CONCLUSION,
    format: args.format,
    excludeProjects: args.excludeProjects,
    refuseSkips: args.refuseSkips,
    floorKey: args.floorKey,
  });
  for (const line of result.out) console.log(line);
  for (const line of result.err) console.error(line);
  process.exit(result.exitCode);
}

if (isMainModule(import.meta.url)) {
  main();
}
