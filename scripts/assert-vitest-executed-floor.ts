/**
 * TST-06 — the EXECUTED-test floor for an integration suite in CI.
 *
 *   pnpm exec tsx scripts/assert-vitest-executed-floor.ts \
 *     --label apps/web \
 *     --report /tmp/vitest-integration.json \
 *     --floor-file apps/web/__tests__/integration/ci-integration-floor.json
 *
 * with `TESTS_CONCLUSION` set to the conclusion of the step that ran vitest.
 * `.github/workflows/integration-tests.yml` runs it once per suite (apps/web and
 * packages/db), each against its own floor file.
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
 * SKIPS are named in a warning and never refused. Both suites have env-gated
 * self-skips in CI (no Supabase Auth, no Stripe key), and the executed floor
 * already catches the mass-skip failure a skip refusal would guard.
 *
 * SETTING A FLOOR. Use the executed count PRINTED by a green CI run, never a
 * local run. Record that run's URL and SHA in the floor file. Raise the floor
 * only by adding tests; lower it only in the PR that removes them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isMainModule } from './lib/is-main-module';

export type TestsConclusion = 'success' | 'failure' | string | undefined;

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

interface AssertionResult {
  status?: string;
  fullName?: string;
}
interface FileResult {
  name?: string;
  assertionResults?: AssertionResult[];
}

const NOT_EXECUTED = new Set(['skipped', 'todo', 'pending']);

export function evaluateFloor(input: {
  label: string;
  floorFile: string;
  floor: FloorInput;
  reportPath: string;
  report: ReportInput;
  testsConclusion: TestsConclusion;
}): FloorResult {
  const { label, floorFile, reportPath } = input;
  const out: string[] = [];
  const err: string[] = [];
  const enforce = input.testsConclusion === 'success';

  // Refuse when vitest said green; otherwise the red test step already speaks.
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
      `::error::[${label}] expectedExecutedCount in ${floorFile} is ${JSON.stringify(floor)}; the armed floor needs a positive integer.`,
    );
    return { exitCode: 1, out, err };
  }

  if (input.report === null) {
    return refuse(
      `no vitest JSON report at ${reportPath}: the run did not get far enough to write one, so there is no evidence it executed anything.`,
    );
  }
  let parsed: { testResults?: FileResult[] };
  try {
    parsed = JSON.parse(input.report) as { testResults?: FileResult[] };
  } catch (e) {
    return refuse(`vitest JSON report unparseable (${(e as Error).message}).`);
  }

  const files = parsed.testResults ?? [];
  const assertions = files.flatMap((f) => f.assertionResults ?? []);
  const count = (status: string) => assertions.filter((a) => a.status === status).length;
  const passed = count('passed');
  const failed = count('failed');
  const skipped = count('skipped');
  const todo = count('todo');
  const pending = count('pending');
  const executed = passed + failed;
  out.push(
    `integration floor [${label}]: executed=${executed} collected=${assertions.length} passed=${passed} failed=${failed} skipped=${skipped} todo=${todo} pending=${pending} floor=${floor}`,
  );

  if (skipped + todo + pending > 0) {
    // Name them: a skip that was not there when the floor was set is the
    // earliest visible symptom of the failure mode this guards.
    const names = files.flatMap((f) =>
      (f.assertionResults ?? [])
        .filter((a) => NOT_EXECUTED.has(a.status ?? ''))
        .map((a) => `${String(f.name ?? '').split('/').slice(-3).join('/')} :: ${a.fullName ?? ''}`),
    );
    err.push(
      `::warning::[${label}] ${skipped + todo + pending} test(s) NOT executed (skipped/todo/pending): ${names.join(' ; ')}`,
    );
  }

  if (executed < floor) {
    return refuse(
      `executed=${executed} is BELOW the floor ${floor} in ${floorFile}. Either tests were collected but did not run (a file-scope describe.skip, an env gate flipped to always-skip), or tests were removed, in which case lower the floor in the same PR.`,
    );
  }
  return { exitCode: 0, out, err };
}

function readFloor(floorFile: string): FloorInput {
  try {
    const parsed = JSON.parse(readFileSync(floorFile, 'utf8')) as { expectedExecutedCount?: unknown };
    return { value: parsed.expectedExecutedCount };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function parseArgs(argv: string[]): { label: string; report: string; floorFile: string } {
  const get = (flag: string): string => {
    const i = argv.indexOf(flag);
    const value = i === -1 ? undefined : argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`missing ${flag} <value>`);
    }
    return value;
  };
  return { label: get('--label'), report: get('--report'), floorFile: get('--floor-file') };
}

function main(): void {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`::error::assert-vitest-executed-floor: ${(e as Error).message}`);
    process.exit(2);
  }
  const result = evaluateFloor({
    label: args.label,
    floorFile: args.floorFile,
    floor: readFloor(args.floorFile),
    reportPath: args.report,
    report: existsSync(args.report) ? readFileSync(args.report, 'utf8') : null,
    testsConclusion: process.env.TESTS_CONCLUSION,
  });
  for (const line of result.out) console.log(line);
  for (const line of result.err) console.error(line);
  process.exit(result.exitCode);
}

if (isMainModule(import.meta.url)) {
  main();
}
