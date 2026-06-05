# B4 Contract-Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single parameterized vitest harness that enumerates every `/api/v1/*` route contract and asserts, per contract, (a) malformed input is rejected with a 400 `VALIDATION_ERROR` before the handler runs, and (b) the declared RBAC `permission` resolves to a real matrix entry — plus an ADR documenting a branch-protection gap.

**Architecture:** Glob-import all `contract.ts` modules into a registry (no codegen). A `describe.each` over the registry runs two checks per contract. Malformed input is synthesized by introspecting each contract's own Zod schema, **location-aware** (query/params are always strings at the runner, so they get string-only candidates). Coverage (`covered` / `input-permissive` / `no-input` / `unknown-response`) is counted and asserted against a floor so it can't silently erode. Lives in the unit-test job; gating is handled by ADR-005's branch-protection recommendation (not by a separate guard).

**Tech Stack:** TypeScript, Vitest (Vite `import.meta.glob`), Zod v4, `@propertypro/api-contract` (`runRoute`/`z`), `@propertypro/shared` (`RBAC_RESOURCES`/`RBAC_ACTIONS`), Next.js 15 `NextRequest`/`NextResponse`.

**Spec:** `docs/superpowers/specs/2026-06-05-b4-contract-test-harness-design.md`

---

## Pre-flight (one-time, not a code task)

The worktree must have built packages or the suite can't resolve `@propertypro/api-contract` (it resolves to `dist/`, which is gitignored).

- [ ] **Build workspace packages** (idempotent; FULL-TURBO cached after first run)

Run:
```bash
pnpm install
pnpm turbo run build --filter='./packages/*'
```
Expected: `Tasks: 6 successful`.

> **Naming:** the harness lives in `apps/web/__tests__/api-contract-suite/`. Do **NOT** use `apps/web/__tests__/contracts/` — that directory already holds the vendor-contracts *domain* tests (`contracts-route.test.ts`, etc.).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/__tests__/api-contract-suite/contract-registry.ts` | Glob-import + filter all route contracts into a typed registry. |
| `apps/web/__tests__/api-contract-suite/contract-registry.test.ts` | Asserts the registry is non-empty and well-shaped. |
| `apps/web/__tests__/api-contract-suite/malformed-input.ts` | `synthesizeRejected(schema, location)` — location-aware bad-value synthesis. |
| `apps/web/__tests__/api-contract-suite/malformed-input.test.ts` | Unit tests for the synthesizer (object/query/permissive/unknown). |
| `apps/web/__tests__/api-contract-suite/rbac-check.ts` | `checkRbac(contract)` + `KNOWN_NON_MATRIX_PERMISSIONS`. |
| `apps/web/__tests__/api-contract-suite/rbac-check.test.ts` | Unit tests for the RBAC check. |
| `apps/web/__tests__/api-contract-suite/run-input-check.ts` | Build a malformed `NextRequest`, drive it through `withErrorHandler(runRoute())`, return `{ status, code, handlerCalled }`. |
| `apps/web/__tests__/api-contract-suite/run-input-check.test.ts` | Unit tests for the driver against synthetic contracts. |
| `apps/web/__tests__/api-contract-suite/analyze.ts` | Pure per-contract analysis: classify input-check + rbac + unknown-response. |
| `apps/web/__tests__/api-contract-suite/contract-suite.test.ts` | `describe.each` running (a)+(b) over the real registry + coverage assertions. |
| `apps/web/__tests__/api-contract-suite/contract-suite-meta.test.ts` | Negative controls (prove the checks can fail/flag). |
| `docs/adr/ADR-005-required-status-checks.md` | Branch-protection audit finding + recommendation. |

---

### Task 1: Contract registry

**Files:**
- Create: `apps/web/__tests__/api-contract-suite/contract-registry.ts`
- Test: `apps/web/__tests__/api-contract-suite/contract-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/api-contract-suite/contract-registry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadContractRegistry } from './contract-registry';

