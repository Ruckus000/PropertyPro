import { describe, it, expect } from 'vitest';
import {
  validateRoute,
  extractDefineRouteBlocks,
  isBacklogRoute,
  collectBacklogCensus,
  blankComments,
  CouldNotCheckError,
  type CensusRoute,
} from '../verify-tenant-scope';

const BOUND_IMPORT = "import { runRoute } from '@/lib/api/run-route';";
const PKG_IMPORT = "import { runRoute } from '@propertypro/api-contract';";

function contract(method: string, scope: string, schemaKey = 'query'): string {
  return `defineRoute({
  method: '${method}',
  path: '/api/v1/widgets',
  request: { ${schemaKey}: z.object({ communityId: z.coerce.number().int().positive() }) },
  response: z.unknown(),
  tenantScope: ${scope},
});`;
}

describe('validateRoute — valid declarations pass', () => {
  it("query scope on GET with the bound wrapper import", () => {
    const route = `${BOUND_IMPORT}\n${contract('GET', "{ in: 'query' }", 'query')}`;
    expect(validateRoute(route, '', 'route.ts')).toEqual([]);
  });

  it("body scope on POST with the bound wrapper import", () => {
    const route = `${BOUND_IMPORT}\n${contract('POST', "{ in: 'body' }", 'body')}`;
    expect(validateRoute(route, '', 'route.ts')).toEqual([]);
  });

  it("query scope on DELETE (bodyless mutation) is allowed", () => {
    const route = `${BOUND_IMPORT}\n${contract('DELETE', "{ in: 'query' }", 'query')}`;
    expect(validateRoute(route, '', 'route.ts')).toEqual([]);
  });

  it("path scope needs no resolver and no bound import", () => {
    const route = `${PKG_IMPORT}\n${contract('POST', "{ in: 'path', field: 'id' }", 'params')}`;
    expect(validateRoute(route, '', 'route.ts')).toEqual([]);
  });

  it("contract in a sibling file, import in route.ts", () => {
    const route = BOUND_IMPORT + '\nrunRoute(widgetsContract, async () => ({}));';
    const contractFile = contract('GET', "{ in: 'query' }", 'query');
    expect(validateRoute(route, contractFile, 'route.ts')).toEqual([]);
  });
});

describe('validateRoute — bites on problems', () => {
  it("flags an invalid `in` value", () => {
    const route = `${BOUND_IMPORT}\n${contract('GET', "{ in: 'header' }", 'query')}`;
    const v = validateRoute(route, '', 'route.ts');
    expect(v).toHaveLength(1);
    expect(v[0]!.message).toMatch(/invalid/);
  });

  it("flags body scope on a GET", () => {
    const route = `${BOUND_IMPORT}\n${contract('GET', "{ in: 'body' }", 'body')}`;
    const v = validateRoute(route, '', 'route.ts');
    expect(v.some((x) => /illegal on a GET/.test(x.message))).toBe(true);
  });

  it("flags a query/body scope that does NOT import the bound wrapper", () => {
    const route = `${PKG_IMPORT}\n${contract('GET', "{ in: 'query' }", 'query')}`;
    const v = validateRoute(route, '', 'route.ts');
    expect(v.some((x) => /@\/lib\/api\/run-route/.test(x.message))).toBe(true);
  });

  it("flags a scope whose matching request schema key is absent", () => {
    // in:'query' but the contract declares a body schema, no query schema.
    const route = `${BOUND_IMPORT}\n${contract('POST', "{ in: 'query' }", 'body')}`;
    const v = validateRoute(route, '', 'route.ts');
    expect(v.some((x) => /no `query:` request schema/.test(x.message))).toBe(true);
  });

  it("catches a DOUBLE-quoted scope (regex must not be single-quote-only)", () => {
    // `in: "query"` without the bound wrapper import must still be flagged —
    // otherwise a double-quoted scope silently skips the whole block.
    const route = `${PKG_IMPORT}\n${contract('GET', '{ in: "query" }', 'query')}`;
    const v = validateRoute(route, '', 'route.ts');
    expect(v.some((x) => /@\/lib\/api\/run-route/.test(x.message))).toBe(true);
  });
});

