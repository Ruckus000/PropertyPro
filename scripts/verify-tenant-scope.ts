/**
 * Tenant-scope Well-formedness Guard (Plan B2)
 *
 * `tenantScope` on a route contract tells `runRoute` where the route's
 * `communityId` lives so the runner can resolve + inject it (see
 * `packages/api-contract/src/define-route.ts`). This guard validates that any
 * declared `tenantScope` is well-formed — it does NOT require routes to adopt
 * tenantScope (that converges opportunistically).
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

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const API_ROOT = 'apps/web/src/app/api';

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

const TENANT_SCOPE_REGEX =
  /tenantScope:\s*\{\s*in:\s*'([^']*)'(?:\s*,\s*field:\s*'([^']*)')?/;
const METHOD_REGEX = /method:\s*'(GET|POST|PATCH|PUT|DELETE)'/;

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
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('🔍 Tenant-scope Well-formedness Guard (Plan B2)');
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

  if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} tenantScope problem(s):`);
    for (const v of violations) {
      console.error(`  ${v.file}`);
      console.error(`      ${v.message}`);
    }
    process.exit(1);
  }

  console.log('\n✅ All declared tenantScopes are well-formed.');
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
