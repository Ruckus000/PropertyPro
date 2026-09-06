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
 * A LOWER BOUND on how often a schedule fires, in minutes.
 *
 * Not a crontab parser — deliberately. It recognises the shapes this repo
 * actually uses and returns `null` for anything else, which the caller turns
 * into exit 2. A guard that guessed at an unfamiliar expression could approve a
 * `maxAgeMinutes` that makes a job permanently overdue (alert fatigue) or
 * permanently fresh (no alerting at all) — both worse than admitting it cannot
 * tell.
 */
export function minIntervalMinutes(schedule: string): number | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [string, string, string, string, string];
  if (month !== '*' || dayOfWeek !== '*') return null;

  // `*/N * * * *` — every N minutes.
  const stepMatch = /^\*\/(\d+)$/.exec(minute);
  if (stepMatch && hour === '*' && dayOfMonth === '*') return Number(stepMatch[1]);

  // `a,b,c * * * *` — N times an hour; the tightest gap is what matters.
  if (minute.includes(',') && hour === '*' && dayOfMonth === '*') {
    const mins = minute.split(',').map(Number);
    if (mins.some((m) => !Number.isInteger(m))) return null;
    const sorted = [...mins].sort((a, b) => a - b);
    let smallest = 60 - (sorted[sorted.length - 1]! - sorted[0]!);
    for (let i = 1; i < sorted.length; i += 1) smallest = Math.min(smallest, sorted[i]! - sorted[i - 1]!);
    return smallest;
  }

  if (!/^\d+$/.test(minute)) return null;
  if (hour === '*' && dayOfMonth === '*') return 60; // `N * * * *` — hourly
  if (/^\d+$/.test(hour) && dayOfMonth === '*') return 1440; // `N H * * *` — daily
  if (/^\d+$/.test(hour) && /^\d+$/.test(dayOfMonth)) return 28 * 1440; // `N H D * *` — monthly
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
function couldNotCheck(msg: string): never {
  console.error(`✖ guard:cron-job-tagging — COULD NOT CHECK\n  ${msg}`);
  process.exit(2);
}

function main(): never {
  const vercelPath = path.join(REPO_ROOT, VERCEL_JSON);
  if (!fs.existsSync(vercelPath)) couldNotCheck(`Missing ${VERCEL_JSON}`);
  const crons: CronEntry[] = JSON.parse(fs.readFileSync(vercelPath, 'utf8')).crons ?? [];
  if (crons.length === 0) {
    couldNotCheck(`${VERCEL_JSON} declares zero crons. This repo has many, so an empty list means the read is broken, not that there are no jobs.`);
  }

  const registryPath = path.join(REPO_ROOT, REGISTRY);
  if (!fs.existsSync(registryPath)) couldNotCheck(`Missing ${REGISTRY}`);
  const registrySrc = fs.readFileSync(registryPath, 'utf8');

  const violations: string[] = [];
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

    const interval = minIntervalMinutes(cron.schedule);
    if (interval === null) {
      couldNotCheck(
        `Unrecognised cron schedule '${cron.schedule}' for ${cron.path}. Refusing to approve its ` +
          `staleness window without understanding its cadence — teach minIntervalMinutes() this shape.`,
      );
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

  const denominator =
    `crons in vercel.json: ${crons.length} · registry entries: ${registrySlugs.length} · routes checked: ${routesChecked}`;

  if (violations.length > 0) {
    console.error('✖ guard:cron-job-tagging\n');
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      `\n  Every scheduled job must call withCronJob('<slug>', <handler>) as the OUTERMOST\n` +
        `  wrapper, so its Sentry events carry a \`job\` tag an alert rule can match.\n\n  ${denominator}`,
    );
    process.exit(1);
  }

  console.log('✅ guard:cron-job-tagging — every scheduled job is tagged, outermost');
  console.log(`   ${denominator}`);
  process.exit(0);
}

if (require.main === module) main();