describe('extractDefineRouteBlocks', () => {
  it("extracts multiple blocks and is not confused by parens in strings", () => {
    const content = `
      export const a = defineRoute({ method: 'GET', path: '/api/v1/x(y)', response: z.unknown() });
      export const b = defineRoute({ method: 'POST', path: '/api/v1/z', response: z.unknown() });
    `;
    const blocks = extractDefineRouteBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("method: 'GET'");
    expect(blocks[1]).toContain("method: 'POST'");
  });
});

// ---------------------------------------------------------------------------
// Backlog census (CON-01 + CON-02) — the drain population behind
// TENANT_SCOPE_BACKLOG_CEILING in scripts/verify-tenant-scope.ts.
// ---------------------------------------------------------------------------

const CONTRACTLESS = "import { runRoute } from '@propertypro/api-contract';\nexport const GET = withErrorHandler(runRoute(c, async () => ({})));";

function censusRoute(overrides: Partial<CensusRoute> = {}): CensusRoute {
  return {
    path: 'apps/web/src/app/api/v1/widgets/route.ts',
    routeContent: `${CONTRACTLESS}\nconst communityId = resolveEffectiveCommunityId(req, query.communityId);`,
    contractContent: "defineRoute({ method: 'GET', path: '/api/v1/widgets', request: { query: z.object({}) } });",
    ...overrides,
  };
}

describe('isBacklogRoute — what counts as hand-resolving single-tenant work', () => {
  it('counts a contracted route that calls the resolver itself', () => {
    expect(isBacklogRoute(censusRoute())).toBe(true);
  });

  it("counts the `@/lib/finance/request` idiom, which delegates to the resolver", () => {
    // request.ts:17 is literally `return resolveEffectiveCommunityId(...)`, so
    // this is the SAME trust path — and 31 routes in the corpus are visible
    // ONLY through it. A resolver-only grep is how the last audit got 121.
    const route = censusRoute({
      routeContent: `${CONTRACTLESS}\nimport { parseCommunityIdFromQuery } from '@/lib/finance/request';\nconst communityId = parseCommunityIdFromQuery(req);`,
    });
    expect(isBacklogRoute(route)).toBe(true);
  });

  it('does NOT count a DOCBLOCK mention of the helper with no import', () => {
    // Real shape in ~20 drained routes: "* pre-migration used
    // `parseCommunityIdFromQuery`, which already delegated". Prose is not a call.
    const route = censusRoute({
      routeContent: `${CONTRACTLESS}\n/** Pre-migration used \`parseCommunityIdFromQuery\`, now runner-injected. */`,
    });
    expect(isBacklogRoute(route)).toBe(false);
  });

  it('does NOT count an uncontracted route (guard:contracts owns that backlog)', () => {
    const route = censusRoute({
      routeContent: "export const GET = withErrorHandler(async (req) => { const c = resolveEffectiveCommunityId(req, null); return NextResponse.json({}); });",
    });
    expect(isBacklogRoute(route)).toBe(false);
  });

  it('does NOT count a route that already declares a tenantScope', () => {
    const route = censusRoute({
      contractContent:
        "defineRoute({ method: 'GET', path: '/api/v1/widgets', request: { query: z.object({ communityId: z.number() }) }, tenantScope: { in: 'query' } });",
    });
    expect(isBacklogRoute(route)).toBe(false);
  });

  it('does NOT count a route with no sibling contract.ts to declare on', () => {
    // The canonical census predicate requires the contract file to EXIST: with
    // none, the route is not a sweep candidate in this lane at all.
    expect(isBacklogRoute(censusRoute({ contractContent: null }))).toBe(false);
  });

  it.each(['pm', 'admin', 'internal', 'webhooks'])(
    'does NOT count a cross-tenant/machine surface under /api/v1/%s/',
    (prefix) => {
      const route = censusRoute({
        path: `apps/web/src/app/api/v1/${prefix}/things/route.ts`,
      });
      expect(isBacklogRoute(route)).toBe(false);
    },
  );
});

