/**
 * Token-Auth Route Guard
 *
 * `apps/web/src/middleware.ts` 401s every request under `/api/v1` without a
 * session, because `/api/v1` is in `PROTECTED_PATH_PREFIXES`. A route that
 * authenticates with a SIGNED TOKEN instead of a session therefore has to be
 * listed in `TOKEN_AUTH_ROUTES` — per path AND per HTTP verb — or it is
 * unreachable by the callers it exists for.
 *
 * The invariant enforced here:
 *
 *   A `route.ts` under `apps/web/src/app/api/v1/` that verifies a signed token
 *   and never calls `requireAuthenticatedUserId` MUST appear in
 *   `TOKEN_AUTH_ROUTES` for EVERY verb it exports.
 *
 * ── Why this exists ──
 *
 * This class of bug has shipped twice.
 *
 * First it broke every scheduled job in production. From the comment still in
 * `isTokenAuthenticatedApiRoute`: Vercel Cron issues GET, nine routes had a
 * POST-only entry, so middleware 401'd before the route ever ran — a 401, not
 * the 405 you would expect — and four routes had no entry at all. That was
 * fixed by replacing the per-route entries with one `/api/v1/internal/` prefix
 * rule, protected by `guard:internal-cron-auth`.
 *
 * Then it shipped again in #982: `/api/v1/notifications/unsubscribe` — the
 * no-login unsubscribe built specifically so recipients would NOT hit a login
 * wall — was never added, so Gmail's RFC 8058 one-click POST got a 401 and the
 * whole feature was inert in production.
 *
 * The unsubscribe routes cannot use a prefix rule; they live under three
 * unrelated parents (`snowbird-digest`, `insurance-alerts`, `notifications`).
 * So the protection has to be this guard.
 *
 * ── What this does NOT check ──
 *
 * That a listed route's token verification is CORRECT. Membership in
 * `TOKEN_AUTH_ROUTES` bypasses only the session gate; the route's own
 * `verify…Token` call is what actually authenticates it, and reviewing that
 * remains a human job. This guard only ensures a sessionless route is reachable
 * — and, by requiring every exported verb, that it is reachable by every
 * caller it declares support for.
 *
 * Exit codes are tri-state, per `.claude/rules/verification.md`:
 *   0  clean
 *   1  violations found
 *   2  could not check — refuses to pass rather than report a false clean
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './verify-internal-cron-auth';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const API_ROOT = 'apps/web/src/app/api/v1';
const MIDDLEWARE = 'apps/web/src/middleware.ts';

const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * Path prefixes `isTokenAuthenticatedApiRoute` waves through WITHOUT a
 * per-route entry. A route under one of these is already reachable, so it is
 * not a violation.
 *
 * Keep in sync with that function. If it grows a new prefix rule and this list
 * does not, the guard reports a false violation — loudly, which is the right
 * direction to fail.
 */
const PREFIX_BYPASSES: ReadonlyArray<{ test: (p: string) => boolean; why: string }> = [
  {
    test: (p) => p.startsWith('/api/v1/internal/'),
    why: 'covered by the /api/v1/internal/ prefix rule (see guard:internal-cron-auth)',
  },
  {
    test: (p) => p.startsWith('/api/v1/esign/sign/'),
    why: 'covered by the /api/v1/esign/sign/ prefix rule (dynamic segments)',
  },
  {
    test: (p) => p.startsWith('/api/v1/demo/') && p.endsWith('/enter'),
    why: 'covered by the demo-entry rule (dynamic [slug] segment)',
  },
];

/**
 * Sessionless routes deliberately NOT in `TOKEN_AUTH_ROUTES`. Each needs a
 * reason. Empty today — added so a genuine exception has somewhere to go that
 * is not "delete the guard".
 */
const NOT_TOKEN_AUTH_BY_DESIGN: ReadonlyArray<{ file: string; reason: string }> = [];

