/**
 * Every scheduled job must be identifiable in Sentry, and the wrapper that
 * makes it so must be the OUTERMOST one.
 *
 * ## Why this guard exists
 *
 * `/api/v1/internal/scheduled-site-publish` returned 500 on all ~96 daily runs
 * for a day (#1042). Sentry captured every one and nobody was told, because a
 * cron 500 carried no attribute saying which job it was — there was no alert
 * rule anyone could have written. `withCronJob` fixes that by tagging `job`.
 *
 * Two ways that fix could rot silently, both guarded here:
 *
 * 1. **A new cron ships untagged.** It would be invisible to the alert rule
 *    while looking completely normal in review.
 * 2. **The wrapper ends up nested INSIDE `withErrorHandler`.** Measured with
 *    @sentry/nextjs 10.38.0: with the isolation scope outside, an event
 *    carries `{job, request_id}`; inverted, it carries `{}` — no tag, no
 *    error, no signal. That is this outage's own defect class restored in a
 *    form that reads as correct, which is precisely why it cannot be left to a
 *    code comment.
 *
 * The check is SYNTACTIC (TypeScript AST, no type checker) — fast, and immune
 * to the string/comment/regex-literal confusion that a text scan suffers.
 * `guard:class-resolution` learned that lesson the expensive way.
 *
 * ## Exit codes
 *
 *   0 — clean
 *   1 — violations
 *   2 — could not check (missing file, unparseable, unrecognised schedule);
 *       refuses to report success rather than pass vacuously
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..');
const VERCEL_JSON = 'apps/web/vercel.json';
const INTERNAL_ROOT = 'apps/web/src/app/api/v1/internal';
const REGISTRY = 'apps/web/src/lib/cron/registry.ts';

export interface CronEntry {
  path: string;
  schedule: string;
}

/** Slug = path after `/api/v1/internal/`, `/` → `-`. Matches registry.ts. */
export function slugForPath(cronPath: string): string {
  return cronPath.replace('/api/v1/internal/', '').replace(/\//g, '-');
}

/**
 * An UPPER BOUND on the gap between two firings of a schedule, in minutes.
 *
 * This is the number a staleness window actually depends on. `maxAgeMinutes`
 * has to survive the LONGEST quiet stretch a healthy schedule can produce, or
 * the job reads as stale between two runs that both succeeded.
 *
 * It replaces an earlier `minIntervalMinutes`, which answered the opposite
 * question. That function was written for this check and the check was never
 * written, so nothing ever noticed the two are not interchangeable. They differ
 * for exactly one shape in this repo, and it is the one that matters:
 * `0 5 1 * *` fires on the 1st of each month, so the shortest gap is 28 days
 * (Feb -> Mar) and the longest is 31. Sizing a window against 28 days accepts
 * every value in 40320 < maxAgeMinutes <= 44640 — each of which pages on every
 * 31-day month.
 *
 * (The old lower bound was also wrong on its own terms for a step that does not
 * divide 60: `*\/7` fires at :56 and next at :00, a gap of 4, which it reported
 * as 7. Never bit, because this repo only uses `*\/5` and `*\/15`.)
 *
 * Not a crontab parser — deliberately. It recognises the shapes this repo
 * actually uses and returns `null` for anything else, which the caller turns
 * into exit 2. A guard that guessed at an unfamiliar expression could approve a
 * `maxAgeMinutes` that makes a job permanently overdue (alert fatigue) or
 * permanently fresh (no alerting at all) — both worse than admitting it cannot
 * tell.
 */
export function maxIntervalMinutes(schedule: string): number | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [string, string, string, string, string];
  if (month !== '*' || dayOfWeek !== '*') return null;

  // `*/N * * * *` — every N minutes. Minute 0 always fires, so the wrap-around
  // gap can only be shorter than N, never longer: N is the widest.
  const stepMatch = /^\*\/(\d+)$/.exec(minute);
  if (stepMatch && hour === '*' && dayOfMonth === '*') {
    const step = Number(stepMatch[1]);
    if (!Number.isInteger(step) || step < 1 || step > 59) return null;
    return step;
  }

  // `a,b,c * * * *` — N times an hour; the WIDEST gap, wrap included.
  if (minute.includes(',') && hour === '*' && dayOfMonth === '*') {
    const mins = minute.split(',').map(Number);
    if (mins.some((m) => !Number.isInteger(m) || m < 0 || m > 59)) return null;
    const sorted = [...mins].sort((a, b) => a - b);
    let widest = 60 - (sorted[sorted.length - 1]! - sorted[0]!);
    for (let i = 1; i < sorted.length; i += 1) widest = Math.max(widest, sorted[i]! - sorted[i - 1]!);
    return widest;
  }

  if (!/^\d+$/.test(minute)) return null;
  if (hour === '*' && dayOfMonth === '*') return 60; // `N * * * *` — hourly
  if (/^\d+$/.test(hour) && dayOfMonth === '*') return 1440; // `N H * * *` — daily
  // `N H D * *` — monthly. 31 days, not 28: the longest gap is what a window
  // has to survive.
  if (/^\d+$/.test(hour) && /^\d+$/.test(dayOfMonth)) return 31 * 1440;
  return null;
}

