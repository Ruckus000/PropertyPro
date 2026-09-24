/**
 * Tenant-scope Well-formedness Guard (Plan B2)
 *
 * `tenantScope` on a route contract tells `runRoute` where the route's
 * `communityId` lives so the runner can resolve + inject it (see
 * `packages/api-contract/src/define-route.ts`). This guard does two jobs:
 *
 *   A. WELL-FORMEDNESS (Plan B2, original): any *declared* `tenantScope` must
 *      be valid — see the checks below.
 *   B. BACKLOG RATCHET (CON-01 + CON-02, Phase 1.3): an idiom-agnostic census
 *      of the routes that still resolve tenancy BY HAND inside a contracted
 *      route, held under a shrink-only ceiling.
 *
 * Job B exists because job A alone made adoption unmeasurable. This file used
 * to say, verbatim, that it "does NOT require routes to adopt tenantScope (that
 * converges opportunistically)". That bet measurably failed: adoption stayed
 * flat at 12 declaring contracts for nine weeks (last deliberate commit
 * 2026-06-05) while the hand-resolving population GREW, because a count that
 * no check asserts can only drift upward. The ratchet is what turns "drain it
 * sometime" into a number that cannot silently get bigger.
 *
 * Checks, per `defineRoute({...})` block under `apps/web/src/app/api/`:
 *   1. `in` is one of 'query' | 'body' | 'path'.
 *   2. `in: 'body'` is illegal on a GET (GET carries no body). Every other
 *      method may use any source — in particular `in: 'query'` is valid on
 *      DELETE/PATCH (bodyless mutations like leases/assessments DELETE).
 *   3. The matching request schema sub-key is declared in the same block:
 *      query → `query:`, body → `body:`, path → `params:`.
 *
 * And, per route directory (cross-file — the contract often lives in a sibling
 * `contract.ts` while `runRoute` is called in `route.ts`):
 *   4. A route whose contract declares a `query`/`body` tenantScope MUST import
 *      `runRoute` from the app-bound wrapper `@/lib/api/run-route` (which
 *      injects the resolver). The bare `@propertypro/api-contract` runner has
 *      no resolver and throws at request time. `path` scopes are self-contained
 *      and need no resolver, so they're exempt from this check.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCeiling } from './lib/ceiling';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const API_ROOT = 'apps/web/src/app/api';
/** The census is confined to v1 — that is the whole contracted corpus. */
const API_V1_ROOT = 'apps/web/src/app/api/v1';


const VALID_SCOPES = new Set(['query', 'body', 'path']);
const SCOPE_SCHEMA_KEY: Record<string, string> = {
  query: 'query:',
  body: 'body:',
  path: 'params:',
};

export interface Violation {
  file: string;
  message: string;
}

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walkRouteFiles(dir: string, out: string[]): void {
  let entries;
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
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walkRouteFiles(full, out);
      continue;
    }
    if (entry === 'route.ts') out.push(full);
  }
}

// ---------------------------------------------------------------------------
// defineRoute block extraction (paren-balanced, string-aware)
// ---------------------------------------------------------------------------

export function extractDefineRouteBlocks(content: string): string[] {
  const blocks: string[] = [];
  const marker = 'defineRoute(';
  let i = 0;
  while ((i = content.indexOf(marker, i)) !== -1) {
    let depth = 0;
    let inStr: string | null = null;
    let started = false;
    let j = i + marker.length - 1; // position of the opening '('
    for (; j < content.length; j++) {
      const ch = content[j];
      const prev = content[j - 1];
      if (inStr) {
        if (ch === inStr && prev !== '\\') inStr = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        inStr = ch;
        continue;
      }
      if (ch === '(') {
        depth++;
        started = true;
      } else if (ch === ')') {
        depth--;
        if (started && depth === 0) {
          j++;
          break;
        }
      }
    }
    blocks.push(content.slice(i, j));
    i = j;
  }
  return blocks;
}

