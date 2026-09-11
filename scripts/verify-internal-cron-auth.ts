/**
 * Internal Cron Auth Guard
 *
 * Two apps now let scheduled-job routes past their session gate with a single
 * prefix rule, and this guard is what keeps that safe in both.
 *
 * **apps/web** — `apps/web/src/middleware.ts` lets ANY `GET`/`HEAD`/`POST`
 * under `/api/v1/internal/` past the session gate. That rule replaced a
 * per-route allowlist whose upkeep is what broke every scheduled job in
 * production: Vercel Cron issues `GET`, nine routes had a `POST`-only entry, so
 * middleware 401'd before the route ran, and four routes had no entry at all.
 *
 * **apps/admin** — `apps/admin/src/middleware.ts` does the same for
 * `/api/admin/internal/` (wave 4, the push-dispatch cron). The stakes are
 * higher there than in web: the console holds the service-role key, and its own
 * middleware comment refuses prefix matching for `/api/health` for exactly this
 * reason. The exemption is only defensible because this guard covers the
 * prefix, so the two landed in one commit.
 *
 * The prefix rules are only safe while the invariant below holds, so it is
 * enforced here rather than left to review:
 *
 *   Every `route.ts` under an internal root must call `requireCronSecret(...)`.
 *
 * `requireCronSecret` (`apps/web/src/lib/api/cron-auth.ts`, and admin's
 * deliberate copy at `apps/admin/src/lib/api/cron-auth.ts`) fails closed — a
 * missing, short, or wrong Bearer token throws `UnauthorizedError` — so a route
 * that calls it can never be reached unauthenticated even though middleware
 * waved it through. A route that FORGETS to call it would be fully public.
 * That is the regression this guard exists to make impossible.
 *
 * Deliberate exceptions are listed per root in `exemptions` and must carry a
 * reason.
 *
 * ## Exit codes (the canonical guard shape — see .claude/rules/verification.md)
 *
 * - `0` clean
 * - `1` violations
 * - `2` **could not check** — a root directory is missing, unreadable, or
 *   contains no `route.ts` at all. A scan that examined nothing must not pass:
 *   before this, `walkRouteFiles` swallowed a missing directory and the guard
 *   printed `Scanned 0 internal route.ts files` and exited 0. Renaming either
 *   root — or adding a third one and typo'ing its path — would have removed the
 *   entire check silently, which is the failure mode the guard is about.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

/** A deliberately unauthenticated route, with the reason it is safe. */
export interface RootExemption {
  /** Repo-relative path to the `route.ts`. */
  file: string;
  reason: string;
}

/** One middleware prefix rule, and the routes it waves past the session gate. */
export interface InternalRoot {
  /** Repo-relative directory every `route.ts` below is scanned from. */
  dir: string;
  /** The middleware prefix this root is reachable under, for the message. */
  urlPrefix: string;
  /** Which middleware file opened it — named in the violation message. */
  middleware: string;
  exemptions: ReadonlyArray<RootExemption>;
}

/**
 * The roots, one per middleware prefix rule.
 *
 * Exemptions are PER ROOT rather than one flat list: an entry is only meaningful
 * against the root it sits under, and a flat list would let an exemption written
 * for web silently apply to an admin path that happened to match.
 */
export const INTERNAL_ROOTS: ReadonlyArray<InternalRoot> = [
  {
    dir: 'apps/web/src/app/api/v1/internal',
    urlPrefix: '/api/v1/internal/',
    middleware: 'apps/web/src/middleware.ts',
    exemptions: [
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
    ],
  },
  {
    // Wave 4. ZERO exemptions, and that is the intended steady state: this
    // console holds the service-role key, so an unauthenticated route here is
    // not the same kind of risk as an unauthenticated freshness probe on web.
    // Adding one needs a reason that survives that sentence.
    dir: 'apps/admin/src/app/api/admin/internal',
    urlPrefix: '/api/admin/internal/',
    middleware: 'apps/admin/src/middleware.ts',
    exemptions: [],
  },
];

export interface Violation {
  file: string;
  message: string;
}

/** Thrown for the exit-2 cases: the guard could not perform its check. */
export class CannotCheckError extends Error {}

function walkRouteFiles(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    // Only reachable for a subdirectory that vanished mid-walk; the ROOT is
    // asserted to exist by the caller before this runs, so a missing root can
    // no longer be swallowed here.
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

/** Scan one root. Throws `CannotCheckError` when it cannot be scanned at all. */
export function scanRoot(root: InternalRoot): { scanned: number; violations: Violation[] } {
  const absolute = join(repoRoot, root.dir);

  // Assert the search root exists BEFORE reporting anything about it.
  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    throw new CannotCheckError(
      `Internal root not found: ${root.dir}. Either the directory moved (update ` +
        'INTERNAL_ROOTS in this guard) or the middleware prefix rule it covers is now ' +
        'unguarded. Refusing to pass.',
    );
  }
  if (!stats.isDirectory()) {
    throw new CannotCheckError(`Internal root is not a directory: ${root.dir}. Refusing to pass.`);
  }

  const routeFiles: string[] = [];
  walkRouteFiles(absolute, routeFiles);

  // Assert a non-zero population. A root with no routes means either the guard
  // is looking in the wrong place or the prefix rule should have been deleted
  // with its last route; neither is a pass.
  if (routeFiles.length === 0) {
    throw new CannotCheckError(
      `No route.ts files under ${root.dir}, so nothing was checked. If the last route ` +
        `under ${root.urlPrefix} was removed, remove the prefix rule in ${root.middleware} ` +
        'and this root together. Refusing to pass.',
    );
  }

  const exempt = new Map(root.exemptions.map((e) => [e.file, e.reason]));
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
          `No requireCronSecret(...) call. ${root.middleware} lets requests under ` +
          `${root.urlPrefix} past the session gate, so this route is PUBLIC. Add ` +
          'requireCronSecret(req, process.env.<X>_CRON_SECRET ?? process.env.CRON_SECRET), ' +
          'or add an entry to this root\'s `exemptions` in this guard with a reason.',
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
          'Listed in this root\'s `exemptions` but no such route file exists. ' +
          'Remove the stale exemption.',
      });
    }
  }

  return { scanned: routeFiles.length, violations };
}

function main(): void {
  const violations: Violation[] = [];
  let totalScanned = 0;
  let totalExemptions = 0;

  for (const root of INTERNAL_ROOTS) {
    let result;
    try {
      result = scanRoot(root);
    } catch (error) {
      if (error instanceof CannotCheckError) {
        console.error(`\n⚠️  ${error.message}`);
        process.exit(2);
      }
      throw error;
    }
    totalScanned += result.scanned;
    totalExemptions += root.exemptions.length;
    violations.push(...result.violations);
    // Print the denominator per root, so a root that quietly stopped matching
    // anything is visible in the output rather than only in the exit code.
    console.log(
      `  ${root.dir}: ${result.scanned} route.ts file(s), ` +
        `${root.exemptions.length} documented exemption(s).`,
    );
  }

  console.log(
    `\nScanned ${totalScanned} internal route.ts files across ${INTERNAL_ROOTS.length} roots; ` +
      `${totalExemptions} documented exemption(s).`,
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
