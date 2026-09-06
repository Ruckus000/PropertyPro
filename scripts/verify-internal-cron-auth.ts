/**
 * Internal Cron Auth Guard
 *
 * `apps/web/src/middleware.ts` lets ANY `GET`/`POST` under `/api/v1/internal/`
 * past the session gate with a single prefix rule. That rule replaced a
 * per-route allowlist whose upkeep is what broke every scheduled job in
 * production: Vercel Cron issues `GET`, nine routes had a `POST`-only entry, so
 * middleware 401'd before the route ran, and four routes had no entry at all.
 *
 * The prefix rule is only safe while the invariant below holds, so it is
 * enforced here rather than left to review:
 *
 *   Every `route.ts` under `apps/web/src/app/api/v1/internal/` must call
 *   `requireCronSecret(...)`.
 *
 * `requireCronSecret` (`apps/web/src/lib/api/cron-auth.ts`) fails closed — a
 * missing, short, or wrong Bearer token throws `UnauthorizedError` — so a route
 * that calls it can never be reached unauthenticated even though middleware
 * waved it through. A route that FORGETS to call it would be fully public.
 * That is the regression this guard exists to make impossible.
 *
 * Deliberate exceptions are listed in `UNAUTHENTICATED_BY_DESIGN` and must
 * carry a reason.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const INTERNAL_ROOT = 'apps/web/src/app/api/v1/internal';

/**
 * Routes under the internal prefix that intentionally require no cron secret.
 * Each entry is a repo-relative path plus the reason it is safe.
 */
const UNAUTHENTICATED_BY_DESIGN: ReadonlyArray<{ file: string; reason: string }> = [
  {
    file: 'apps/web/src/app/api/v1/internal/cron-health/route.ts',
    reason:
      'Cron-freshness probe for external uptime monitors, generalising the ' +
      'revenue-snapshot one to every scheduled job. Returns only job slugs and ' +
      'timestamps — deliberately not last_error, which can carry query text — and ' +
      'must be callable without a secret so a monitor can detect that a job stopped ' +
      'running. Failure alerting cannot see that case: the 2026-08 outage was every ' +
      'cron 401ing, which throws AppError and never reaches Sentry.',
  },
  {
    file: 'apps/web/src/app/api/v1/internal/revenue-snapshot/health/route.ts',
    reason:
      'Cron-freshness probe for external uptime monitors. Returns only a stale/fresh ' +
      'verdict and a timestamp — no tenant data — and must be callable without a secret ' +
      'so a monitor can detect that the revenue-snapshot job stopped running.',
  },
];

export interface Violation {
  file: string;
  message: string;
}

function walkRouteFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      walkRouteFiles(full, out);
    } else if (entry === 'route.ts') {
      out.push(full);
    }
  }
}

/**
 * Strip line and block comments so a route that merely *mentions*
 * `requireCronSecret` in prose does not satisfy the guard. Two of this repo's
 * guards have been fooled by comments before.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

export function callsRequireCronSecret(source: string): boolean {
  return /\brequireCronSecret\s*\(/.test(stripComments(source));
}

function main(): void {
  const routeFiles: string[] = [];
  walkRouteFiles(join(repoRoot, INTERNAL_ROOT), routeFiles);

  const exempt = new Map(UNAUTHENTICATED_BY_DESIGN.map((e) => [e.file, e.reason]));
  const seenExemptions = new Set<string>();
  const violations: Violation[] = [];

  for (const file of routeFiles) {
    const rel = relative(repoRoot, file);
    if (exempt.has(rel)) {
      seenExemptions.add(rel);
      continue;
    }
    if (!callsRequireCronSecret(readFileSync(file, 'utf-8'))) {
      violations.push({
        file: rel,
        message:
          'No requireCronSecret(...) call. Middleware lets any GET/POST under ' +
          '/api/v1/internal/ past the session gate, so this route is PUBLIC. Add ' +
          'requireCronSecret(req, process.env.<X>_CRON_SECRET ?? process.env.CRON_SECRET), ' +
          'or add an entry to UNAUTHENTICATED_BY_DESIGN in this guard with a reason.',
      });
    }
  }

  // A stale exemption is its own bug: it silently permits a future file at the
  // same path to skip the check.
  for (const [file] of exempt) {
    if (!seenExemptions.has(file)) {
      violations.push({
        file,
        message:
          'Listed in UNAUTHENTICATED_BY_DESIGN but no such route file exists. ' +
          'Remove the stale exemption.',
      });
    }
  }

  console.log(
    `\nScanned ${routeFiles.length} internal route.ts files; ` +
      `${exempt.size} documented exemption(s).`,
  );

  if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} internal-cron-auth problem(s):`);
    for (const v of violations) {
      console.error(`  ${v.file}`);
      console.error(`      ${v.message}`);
    }
    process.exit(1);
  }

  console.log('\n✅ Every internal route requires a cron secret.');
}

// ESM main-detection (POSIX only — matches the other guards).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