export interface RouteWrapping {
  /** The call wrapping the exported handler, e.g. `withCronJob`. */
  outermostCall: string | null;
  /** First argument of that call when it is a string literal. */
  slugArgument: string | null;
  /** Every HTTP verb exported by the file. */
  exportedVerbs: string[];
}

/**
 * Resolve what the route's GET export is actually built from.
 *
 * `export const GET = cronHandler` is followed back to `const cronHandler =
 * withCronJob('slug', …)`, so the OUTERMOST call is what gets reported. That is
 * the property under test: an inverted `withErrorHandler(withCronJob(…))` shows
 * up here as `outermostCall: 'withErrorHandler'` and fails.
 */
export function analyzeRoute(fileName: string, source: string): RouteWrapping {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const bindings = new Map<string, ts.Expression>();
  const exports = new Map<string, ts.Expression>();

  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const isExported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      (isExported ? exports : bindings).set(decl.name.text, decl.initializer);
    }
  }

  const verbs = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((v) => exports.has(v));

  // GET is the verb Vercel Cron issues, so it is the one that must be tagged.
  let expr = exports.get('GET') ?? null;
  // Follow one level of indirection (`export const GET = cronHandler`).
  if (expr && ts.isIdentifier(expr)) expr = bindings.get(expr.text) ?? null;

  if (!expr || !ts.isCallExpression(expr) || !ts.isIdentifier(expr.expression)) {
    return { outermostCall: null, slugArgument: null, exportedVerbs: verbs };
  }
  const firstArg = expr.arguments[0];
  return {
    outermostCall: expr.expression.text,
    slugArgument: firstArg && ts.isStringLiteral(firstArg) ? firstArg.text : null,
    exportedVerbs: verbs,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
interface RegistryJob {
  path: string;
  schedule: string;
  maxAgeMinutes: number;
}

/**
 * The registry is read TWICE, on purpose and by two different means.
 *
 * The path/schedule checks below match against its SOURCE TEXT, which is right
 * for drift: they are comparing two files' literals. `maxAgeMinutes` cannot be
 * read that way — the values are named constants (`DAILY`, `MONTHLY`), so
 * there is no number in the text to match. Importing gets the resolved numbers.
 *
 * Safe to import: registry.ts has zero imports of its own and is pure data plus
 * types, so this pulls in no database client and no env access. A load failure
 * is exit 2 rather than a stack trace, matching verify-scoped-db-access.ts.
 */
async function loadRegistryJobs(): Promise<Record<string, RegistryJob>> {
  try {
    const mod = await import('../apps/web/src/lib/cron/registry.ts');
    return mod.CRON_JOBS as unknown as Record<string, RegistryJob>;
  } catch (err) {
    couldNotCheck(`Could not import CRON_JOBS from ${REGISTRY}: ${String(err)}`);
  }
}

function couldNotCheck(msg: string): never {
  console.error(`✖ guard:cron-job-tagging — COULD NOT CHECK\n  ${msg}`);
  process.exit(2);
}

async function main(): Promise<never> {
  const vercelPath = path.join(REPO_ROOT, VERCEL_JSON);
  if (!fs.existsSync(vercelPath)) couldNotCheck(`Missing ${VERCEL_JSON}`);
  const crons: CronEntry[] = JSON.parse(fs.readFileSync(vercelPath, 'utf8')).crons ?? [];
  if (crons.length === 0) {
    couldNotCheck(`${VERCEL_JSON} declares zero crons. This repo has many, so an empty list means the read is broken, not that there are no jobs.`);
  }

  const registryPath = path.join(REPO_ROOT, REGISTRY);
  if (!fs.existsSync(registryPath)) couldNotCheck(`Missing ${REGISTRY}`);
  const registrySrc = fs.readFileSync(registryPath, 'utf8');

  const registryJobs = await loadRegistryJobs();

  const violations: string[] = [];
  const margins: { slug: string; margin: number; gap: number; window: number }[] = [];
  let routesChecked = 0;

  // --- vercel.json -> registry, and the route wrapping ---------------------
  for (const cron of crons) {
    const slug = slugForPath(cron.path);

    if (!new RegExp(`'${slug}':\\s*\\{`).test(registrySrc)) {
      violations.push(`${cron.path} is scheduled in vercel.json but has no '${slug}' entry in ${REGISTRY}`);
      continue;
    }
    if (!registrySrc.includes(`path: '${cron.path}'`)) {
      violations.push(`'${slug}' registry path does not match vercel.json path ${cron.path}`);
    }
    if (!registrySrc.includes(`schedule: '${cron.schedule}'`)) {
      violations.push(`'${slug}' registry schedule drifted from vercel.json ('${cron.schedule}')`);
    }

    const longestGap = maxIntervalMinutes(cron.schedule);
    if (longestGap === null) {
      couldNotCheck(
        `Unrecognised cron schedule '${cron.schedule}' for ${cron.path}. Refusing to approve its ` +
          `staleness window without understanding its cadence — teach maxIntervalMinutes() this shape.`,
      );
    }

    // The invariant registry.ts states in prose, finally executed. A window at
    // or below the schedule's longest gap makes the job stale between two runs
    // that both succeeded — the health probe would report it dead forever, and
    // a probe that is red by construction trains whoever watches it to ignore
    // the alert.
    const job = registryJobs[slug];
    if (job !== undefined) {
      if (job.maxAgeMinutes <= longestGap) {
        violations.push(
          `'${slug}': maxAgeMinutes ${job.maxAgeMinutes} does not exceed the longest gap its own ` +
            `schedule can produce (${longestGap} min for '${cron.schedule}'), so it would read as ` +
            `stale between two healthy runs`,
        );
      } else {
        margins.push({
          slug,
          margin: job.maxAgeMinutes - longestGap,
          gap: longestGap,
          window: job.maxAgeMinutes,
        });
      }
    }

    const routeRel = path.join(INTERNAL_ROOT, cron.path.replace('/api/v1/internal/', ''), 'route.ts');
    const routeAbs = path.join(REPO_ROOT, routeRel);
    if (!fs.existsSync(routeAbs)) {
      violations.push(`${cron.path} is scheduled but ${routeRel} does not exist`);
      continue;
    }
    routesChecked += 1;

    const wrapping = analyzeRoute(routeAbs, fs.readFileSync(routeAbs, 'utf8'));
    if (wrapping.outermostCall !== 'withCronJob') {
      violations.push(
        `${routeRel}: GET must be wrapped by withCronJob as the OUTERMOST call, found ` +
          `${wrapping.outermostCall ?? 'no call'}. Nested inside withErrorHandler the job tag is ` +
          `silently absent — measured, not theoretical.`,
      );
    } else if (wrapping.slugArgument !== slug) {
      violations.push(
        `${routeRel}: wrapped as '${wrapping.slugArgument ?? '(non-literal)'}' but its path implies '${slug}'`,
      );
    }
    if (!wrapping.exportedVerbs.includes('POST')) {
      violations.push(`${routeRel}: exports GET but not POST (both are required so the scheduler's verb cannot break the job)`);
    }
  }

  // --- registry -> vercel.json (the other direction) -----------------------
  const registrySlugs = [...registrySrc.matchAll(/^ {2}'([a-z0-9-]+)':\s*\{$/gm)].map((m) => m[1]!);
  if (registrySlugs.length === 0) {
    couldNotCheck(`Parsed zero job slugs out of ${REGISTRY}. The registry shape changed and this guard can no longer read it.`);
  }
  const scheduledSlugs = new Set(crons.map((c) => slugForPath(c.path)));
  for (const slug of registrySlugs) {
    if (!scheduledSlugs.has(slug)) {
      violations.push(`'${slug}' is in ${REGISTRY} but is not scheduled in ${VERCEL_JSON} — it will never run`);
    }
  }

  if (routesChecked === 0) couldNotCheck('Checked zero route files.');

  if (margins.length === 0) couldNotCheck('Compared zero staleness windows against their schedules.');

  // Ranked by RATIO, not by absolute minutes. A 5-minute job with 15 minutes of
  // slack has 4x headroom; a monthly job with 1440 minutes of slack has 1.03x
  // and is the one actually close to false-alarming. Sorting by the raw margin
  // would name the former and hide the latter.
  const tightest = margins.reduce((a, b) => (a.window / a.gap <= b.window / b.gap ? a : b));
  const ratio = (tightest.window / tightest.gap).toFixed(2);

  const denominator =
    `crons in vercel.json: ${crons.length} · registry entries: ${registrySlugs.length} · ` +
    `routes checked: ${routesChecked} · windows compared: ${margins.length}\n` +
    `   tightest window: '${tightest.slug}' allows ${tightest.window} min against a ` +
    `${tightest.gap} min longest gap — ${ratio}x, ${tightest.margin} min of slack`;

  if (violations.length > 0) {
    console.error('✖ guard:cron-job-tagging\n');
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      `\n  Every scheduled job must call withCronJob('<slug>', <handler>) as the OUTERMOST\n` +
        `  wrapper, so its Sentry events carry a \`job\` tag an alert rule can match.\n\n` +
        `  And its maxAgeMinutes must exceed the LONGEST gap its schedule can produce, or\n` +
        `  the health probe reports it dead between two runs that both succeeded — a probe\n` +
        `  that is red by construction is one nobody looks at when it goes red for a reason.\n\n` +
        `  ${denominator}`,
    );
    process.exit(1);
  }

  console.log('✅ guard:cron-job-tagging — every scheduled job is tagged, outermost');
  console.log(`   ${denominator}`);
  process.exit(0);
}

if (require.main === module) void main();