interface Violation {
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
 * Does this route authenticate with a signed token instead of a session?
 *
 * Comments are stripped first: a route that only MENTIONS `verifyFooToken` in
 * prose must not be treated as token-authenticated. Two of this repo's guards
 * have been fooled by comments before, which is why `stripComments` is shared
 * rather than reimplemented.
 */
export function isTokenAuthenticated(source: string): boolean {
  const code = stripComments(source);
  const verifiesToken = /\bverify[A-Za-z0-9_]*Token\s*\(/.test(code);
  const requiresSession = /\brequireAuthenticatedUserId\s*\(/.test(code);
  return verifiesToken && !requiresSession;
}

/** Verbs a route file exports as handlers. */
export function exportedVerbs(source: string): string[] {
  const code = stripComments(source);
  return HTTP_VERBS.filter((verb) =>
    new RegExp(`export\\s+(?:async\\s+function\\s+${verb}\\b|const\\s+${verb}\\s*[:=])`).test(code),
  );
}

/** `apps/web/src/app/api/v1/foo/[id]/route.ts` → `/api/v1/foo/[id]` */
function routePathFromFile(rel: string): string {
  return `/${rel.replace(/^apps\/web\/src\/app\//, '').replace(/\/route\.ts$/, '')}`;
}

/**
 * Parse the `TOKEN_AUTH_ROUTES` array literal out of middleware.ts.
 *
 * Deliberately throws rather than returning an empty set: an empty parse and a
 * genuinely empty list are indistinguishable downstream, and the second is a
 * state this repo will never be in. A guard that cannot read its own reference
 * data must refuse to pass (exit 2), not report everything as clean.
 */
export function parseDeclaredRoutes(middlewareSource: string): Set<string> {
  const start = middlewareSource.indexOf('const TOKEN_AUTH_ROUTES');
  if (start < 0) {
    throw new Error(`Could not find "const TOKEN_AUTH_ROUTES" in ${MIDDLEWARE}`);
  }
  const open = middlewareSource.indexOf('[', start);
  const close = middlewareSource.indexOf('];', open);
  if (open < 0 || close < 0) {
    throw new Error(`Could not find the TOKEN_AUTH_ROUTES array literal in ${MIDDLEWARE}`);
  }

  const body = stripComments(middlewareSource.slice(open, close));
  const declared = new Set<string>();
  const entry = /\{\s*path:\s*'([^']+)'\s*,\s*method:\s*'([A-Z]+)'\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(body)) !== null) {
    declared.add(`${m[2]} ${m[1]}`);
  }

  if (declared.size === 0) {
    throw new Error(
      `Parsed 0 entries from TOKEN_AUTH_ROUTES in ${MIDDLEWARE}. The literal's shape ` +
        'probably changed; fix this parser rather than letting it report a false clean.',
    );
  }
  return declared;
}

function main(): void {
  const apiRoot = join(repoRoot, API_ROOT);

  // Assert the search root exists before reporting anything.
  try {
    if (!statSync(apiRoot).isDirectory()) throw new Error('not a directory');
  } catch {
    console.error(`❌ Cannot check: ${API_ROOT} is missing or not a directory.`);
    process.exit(2);
  }

  let declared: Set<string>;
  try {
    declared = parseDeclaredRoutes(readFileSync(join(repoRoot, MIDDLEWARE), 'utf-8'));
  } catch (error) {
    console.error(`❌ Cannot check: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }

  const routeFiles: string[] = [];
  walkRouteFiles(apiRoot, routeFiles);
  if (routeFiles.length === 0) {
    console.error(`❌ Cannot check: found 0 route.ts files under ${API_ROOT}.`);
    process.exit(2);
  }

  const exempt = new Map(NOT_TOKEN_AUTH_BY_DESIGN.map((e) => [e.file, e.reason]));
  const seenExemptions = new Set<string>();
  const violations: Violation[] = [];
  let tokenAuthCount = 0;
  let bypassedCount = 0;

  for (const file of routeFiles) {
    const rel = relative(repoRoot, file);
    const source = readFileSync(file, 'utf-8');
    if (!isTokenAuthenticated(source)) continue;

    tokenAuthCount += 1;

    if (exempt.has(rel)) {
      seenExemptions.add(rel);
      continue;
    }

    const routePath = routePathFromFile(rel);
    const bypass = PREFIX_BYPASSES.find((b) => b.test(routePath));
    if (bypass) {
      bypassedCount += 1;
      continue;
    }

    const verbs = exportedVerbs(source);
    if (verbs.length === 0) {
      violations.push({
        file: rel,
        message: 'Verifies a signed token but exports no HTTP handler. Probably dead code.',
      });
      continue;
    }

    const missing = verbs.filter((verb) => !declared.has(`${verb} ${routePath}`));
    if (missing.length > 0) {
      violations.push({
        file: rel,
        message:
          `Sessionless (verifies a token, never calls requireAuthenticatedUserId) but ` +
          `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not in ` +
          `TOKEN_AUTH_ROUTES. Middleware 401s ${missing.length === 1 ? 'that verb' : 'those verbs'} ` +
          `before the handler runs, so the route is unreachable by its callers. Add ` +
          missing.map((verb) => `{ path: '${routePath}', method: '${verb}' }`).join(' and ') +
          ` to TOKEN_AUTH_ROUTES in ${MIDDLEWARE}.`,
      });
    }
  }

  for (const [file] of exempt) {
    if (!seenExemptions.has(file)) {
      violations.push({
        file,
        message:
          'Listed in NOT_TOKEN_AUTH_BY_DESIGN but is not a token-authenticated route ' +
          '(or no longer exists). Remove the stale exemption.',
      });
    }
  }

  // Print the denominator. A scan that examined nothing must not pass.
  console.log(
    `\nScanned ${routeFiles.length} route.ts files under ${API_ROOT}: ` +
      `${tokenAuthCount} are token-authenticated ` +
      `(${bypassedCount} covered by a prefix rule, ${exempt.size} exempt). ` +
      `${declared.size} entries declared in TOKEN_AUTH_ROUTES.`,
  );

  if (tokenAuthCount === 0) {
    console.error(
      '\n❌ Cannot check: found 0 token-authenticated routes. This repo has at least ' +
        'three (the unsubscribe endpoints), so the detector is broken rather than the ' +
        'repo being clean.',
    );
    process.exit(2);
  }

  if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} token-auth route problem(s):`);
    for (const v of violations) {
      console.error(`  ${v.file}`);
      console.error(`      ${v.message}`);
    }
    process.exit(1);
  }

  console.log('\n✅ Every token-authenticated route is reachable for every verb it exports.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