describe('isBacklogRoute — the prose-vs-declaration trap (ledger D9)', () => {
  // A contract docblock can say the words while declaring nothing. The Google
  // Calendar callback contract did exactly that until it was deleted on
  // 2026-10-20; a substring predicate would silently drop such a route from the
  // census and hand the sweep a phantom "already adopted".
  const PROSE =
    ' * Tenancy is resolved by hand from the query, NOT via a declared\n' +
    ' * `tenantScope` — so no `tenantScope` is declared and the runner does not\n' +
    ' * inject `communityId`.\n';

  it('does NOT treat the prose mention as a declaration', () => {
    const route = censusRoute({
      routeContent: `${CONTRACTLESS}\nimport { parseCommunityIdFromQuery } from '@/lib/finance/request';\nconst communityId = parseCommunityIdFromQuery(req);`,
      contractContent: `/**\n${PROSE} */\ndefineRoute({ method: 'GET', path: '/api/v1/widgets' });`,
    });
    expect(isBacklogRoute(route)).toBe(true);
  });

  it('is contradicted by a real declaration — the regex keys on the colon', () => {
    const withProseAndDeclaration = censusRoute({
      routeContent: `${CONTRACTLESS}\nimport { parseCommunityIdFromQuery } from '@/lib/finance/request';`,
      contractContent: `/**\n${PROSE} */\ndefineRoute({ method: 'GET', path: '/x', tenantScope: { in: 'query' } });`,
    });
    expect(isBacklogRoute(withProseAndDeclaration)).toBe(false);
  });
});

describe('comment prose is never read as code', () => {
  it('a contract whose ONLY `tenantScope:` is in a comment still counts as backlog', () => {
    // `// tenantScope: n/a` matches the declaration regex character for
    // character; read raw, it silently removed the route from the census.
    const route = censusRoute({
      contractContent:
        "// tenantScope: n/a — resolved by hand below\ndefineRoute({ method: 'GET', path: '/api/v1/widgets', request: { query: z.object({}) } });",
    });
    expect(isBacklogRoute(route)).toBe(true);
  });

  it("a `// don't` inside the first defineRoute block does not hide a later block's violation", () => {
    // The `'` in the comment used to open a phantom string in the brace
    // matcher, which then swallowed the second block into the first — where
    // checkBlock only ever reads the FIRST tenantScope (block a's valid one).
    const route = `${BOUND_IMPORT}
export const a = defineRoute({
  // don't resolve the community here
  method: 'GET',
  path: '/api/v1/widgets',
  request: { query: z.object({}) },
  response: z.unknown(),
  tenantScope: { in: 'query' },
});
export const b = defineRoute({
  method: 'POST',
  path: '/api/v1/widgets',
  request: { query: z.object({}) },
  response: z.unknown(),
  tenantScope: { in: 'header' },
});`;
    const v = validateRoute(route, '', 'route.ts');
    expect(v.map((x) => x.message)).toEqual([
      "tenantScope.in='header' is invalid (expected 'query' | 'body' | 'path').",
    ]);
  });

  it('blanking preserves length and newlines', () => {
    const source = 'const a = 1; // note\n/* two\nlines */ const b = 2;\n';
    const out = blankComments('x.ts', source);
    expect(out).toHaveLength(source.length);
    expect(out.split('\n')).toHaveLength(source.split('\n').length);
    expect(out).not.toMatch(/note|two|lines/);
    expect(out).toContain('const b = 2;');
  });

  it('refuses (CouldNotCheckError) on a file that does not parse', () => {
    expect(() => blankComments('x.ts', 'const a = (((;')).toThrow(CouldNotCheckError);
  });
});

describe('collectBacklogCensus', () => {
  it('filters a mixed tree down to the drain population only', () => {
    const adopted = censusRoute({
      path: 'apps/web/src/app/api/v1/adopted/route.ts',
      contractContent: "defineRoute({ method: 'GET', path: '/a', tenantScope: { in: 'query' } });",
    });
    const crossTenant = censusRoute({ path: 'apps/web/src/app/api/v1/pm/things/route.ts' });
    const plain = censusRoute({ path: 'apps/web/src/app/api/v1/plain/route.ts' });
    const result = collectBacklogCensus([adopted, crossTenant, plain]);
    expect(result.map((r) => r.path)).toEqual(['apps/web/src/app/api/v1/plain/route.ts']);
  });

  it('returns an empty list for a tree with no candidates (never throws)', () => {
    expect(collectBacklogCensus([])).toEqual([]);
  });
});
