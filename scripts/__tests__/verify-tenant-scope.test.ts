import { describe, it, expect } from 'vitest';
import {
  validateRoute,
  extractDefineRouteBlocks,
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