// Accept both quote styles so a double-quoted `in: "query"` can't silently
// skip the whole block (including the load-bearing bound-wrapper-import check).
const TENANT_SCOPE_REGEX =
  /tenantScope:\s*\{\s*in:\s*['"]([^'"]*)['"](?:\s*,\s*field:\s*['"]([^'"]*)['"])?/;
const METHOD_REGEX = /method:\s*['"](GET|POST|PATCH|PUT|DELETE)['"]/;

function checkBlock(block: string, file: string, violations: Violation[]): void {
  const scopeMatch = block.match(TENANT_SCOPE_REGEX);
  if (!scopeMatch) return;
  const inVal = scopeMatch[1] ?? '';
  const method = block.match(METHOD_REGEX)?.[1];

  if (!VALID_SCOPES.has(inVal)) {
    violations.push({
      file,
      message: `tenantScope.in='${inVal}' is invalid (expected 'query' | 'body' | 'path').`,
    });
    return;
  }

  if (method === 'GET' && inVal === 'body') {
    violations.push({
      file,
      message: `tenantScope.in='body' is illegal on a GET (GET carries no body). Use 'query'.`,
    });
  }

  const schemaKey = SCOPE_SCHEMA_KEY[inVal];
  if (schemaKey && !block.includes(schemaKey)) {
    violations.push({
      file,
      message: `tenantScope.in='${inVal}' but the contract declares no \`${schemaKey}\` request schema to read the tenant field from.`,
    });
  }
}

// ---------------------------------------------------------------------------
// Cross-file: query/body scope ⇒ route.ts imports the bound wrapper
// ---------------------------------------------------------------------------

const BOUND_RUNROUTE_IMPORT =
  /import\s*\{[^}]*\brunRoute\b[^}]*\}\s*from\s*['"]@\/lib\/api\/run-route['"]/;

function hasQueryOrBodyScope(content: string): boolean {
  for (const block of extractDefineRouteBlocks(content)) {
    const m = block.match(TENANT_SCOPE_REGEX);
    if (m && (m[1] === 'query' || m[1] === 'body')) return true;
  }
  return false;
}

/**
 * Validate one route's contract (route.ts content + sibling contract.ts
 * content). Pure — exported for unit tests. `file` is only used for messages.
 */
export function validateRoute(
  routeContent: string,
  contractContent: string,
  file: string,
): Violation[] {
  const violations: Violation[] = [];
  const combined = `${routeContent}\n${contractContent}`;
  for (const block of extractDefineRouteBlocks(combined)) {
    checkBlock(block, file, violations);
  }
  if (hasQueryOrBodyScope(combined) && !BOUND_RUNROUTE_IMPORT.test(routeContent)) {
    violations.push({
      file,
      message:
        "declares a query/body tenantScope but does not import `runRoute` " +
        "from '@/lib/api/run-route'. The bare @propertypro/api-contract " +
        'runner has no resolver and will throw at request time.',
    });
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Backlog census (CON-01 + CON-02) — hand-resolving single-tenant routes
// ---------------------------------------------------------------------------

/**
 * Shrink-only ceiling on the drain population computed by `isBacklogRoute`.
 *
 * SEEDED FROM THIS SCRIPT'S OWN PRINT, not from prose. The 2026-09-22 audit
 * (`docs/audits/2026-09-22-refactor-audit-and-cleanup-roadmap.md` CON-01) said
 * 157; intake re-measurements at this same commit gave 155 / 156 / 157
 * depending on the grep strategy, and the whole reason the prior audit's number
 * rotted was that it lived in a paragraph. Run
 * `pnpm exec tsx scripts/verify-tenant-scope.ts` — that print is the authority;
 * this constant must equal it.
 *
 * The drift is not noise, it is three specific predicates:
 *   - bare-substring `tenantScope` vs the DECLARATION regex below: the prose
 *     mention at `apps/web/src/app/api/v1/calendar/google/callback/contract.ts:20`
 *     ("NOT via a declared `tenantScope` — so no `tenantScope` is declared")
 *     reads as a declaration to a substring grep, which silently drops that
 *     route and moves the count by one. Pinned by a self-test case, because
 *     this is the ONE file in the repo where the two strategies differ.
 *   - the prior audit's exclusion bucket: `/api/v1/(pm|admin|internal|webhooks)/`
 *     is 20 routes here, NOT the 19 its arithmetic claimed — measured
 *     composition is 17 `/pm/` + 3 `/admin/`, and `/internal/` and `/webhooks/`
 *     contribute ZERO hand-resolving contracted routes (the one contracted
 *     `/internal/` route, `internal/inbox-spam-scan`, is token-auth and never
 *     calls the resolver; `/webhooks/` has no contracted routes at all). The
 *     prefixes are kept because a future cross-tenant hand-resolver under any
 *     of them is legitimately outside the single-tenant sweep.
 *   - the prior audit's population grep missed the `@/lib/finance/request`
 *     idiom entirely (CON-01's 121 → 157 correction); this census unions it.
 *
 * This ceiling will NOT reach zero for free: `calendar/google/callback` is a
 * permanent non-candidate (see `isBacklogRoute`) and the multi-community routes
 * under `/pm/`/`/admin/` were never in it. That is fine — the point is that it
 * cannot GROW unnoticed.
 */
const TENANT_SCOPE_BACKLOG_CEILING = 156;

/** Adoption marker: the route is written through the contract runner. */
const RUN_ROUTE_CALL = /\brunRoute\s*\(/;
/** Idiom 1 — the route calls the tenant resolver itself. */
const RESOLVER_CALL = /\bresolveEffectiveCommunityId\s*\(/;
/**
 * Idiom 2 — the route calls a helper that delegates to the resolver.
 *
 * `apps/web/src/lib/finance/request.ts:17` is literally
 * `return resolveEffectiveCommunityId(req, parsedCommunityId)`, and
 * `apps/web/src/lib/calendar/request.ts` does the same for its
 * `parseCommunityIdFromQueryOrHeader`. So the union of the two greps is ONE
 * trust path, and a resolver-only census understates the backlog (that is how
 * the 2026-07-18 audit got 121 against this census's 156 — 31 routes here
 * match ONLY through a delegate module). Matched on the IMPORT, not a bare
 * substring: ~20 route docblocks mention `parseCommunityIdFromQuery` as prose
 * about the pre-migration handler and do not call it.
 *
 * Residual: a route that reaches the resolver through some other module is
 * invisible here. If a third delegating helper appears, add its module path.
 */
const RESOLVER_DELEGATE_IMPORT =
  /import\s*\{[^}]*\bparse[A-Za-z]*CommunityId[A-Za-z]*\b[^}]*\}\s*from\s*['"]@\/lib\/(?:finance|calendar)\/request['"]/;
/**
 * A DECLARATION, never a bare substring — see the ceiling docblock for the one
 * file where the difference is a whole count. `defineRoute`'s option is
 * `tenantScope: {…}`; prose writes `` `tenantScope` `` and then a dash.
 */
const TENANT_SCOPE_DECLARATION = /tenantScope\s*:/;
/** Cross-tenant / machine-to-machine surfaces: not single-tenant, so not sweep candidates. */
const CROSS_TENANT_PATH = /\/api\/v1\/(pm|admin|internal|webhooks)\//;

export interface CensusRoute {
  /** Repo-relative path to the `route.ts`. */
  path: string;
  /** Its source, or '' when unreadable. */
  routeContent: string;
  /** The SIBLING `contract.ts` source, or null when that file does not exist. */
  contractContent: string | null;
}

/**
 * Is this route in the tenantScope drain population?
 *
 * True only when ALL of:
 *   1. it is contracted (calls `runRoute`) — an uncontracted route is already
 *      counted by `guard:contracts`, and counting it twice would let a single
 *      drain look like progress on both ratchets;
 *   2. it resolves tenancy by hand (resolver call or a delegating helper);
 *   3. it is single-tenant — not under `/pm/`, `/admin/`, `/internal/`, `/webhooks/`;
 *   4. a sibling `contract.ts` EXISTS to declare the scope on;
 *   5. that contract declares no `tenantScope`.
 *
 * `apps/web/src/app/api/v1/calendar/google/callback/route.ts` deliberately
 * STAYS inside this ceiling. It is mechanically hand-resolving, but its helper
 * resolves `?communityId=` OR the `x-community-id` header when the query is
 * absent, and `tenantScope` has exactly one `in:` per route — so its
 * non-declaration cannot be expressed by a declaration. It is a permanent
 * floor member of this number, not drainable work, and it is the case the
 * prose-vs-declaration self-test pins.
 *
 * Pure over file contents — exported so the unit test can exercise the
 * predicates without touching the filesystem.
 */
export function isBacklogRoute(route: CensusRoute): boolean {
  if (!RUN_ROUTE_CALL.test(route.routeContent)) return false;
  const handResolving =
    RESOLVER_CALL.test(route.routeContent) ||
    RESOLVER_DELEGATE_IMPORT.test(route.routeContent);
  if (!handResolving) return false;
  if (CROSS_TENANT_PATH.test(route.path)) return false;
  if (route.contractContent === null) return false;
  return !TENANT_SCOPE_DECLARATION.test(route.contractContent);
}

/** The census: every route in the drain population, in scan order. */
export function collectBacklogCensus(routes: CensusRoute[]): CensusRoute[] {
  return routes.filter(isBacklogRoute);
}

/** Read every `route.ts` under `apps/web/src/app/api/v1` with its sibling contract. */
function readCensusRoutes(): CensusRoute[] {
  const files: string[] = [];
  walkRouteFiles(join(repoRoot, API_V1_ROOT), files);
  return files.map((file) => {
    const contractPath = join(dirname(file), 'contract.ts');
    let contractContent: string | null;
    try {
      contractContent = readFileSync(contractPath, 'utf-8');
    } catch {
      contractContent = null;
    }
    return { path: relative(repoRoot, file), routeContent: safeRead(file), contractContent };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('🔍 Tenant-scope Guard (Plan B2 well-formedness + CON-01/02 backlog ratchet)');
  console.log('='.repeat(60));

  const routeFiles: string[] = [];
  walkRouteFiles(join(repoRoot, API_ROOT), routeFiles);

  const violations: Violation[] = [];
  let scopedRoutes = 0;

  for (const routeFile of routeFiles) {
    const routeRel = relative(repoRoot, routeFile);
    const routeContent = safeRead(routeFile);
    const contractContent = safeRead(join(dirname(routeFile), 'contract.ts'));
    if (hasQueryOrBodyScope(`${routeContent}\n${contractContent}`)) scopedRoutes++;
    violations.push(...validateRoute(routeContent, contractContent, routeRel));
  }

  console.log(
    `\nScanned ${routeFiles.length} route.ts files; ${scopedRoutes} declare a query/body tenantScope.`,
  );

  // -- Job B: the backlog census ------------------------------------------
  const censusRoutes = readCensusRoutes();
  if (censusRoutes.length === 0) {
    // A scan that examined nothing must not pass: if the route tree ever moves,
    // a 0-route census would sit happily under a five-digit ceiling forever.
    console.error(
      `\n❌ Could not run the tenantScope census: 0 route.ts files under ${API_V1_ROOT}.`,
    );
    process.exit(2);
  }
  const backlog = collectBacklogCensus(censusRoutes);

  // The denominator every run — a ceiling nobody prints is a number only the
  // script knows, and the drain program has to be able to read it out of CI
  // logs, so the token printed is stable: `census: N …` plus `backlog: N`.
  console.log(
    `\ncensus: ${backlog.length} hand-resolving single-tenant routes ` +
      `(ceiling ${TENANT_SCOPE_BACKLOG_CEILING})`,
  );

  const ceiling = checkCeiling(
    'tenantScope backlog',
    backlog.length,
    TENANT_SCOPE_BACKLOG_CEILING,
    'Declare `tenantScope` on the route\'s contract and drop the hand-resolved ' +
      '`communityId` (see `.claude/rules/api-patterns.md` § Tenant scoping). ' +
      'calendar/google/callback is a permanent floor member — if a route genuinely ' +
      'cannot express its tenancy in one `in:`, exclude it deliberately here and ' +
      'say why.',
  );
  if (ceiling.message) {
    console[ceiling.failed ? 'error' : 'log'](`\n${ceiling.failed ? '❌' : 'ℹ️ '} ${ceiling.message}`);
  } else {
    console.log(
      `\nbacklog: ${backlog.length} is exactly at the pinned ceiling of ` +
        `${TENANT_SCOPE_BACKLOG_CEILING} — drain it, do not raise it.`,
    );
  }

  if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} tenantScope problem(s):`);
    for (const v of violations) {
      console.error(`  ${v.file}`);
      console.error(`      ${v.message}`);
    }
  }

  if (violations.length > 0 || ceiling.failed) {
    process.exit(1);
  }

  console.log('\n✅ All declared tenantScopes are well-formed and the backlog is within ceiling.');
}

function safeRead(file: string): string {
  try {
    return readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

// ESM main-detection (POSIX only — matches the other guards).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