describe('contract registry', () => {
  const registry = loadContractRegistry();

  it('enumerates a large set of contracts (floor guards against a glob regression)', () => {
    // Spike on 2026-06-05 found 285. Floor is deliberately well below that.
    expect(registry.length).toBeGreaterThanOrEqual(180);
  });

  it('every entry is well-shaped', () => {
    for (const entry of registry) {
      expect(typeof entry.file).toBe('string');
      expect(typeof entry.exportName).toBe('string');
      expect(typeof entry.contract.method).toBe('string');
      expect(typeof entry.contract.path).toBe('string');
      expect(typeof entry.contract.response.safeParse).toBe('function');
    }
  });

  it('is sorted deterministically', () => {
    const keys = registry.map((e) => `${e.file}#${e.exportName}`);
    expect([...keys].sort()).toEqual(keys);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/contract-registry.test.ts`
Expected: FAIL — `Failed to resolve import "./contract-registry"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/__tests__/api-contract-suite/contract-registry.ts`:
```ts
import type { AnyRouteContract } from '@propertypro/api-contract';

export interface RegisteredContract {
  /** Source file (glob key), e.g. '../../src/app/api/v1/residents/contract.ts'. */
  file: string;
  /** Named export, e.g. 'residentsListContract'. */
  exportName: string;
  contract: AnyRouteContract;
}

const HTTP_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

/** Structural test — a value is a route contract if it has the runtime shape. */
function isRouteContract(value: unknown): value is AnyRouteContract {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  const response = o['response'] as { safeParse?: unknown } | undefined;
  return (
    typeof o['method'] === 'string' &&
    HTTP_METHODS.has(o['method'] as string) &&
    typeof o['path'] === 'string' &&
    typeof o['request'] === 'object' &&
    o['request'] !== null &&
    typeof response?.safeParse === 'function'
  );
}

// Vite eagerly inlines these imports at build time. Path is relative to THIS
// file: up out of api-contract-suite/ and __tests__/ into apps/web/, then src.
const modules = import.meta.glob('../../src/app/api/**/contract.ts', {
  eager: true,
});

export function loadContractRegistry(): RegisteredContract[] {
  const out: RegisteredContract[] = [];
  for (const [file, mod] of Object.entries(modules)) {
    for (const [exportName, value] of Object.entries(mod as Record<string, unknown>)) {
      if (isRouteContract(value)) {
        out.push({ file, exportName, contract: value });
      }
    }
  }
  out.sort((a, b) =>
    `${a.file}#${a.exportName}`.localeCompare(`${b.file}#${b.exportName}`),
  );
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/contract-registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/__tests__/api-contract-suite/contract-registry.ts apps/web/__tests__/api-contract-suite/contract-registry.test.ts
git commit -m "test(b4): contract registry — glob-enumerate all route contracts"
```

---

### Task 2: Location-aware malformed-input synthesizer

**Files:**
- Create: `apps/web/__tests__/api-contract-suite/malformed-input.ts`
- Test: `apps/web/__tests__/api-contract-suite/malformed-input.test.ts`

> **Why location-aware (do not simplify this away):** the runner builds `query`/`params` from `URLSearchParams`/path segments, so those schemas only ever receive **strings** (or a missing key). A non-string probe (e.g. number `123`) "rejects" a `z.string()` field but the *reachable* input (the string `'123'`) passes — false coverage on an unreachable path. Also: the runner collapses empty-string query params to `undefined`, so `''` is NOT a safe candidate (it would diverge from what the runner delivers). Query/params candidates are therefore **non-empty strings only**; "missing required" is modelled with `{}`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/api-contract-suite/malformed-input.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { z } from '@propertypro/api-contract';
import { synthesizeRejected } from './malformed-input';

describe('synthesizeRejected', () => {
  it('rejects a malformed body object (null breaks an object schema)', () => {
    const schema = z.object({ communityId: z.number().int().positive() });
    const r = synthesizeRejected(schema, 'body');
    expect(r.ok).toBe(true);
    if (r.ok) expect(schema.safeParse(r.value).success).toBe(false);
  });

  it('rejects a malformed query via a NON-NUMERIC STRING (coercion fails)', () => {
    const schema = z.object({ communityId: z.coerce.number().int().positive() });
    const r = synthesizeRejected(schema, 'query');
    expect(r.ok).toBe(true);
    if (r.ok) {
      // value must be an object whose field is a STRING (reachable via the runner)
      const v = r.value as Record<string, unknown>;
      const onlyVal = Object.values(v)[0];
      if (onlyVal !== undefined) expect(typeof onlyVal).toBe('string');
      expect(schema.safeParse(r.value).success).toBe(false);
    }
  });

  it('covers a required string field via missing-required {} (empty `?q=` is collapsed to undefined, so OMITTING q is the reachable malformation)', () => {
    const schema = z.object({ q: z.string().min(1) });
    const r = synthesizeRejected(schema, 'query');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({});
  });

  it('models missing-required via {} when no field value can be broken', () => {
    // communityId is a free string (permissive) but REQUIRED — {} rejects it.
    const schema = z.object({ communityId: z.string() });
    const r = synthesizeRejected(schema, 'query');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({});
  });

  it('classifies z.unknown() as permissive', () => {
    const r = synthesizeRejected(z.unknown(), 'body');
    expect(r).toEqual({ ok: false, reason: 'permissive' });
  });

  it('classifies an all-optional object as permissive (nothing required, nothing breakable by string)', () => {
    const schema = z.object({ cursor: z.string().optional(), note: z.string().optional() });
    const r = synthesizeRejected(schema, 'query');
    expect(r).toEqual({ ok: false, reason: 'permissive' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/malformed-input.test.ts`
Expected: FAIL — `Failed to resolve import "./malformed-input"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/__tests__/api-contract-suite/malformed-input.ts`:
```ts
import { z } from '@propertypro/api-contract';

export type InputLocation = 'params' | 'query' | 'body';

export type SynthResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'permissive' };

// query/params reach the schema as NON-EMPTY strings (empty strings are
// collapsed to undefined by the runner, so they're excluded). body is raw JSON.
const STRING_CANDIDATES: readonly unknown[] = [
  '∅invalid∅',
  'not-a-valid-value',
  '-1',
];
const JSON_CANDIDATES: readonly unknown[] = [null, 123, '∅invalid∅', [], true];

function rejects(schema: z.ZodTypeAny, value: unknown): boolean {
  return !schema.safeParse(value).success;
}

/**
 * Find a malformed object the WHOLE schema rejects, using only `candidates` as
 * field values (so the result is reachable through the runner for that
 * location). Falls back to `{}` (missing-required). Returns permissive if the
 * schema accepts every location-legal shape.
 */
function objectFieldLevel(
  schema: z.ZodTypeAny,
  candidates: readonly unknown[],
): SynthResult {
  if (!(schema instanceof z.ZodObject)) return { ok: false, reason: 'permissive' };
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  for (const name of Object.keys(shape)) {
    const field = shape[name]!;
    const bad = candidates.find((c) => rejects(field, c));
    if (bad === undefined) continue; // this field accepts all candidates
    const obj: Record<string, unknown> = { [name]: bad };
    if (rejects(schema, obj)) return { ok: true, value: obj };
  }
  if (rejects(schema, {})) return { ok: true, value: {} }; // a required field is missing
  return { ok: false, reason: 'permissive' };
}

export function synthesizeRejected(
  schema: z.ZodTypeAny,
  location: InputLocation,
): SynthResult {
  if (location === 'body') {
    // body raw can be ANY JSON value → whole-value candidates are reachable.
    for (const c of JSON_CANDIDATES) {
      if (rejects(schema, c)) return { ok: true, value: c };
    }
    // Rare: a body schema that accepts every scalar/array. Try field-level.
    return objectFieldLevel(schema, JSON_CANDIDATES);
  }
  // query / params: the schema always receives an object of strings. Only
  // string-valued / missing fields are reachable.
  return objectFieldLevel(schema, STRING_CANDIDATES);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/malformed-input.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/__tests__/api-contract-suite/malformed-input.ts apps/web/__tests__/api-contract-suite/malformed-input.test.ts
git commit -m "test(b4): location-aware malformed-input synthesizer"
```

---

### Task 3: RBAC metadata check

**Files:**
- Create: `apps/web/__tests__/api-contract-suite/rbac-check.ts`
- Test: `apps/web/__tests__/api-contract-suite/rbac-check.test.ts`

> **Scope of this check (do not over-sell):** it verifies the contract's *decorative* `permission` metadata names a real matrix `(resource, action)` — it is NOT authorization enforcement (that's `requirePermission`, already `RbacResource`-typed at the call site). The 9 allowlisted pairs are routes intentionally outside the matrix (PM cross-community, apartment feature-gate, public help, billing). If check (b) fails on a NEW pair, that's the ratchet working — verify it's deliberate, then add it with a comment.

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/api-contract-suite/rbac-check.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { checkRbac } from './rbac-check';

const base = { method: 'GET' as const, path: '/x', request: {}, response: { safeParse() {} } };

describe('checkRbac', () => {
  it('passes a real matrix pair', () => {
    expect(checkRbac({ ...base, permission: { resource: 'documents', action: 'read' } } as any))
      .toEqual({ status: 'ok' });
  });

  it('passes an allowlisted out-of-matrix pair', () => {
    expect(checkRbac({ ...base, permission: { resource: 'move_checklists', action: 'update' } } as any))
      .toEqual({ status: 'allowlisted' });
  });

  it('records inapplicable when no permission is declared', () => {
    expect(checkRbac(base as any)).toEqual({ status: 'inapplicable' });
  });

  it('FAILS a bogus resource not in the matrix or allowlist', () => {
    const r = checkRbac({ ...base, permission: { resource: 'definitely_not_real', action: 'read' } } as any);
    expect(r.status).toBe('fail');
  });

  it('FAILS a matrix resource paired with an unknown action', () => {
    const r = checkRbac({ ...base, permission: { resource: 'documents', action: 'frobnicate' } } as any);
    expect(r.status).toBe('fail');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/rbac-check.test.ts`
Expected: FAIL — `Failed to resolve import "./rbac-check"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/__tests__/api-contract-suite/rbac-check.ts`:
```ts
import { RBAC_RESOURCES, RBAC_ACTIONS } from '@propertypro/shared';
import type { AnyRouteContract } from '@propertypro/api-contract';

/**
 * Permission `(resource:action)` pairs intentionally OUTSIDE the RBAC matrix.
 * These routes authorize via other mechanisms (PM cross-community, apartment
 * feature-gate, public help, billing). Verified exhaustive 2026-06-05.
 * Ratchet: a NEW pair here means a contract declared a non-matrix permission —
 * confirm it's deliberate before adding it.
 */
export const KNOWN_NON_MATRIX_PERMISSIONS: ReadonlySet<string> = new Set([
  'communities:read',
  'communities:write',
  'help:read',
  'billing_groups:read',
  'leases:read',
  'leases:write',
  'move_checklists:read',
  'move_checklists:write',
  'move_checklists:update',
]);

export type RbacCheckResult =
  | { status: 'ok' | 'inapplicable' | 'allowlisted' }
  | { status: 'fail'; message: string };

export function checkRbac(contract: AnyRouteContract): RbacCheckResult {
  const permission = contract.permission;
  if (!permission) return { status: 'inapplicable' };

  const { resource, action } = permission;
  const inMatrix =
    (RBAC_RESOURCES as readonly string[]).includes(resource) &&
    (RBAC_ACTIONS as readonly string[]).includes(action);
  if (inMatrix) return { status: 'ok' };

  if (KNOWN_NON_MATRIX_PERMISSIONS.has(`${resource}:${action}`)) {
    return { status: 'allowlisted' };
  }

  return {
    status: 'fail',
    message: `permission { resource: '${resource}', action: '${action}' } is not a matrix (resource, action) and not in KNOWN_NON_MATRIX_PERMISSIONS`,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/rbac-check.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/__tests__/api-contract-suite/rbac-check.ts apps/web/__tests__/api-contract-suite/rbac-check.test.ts
git commit -m "test(b4): RBAC metadata existence check + out-of-matrix allowlist"
```

---

### Task 4: Malformed-request driver

**Files:**
- Create: `apps/web/__tests__/api-contract-suite/run-input-check.ts`
- Test: `apps/web/__tests__/api-contract-suite/run-input-check.test.ts`

> Drives a synthesized malformed value through the REAL `withErrorHandler(runRoute(contract, spy))`. The location malformed is the *first declared* one (params → query → body), which is also the order the runner parses, so the injected malformation is the one that fires. `resolveCommunityId` is stubbed (only reached after validation, which the malformed path never passes).

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/api-contract-suite/run-input-check.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { z, runRoute } from '@propertypro/api-contract';
import { runInputCheck } from './run-input-check';

describe('runInputCheck', () => {
  it('drives a bad BODY to a 400 with handler never called', async () => {
    const contract = {
      method: 'POST' as const, path: '/x',
      request: { body: z.object({ communityId: z.number().int().positive() }) },
      response: z.unknown(),
    };
    const r = await runInputCheck(contract, 'body', { communityId: -1 });
    expect(r).toEqual({ status: 400, code: 'VALIDATION_ERROR', handlerCalled: false });
  });

  it('drives a bad QUERY string to a 400', async () => {
    const contract = {
      method: 'GET' as const, path: '/x',
      request: { query: z.object({ communityId: z.coerce.number().int().positive() }) },
      response: z.unknown(),
    };
    const r = await runInputCheck(contract, 'query', { communityId: 'abc' });
    expect(r.status).toBe(400);
    expect(r.handlerCalled).toBe(false);
  });

  it('drives bad PARAMS (Next15 promise ctx) to a 400', async () => {
    const contract = {
      method: 'GET' as const, path: '/x/[id]',
      request: { params: z.object({ id: z.coerce.number().int().positive() }) },
      response: z.unknown(),
    };
    const r = await runInputCheck(contract, 'params', { id: 'abc' });
    expect(r.status).toBe(400);
    expect(r.handlerCalled).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/run-input-check.test.ts`
Expected: FAIL — `Failed to resolve import "./run-input-check"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/__tests__/api-contract-suite/run-input-check.ts`:
```ts
import { NextRequest } from 'next/server';
import { runRoute, type AnyRouteContract } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import type { InputLocation } from './malformed-input';

export interface InputCheckResult {
  status: number;
  code: string | undefined;
  handlerCalled: boolean;
}

/** Replace `[param]` path segments with a placeholder so the URL is valid. */
function concretePath(path: string): string {
  return path.replace(/\[[^\]]+\]/g, '_');
}

export async function runInputCheck(
  contract: AnyRouteContract,
  location: InputLocation,
  bad: unknown,
): Promise<InputCheckResult> {
  let handlerCalled = false;
  const wrapped = withErrorHandler(
    runRoute(
      contract,
      async () => {
        handlerCalled = true;
        return undefined as never;
      },
      { resolveCommunityId: () => 1 },
    ),
  );

  const url = new URL(`http://localhost${concretePath(contract.path)}`);
  let req: NextRequest;
  let ctx: { params?: Promise<Record<string, string | string[]>> } | undefined;

  if (location === 'query') {
    for (const [k, v] of Object.entries(bad as Record<string, unknown>)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
    req = new NextRequest(url.toString(), { method: contract.method });
  } else if (location === 'body') {
    req = new NextRequest(url.toString(), {
      method: contract.method,
      body: JSON.stringify(bad),
      headers: { 'content-type': 'application/json' },
    });
  } else {
    req = new NextRequest(url.toString(), { method: contract.method });
    ctx = { params: Promise.resolve(bad as Record<string, string | string[]>) };
  }

  const res = await wrapped(req, ctx);
  let code: string | undefined;
  try {
    const json = (await res.json()) as { error?: { code?: string } };
    code = json.error?.code;
  } catch {
    code = undefined;
  }
  return { status: res.status, code, handlerCalled };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/run-input-check.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/__tests__/api-contract-suite/run-input-check.ts apps/web/__tests__/api-contract-suite/run-input-check.test.ts
git commit -m "test(b4): malformed-request driver through withErrorHandler(runRoute())"
```

---

### Task 5: Per-contract analysis (pure)

**Files:**
- Create: `apps/web/__tests__/api-contract-suite/analyze.ts`
- Test: covered by the meta-tests in Task 7 and the suite in Task 6 (pure function; exercised end-to-end). No separate unit test file — keep it DRY; the meta-tests assert its branches directly.

> This is the only task without its own `.test.ts`: `analyze.ts` is a thin pure composition of already-tested helpers, and Task 7's meta-tests assert each of its output branches against synthetic contracts. Adding a third test file would duplicate those assertions.

- [ ] **Step 1: Write the implementation**

Create `apps/web/__tests__/api-contract-suite/analyze.ts`:
```ts
import { z, type AnyRouteContract } from '@propertypro/api-contract';
import { synthesizeRejected, type InputLocation } from './malformed-input';
import { checkRbac, type RbacCheckResult } from './rbac-check';

export interface AnalyzedContract {
  label: string;
  contract: AnyRouteContract;
  input:
    | { kind: 'covered'; location: InputLocation; bad: unknown }
    | { kind: 'input-permissive' }
    | { kind: 'no-input' };
  rbac: RbacCheckResult;
  unknownResponse: boolean;
}

/** Locations the runner actually validates, in parse order. body skipped for GET. */
function validatedLocations(contract: AnyRouteContract): InputLocation[] {
  const r = contract.request as Record<string, unknown>;
  const locs: InputLocation[] = [];
  if (r['params']) locs.push('params');
  if (r['query']) locs.push('query');
  if (r['body'] && contract.method !== 'GET') locs.push('body');
  return locs;
}

function isPermissiveResponse(schema: { safeParse: unknown }): boolean {
  return schema instanceof z.ZodUnknown || schema instanceof z.ZodAny;
}

export function analyzeContract(
  contract: AnyRouteContract,
  exportName: string,
): AnalyzedContract {
  const label = `${contract.method} ${contract.path} (${exportName})`;
  const locations = validatedLocations(contract);

  let input: AnalyzedContract['input'] = { kind: 'no-input' };
  if (locations.length > 0) {
    input = { kind: 'input-permissive' };
    for (const location of locations) {
      const schema = (contract.request as Record<string, z.ZodTypeAny>)[location]!;
      const synth = synthesizeRejected(schema, location);
      if (synth.ok) {
        input = { kind: 'covered', location, bad: synth.value };
        break;
      }
    }
  }

  return {
    label,
    contract,
    input,
    rbac: checkRbac(contract),
    unknownResponse: isPermissiveResponse(contract.response),
  };
}
```

- [ ] **Step 2: Typecheck it compiles (no test yet)**

Run: `pnpm --filter @propertypro/web exec tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep api-contract-suite/analyze || echo "analyze.ts clean"`
Expected: `analyze.ts clean`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/api-contract-suite/analyze.ts
git commit -m "test(b4): pure per-contract analysis (input + rbac + unknown-response)"
```

---

### Task 6: The contract suite (checks a + b + coverage)

**Files:**
- Create: `apps/web/__tests__/api-contract-suite/contract-suite.test.ts`

- [ ] **Step 1: Write the suite**

Create `apps/web/__tests__/api-contract-suite/contract-suite.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loadContractRegistry } from './contract-registry';
import { analyzeContract, type AnalyzedContract } from './analyze';
import { runInputCheck } from './run-input-check';

const registry = loadContractRegistry();
const analyzed: AnalyzedContract[] = registry.map((e) =>
  analyzeContract(e.contract, e.exportName),
);

describe('contract suite — per-contract checks', () => {
  describe.each(analyzed)('$label', (a) => {
    it('(a) malformed input is rejected with 400 before the handler runs', async () => {
      if (a.input.kind !== 'covered') {
        // input-permissive / no-input: (a) is inapplicable. Counted below.
        return;
      }
      const r = await runInputCheck(a.contract, a.input.location, a.input.bad);
      expect(r.handlerCalled).toBe(false);
      expect(r.status).toBe(400);
      expect(r.code).toBe('VALIDATION_ERROR');
    });

    it('(b) declared RBAC permission resolves to a matrix entry (or allowlist)', () => {
      if (a.rbac.status === 'fail') {
        throw new Error(a.rbac.message);
      }
      expect(['ok', 'allowlisted', 'inapplicable']).toContain(a.rbac.status);
    });
  });
});

describe('contract suite — coverage report', () => {
  const counts = {
    total: analyzed.length,
    covered: analyzed.filter((a) => a.input.kind === 'covered').length,
    inputPermissive: analyzed.filter((a) => a.input.kind === 'input-permissive').length,
    noInput: analyzed.filter((a) => a.input.kind === 'no-input').length,
    rbacChecked: analyzed.filter((a) => a.rbac.status === 'ok').length,
    rbacAllowlisted: analyzed.filter((a) => a.rbac.status === 'allowlisted').length,
    rbacInapplicable: analyzed.filter((a) => a.rbac.status === 'inapplicable').length,
    unknownResponse: analyzed.filter((a) => a.unknownResponse).length,
  };

  it('logs the coverage table', () => {
    // eslint-disable-next-line no-console
    console.table(counts);
    expect(counts.total).toBe(analyzed.length);
  });

  it('floor: a strong majority of contracts get a real (a) assertion', () => {
    // Set from the FIRST real run of this location-aware suite (Step 2). The
    // value below is the floor, not the actual — it guards against erosion.
    expect(counts.covered).toBeGreaterThanOrEqual(180);
  });

  it('no contract is left in an RBAC "fail" state', () => {
    const failures = analyzed.filter((a) => a.rbac.status === 'fail');
    expect(failures.map((a) => a.label)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the suite and READ THE COVERAGE TABLE**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/contract-suite.test.ts 2>&1 | tail -40`
Expected: all per-contract tests PASS. Note the printed `console.table` — record the real `covered` number.

- [ ] **Step 3: Calibrate the floor**

If the printed `covered` is, say, 240, set the floor to a safe margin below it (e.g. `Math.floor(0.9 * covered)` ≈ 215). Edit the `toBeGreaterThanOrEqual(180)` line in `contract-suite.test.ts` to that calibrated floor. If `covered` is below 180, investigate (likely a synthesizer or registry bug) before lowering the floor.

- [ ] **Step 4: Re-run to confirm green with the calibrated floor**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/contract-suite.test.ts 2>&1 | tail -8`
Expected: PASS. If any `(b)` test throws an RBAC `fail`, the message names the offending contract — either it's a typo (fix the contract in a separate PR) or a deliberate new out-of-matrix pair (add to `KNOWN_NON_MATRIX_PERMISSIONS` with a comment).

- [ ] **Step 5: Commit**

```bash
git add apps/web/__tests__/api-contract-suite/contract-suite.test.ts
git commit -m "test(b4): parameterized contract suite — checks (a)+(b) + coverage floor"
```

---

### Task 7: Meta-tests (negative controls)

**Files:**
- Create: `apps/web/__tests__/api-contract-suite/contract-suite-meta.test.ts`

> Proves the checks can actually FAIL/flag — otherwise a vacuous suite would pass silently. Asserts `analyzeContract`'s branches against synthetic contracts.

- [ ] **Step 1: Write the meta-tests**

Create `apps/web/__tests__/api-contract-suite/contract-suite-meta.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { z } from '@propertypro/api-contract';
import { analyzeContract } from './analyze';
import { runInputCheck } from './run-input-check';

const make = (overrides: Record<string, unknown>) =>
  ({ method: 'POST', path: '/meta', request: {}, response: z.unknown(), ...overrides }) as any;

describe('meta — the checks can fail/flag', () => {
  it('check (b) FAILS on a bogus RBAC resource', () => {
    const a = analyzeContract(make({ permission: { resource: 'not_a_resource', action: 'read' } }), 'bogus');
    expect(a.rbac.status).toBe('fail');
  });

  it('check (a) classifies a z.unknown() body as input-permissive (not "covered")', () => {
    const a = analyzeContract(make({ request: { body: z.unknown() } }), 'permissiveBody');
    expect(a.input.kind).toBe('input-permissive');
  });

  it('check (a) classifies an empty request as no-input', () => {
    const a = analyzeContract(make({ request: {} }), 'noInput');
    expect(a.input.kind).toBe('no-input');
  });

  it('flags a z.unknown() response', () => {
    const a = analyzeContract(make({ response: z.unknown() }), 'unknownResp');
    expect(a.unknownResponse).toBe(true);
  });

  it('a "covered" synthetic contract really 400s end-to-end', async () => {
    const contract = make({ request: { body: z.object({ n: z.number().int().positive() }) } });
    const a = analyzeContract(contract, 'covered');
    expect(a.input.kind).toBe('covered');
    if (a.input.kind === 'covered') {
      const r = await runInputCheck(contract, a.input.location, a.input.bad);
      expect(r.status).toBe(400);
      expect(r.handlerCalled).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/contract-suite-meta.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/api-contract-suite/contract-suite-meta.test.ts
git commit -m "test(b4): meta negative-controls proving the checks can fail"
```

---

### Task 8: Branch-protection audit + ADR-005

**Files:**
- Create: `docs/adr/ADR-005-required-status-checks.md`

- [ ] **Step 1: Read the live branch-protection settings**

Run:
```bash
gh api repos/Ruckus000/PropertyPro/branches/main/protection --jq '.required_status_checks.contexts' 2>&1
```
Expected: a JSON array of required check contexts (or a 404/permission error). Record the exact output. If it errors for permissions, run the fallback:
```bash
gh api repos/Ruckus000/PropertyPro/branches/main/protection/required_status_checks 2>&1 | head -40
```
Capture whichever succeeds verbatim — that list is the ADR's primary evidence.

- [ ] **Step 2: Write the ADR**

Create `docs/adr/ADR-005-required-status-checks.md` (fill the `Observed required contexts` block with the EXACT array from Step 1):
```markdown
# ADR-005: Required status checks for `main`

- **Status:** Proposed
- **Date:** 2026-06-05
- **Context tags:** CI, branch protection, Plan B4

## Context

Plan B4 adds a parameterized contract-test suite
(`apps/web/__tests__/api-contract-suite/`) that asserts, per route contract,
malformed-input rejection (a) and RBAC-metadata integrity (b). It runs in the
**unit-test** CI job. A test/guard only prevents regressions if its job is a
**required** status check on `main`; otherwise a PR can merge red.

Prior observation (B6/B2 merges on 2026-06-05 auto-merged in ~30s) suggested the
full Build/Unit/integration suite is not gating — only Lint/guards.

## Observed required contexts (live audit, 2026-06-05)

```
<PASTE THE EXACT `gh api ... .required_status_checks.contexts` ARRAY HERE>
```

## Finding

- `integration-tests` and `perf-check` are **not** in the required set.
- The **unit-test job is also not required**, so the new B4 suite — and every
  existing unit test — does not gate a merge today.

## Decision

This ADR is **documentation + recommendation only**; it does not change the
GitHub setting (an outward-facing repo-admin action the maintainer must apply).

**Recommended:** add the unit-test job (the job that runs
`apps/web/__tests__/**`, including the B4 suite) to `main`'s required status
checks, and evaluate adding `integration-tests` and `perf-check`. Until then,
the B4 suite is a local + CI signal (`pnpm test`) but not a merge gate.

## Consequences

- Once applied, B4's checks (a)+(b) become merge-blocking — the intended value.
- Trade-off: making the unit-test job required makes any flaky/slow unit test
  merge-blocking; the team should confirm suite stability first.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-005-required-status-checks.md
git commit -m "docs(b4): ADR-005 — branch-protection audit + required-checks recommendation"
```

---

### Task 9: Full verification + PR

- [ ] **Step 1: Typecheck the whole web app (direct tsc — turbo cache serves stale green)**

Run: `pnpm --filter @propertypro/web exec tsc --noEmit -p apps/web/tsconfig.json`
Expected: no errors. (Pre-existing errors unrelated to `api-contract-suite/` are not introduced by this work — confirm any error path contains `api-contract-suite/` before fixing.)

- [ ] **Step 2: Run the entire new suite directory**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/api-contract-suite/`
Expected: all files PASS.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: PASS (includes DB-access + boundary guards; this PR adds only test files under `__tests__/`, which the component/route guards don't scan).

- [ ] **Step 4: Sanity — confirm no pre-existing unrelated failures were introduced**

Run: `pnpm --filter @propertypro/web exec vitest run 2>&1 | tail -15`
Expected: the only failures are the 3 known DB-gated files (`calendar-event-reminder-service`, `esign-my-pending`, `public-site`) with `Missing DATABASE_URL` — confirm by checking they fail identically on `git stash`. The new `api-contract-suite/` files all pass.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin b4/contract-test-harness
gh pr create --base main --title "B4: parameterized contract-test harness + ADR-005" --body "$(cat <<'EOF'
Plan B4 — the last net-new architectural-standardization lane.

A single parameterized vitest (`apps/web/__tests__/api-contract-suite/`)
enumerates all route contracts and asserts per contract:
- (a) malformed input → 400 VALIDATION_ERROR through the real
  `withErrorHandler(runRoute())`, handler never called;
- (b) the declared RBAC `permission` resolves to a real matrix entry (with a
  documented out-of-matrix allowlist).

Check (c) (happy-path response shape) is deferred — needs per-route mocks and is
vacuous for the 127 `response: z.unknown()` contracts; B4 surfaces that hole via
an `unknown-response` counter instead of claiming it's enforced.

Coverage is self-reported (covered / input-permissive / no-input /
unknown-response) and floor-asserted so it can't silently erode. The
malformed-input synthesizer is location-aware (query/params are always strings
at the runner). Meta-tests prove the checks can fail.

ADR-005 documents that the unit-test job is not a required status check, so this
suite is non-gating until branch protection is updated (recommendation, not
applied here).

Spec: docs/superpowers/specs/2026-06-05-b4-contract-test-harness-design.md
Plan: docs/superpowers/plans/2026-06-05-b4-contract-test-harness.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** Component 1 → Task 1; Component 2 (location-aware synth) → Task 2; check (a) → Tasks 4+6; check (b) → Tasks 3+6; coverage report incl. `unknown-response` → Task 6; meta-tests → Task 7; Component 4 (ADR) → Task 8. Deferral of (c) is encoded as the `unknown-response` counter, not a task.
- **No placeholders:** every code step is complete and runnable; the only intentional fill-in is the ADR's live `gh api` output (Task 8 Step 1 captures it) and the floor calibration (Task 6 Step 3, with an explicit procedure).
- **Type consistency:** `synthesizeRejected(schema, location)` / `SynthResult` / `InputLocation` are defined in Task 2 and consumed unchanged in Tasks 4–5; `checkRbac` / `RbacCheckResult` defined in Task 3, consumed in Task 5; `analyzeContract` / `AnalyzedContract` defined in Task 5, consumed in Tasks 6–7; `runInputCheck` / `InputCheckResult` defined in Task 4, consumed in Tasks 6–7. Names match across tasks.
