# B4 — Auto-generated contract tests (parameterized harness)

**Date:** 2026-06-05
**Plan:** `~/.claude/plans/draft-a-plan-that-reflective-pie.md` § B4 (the last net-new lane; B6 + B2 merged 2026-06-05)
**Status:** Design approved; ready for implementation plan.

## Problem

A1 shipped a route-contract registry (`@propertypro/api-contract`): ~206 `route.ts`
files wrap their handler in `runRoute(contract, handler)`, with the contract
declared in a sibling `contract.ts` (286 named `*Contract` exports). The contract
carries request/response Zod schemas plus `permission: { resource, action }`
metadata. Nothing today asserts, per route, that:

- **(a)** malformed input is actually rejected with a `ValidationError`/400, and
- **(b)** the declared `permission` corresponds to a real RBAC matrix entry.

These are exactly the regressions a generic, mock-free test can catch cheaply —
"~80% of regressions, cheaper than full integration tests" per the plan. They
currently rely on each route's hand-written tests, which are uneven.

## Goal

A single **parameterized** test harness that enumerates every contract and runs
checks (a) and (b) over each, plus a short ADR recording a branch-protection
finding. No per-route generated files.

## Non-goals

- **Check (c) happy-path response-shape validation is deferred.** It genuinely
  requires per-route DB/service mocks (the handler must run and return a payload),
  which a generic harness cannot synthesize without reinventing integration
  tests. It is *partially* covered at runtime by `runRoute`'s `buildResponse`
  (response-schema mismatch → `ContractValidationError(source: 'response')` → 500
  "envelope drift canary"), and by hand-written route tests. **Important caveat
  (verification finding):** that canary is **blind for the 127 contracts whose
  `response` is `z.unknown()`/`z.any()`** — `z.unknown().safeParse(x)` always
  passes, so ~44% of routes have no response-shape enforcement at all. B4 does not
  close that hole; it only makes it **visible** via the `unknown-response` counter
  in the coverage report (Component 3). Tightening those 127 schemas is a separate
  follow-up, out of B4 scope.
- No codegen of `.test.ts` files. No OpenAPI work. No changes to route handlers,
  contracts, the RBAC matrix, or the runner.
- The harness does **not** mutate GitHub branch-protection settings — see
  Component 4.

## Key facts established during design

- **All 286 contracts live in 206 side-effect-free `contract.ts` files** that
  import only `@propertypro/api-contract`, `@propertypro/shared`, `zod`, and (in
  3 files) pure-schema helpers (`@/lib/auth/signup-schema`, `@propertypro/theme`,
  a sibling `../contract`). None pull Next.js / service / DB code, so
  glob-importing them all in a plain unit test is cheap and side-effect-free.
- **The runner validates input before the handler** (`run-route.ts`): bad
  params/query/body → `ContractValidationError` → `withErrorHandler` → 400,
  *before* any auth/DB. So check (a) needs **no auth/DB mocking**.
- **`withErrorHandler` maps `ContractValidationError`**: `source` of
  params/query/body → 400 `VALIDATION_ERROR` with `details.fields`; `source:
  'response'` → 500 `INTERNAL_ERROR`.
- **RBAC matrix** (`packages/shared/src/rbac-matrix.ts`): `RBAC_RESOURCES` (23
  resources) × `RBAC_ACTIONS` (`read`, `write`). Distinct `permission.resource`
  values used in contracts that are **not** in `RBAC_RESOURCES`: `communities`
  (PM cross-community), `move_checklists`, `leases` (apartment feature-gate —
  intentionally out of matrix per the matrix's own docblock), `help` (public),
  `billing_groups`. The only non-`read`/`write` action is `move_checklists:update`.
  19 contract files declare no `permission` at all (token-auth/admin/public).
- The unit-test job runs `apps/web` vitest (`vitest.config.ts`, `include:
  ['src/**/*.test.{ts,tsx}', '__tests__/**/*.test.{ts,tsx}']`, jsdom, no DB).

## Architecture

```
apps/web/__tests__/api-contract-suite/      # NOT __tests__/contracts/ — that dir
  contract-registry.ts            #   already holds the vendor-contracts DOMAIN
  malformed-input.ts              #   feature tests (contracts-route.test.ts etc.)
  contract-suite.test.ts          # describe.each → checks (a) + (b) + coverage report
  contract-suite-meta.test.ts     # negative controls (prove the checks can fail)
docs/adr/
  ADR-005-required-status-checks.md
```

> **Naming note (verification finding):** `apps/web/__tests__/contracts/` is
> already taken by the vendor-contracts domain feature
> (`contracts-route.test.ts`, `contract-form.test.tsx`, `contract-table.test.tsx`
> — all about `/api/v1/contracts` the *resource*). The B4 harness uses a distinct
> directory (`api-contract-suite/`) to avoid conceptual collision with that
> domain.

Everything runs in the existing unit-test CI job. No new CI job, no new guard
script, no generated files.

### Component 1 — Contract enumeration (`contract-registry.ts`)

- `import.meta.glob('../../src/app/api/**/contract.ts', { eager: true })` (Vite
  feature available in vitest) returns every contract module.
- For each module, iterate own exports; keep values that are RouteContract-shaped:
  a non-null object with string `method` (in the `HttpMethod` set), string
  `path`, an object `request`, and a `response` that looks like a Zod schema
  (`typeof .safeParse === 'function'`). This naturally excludes type-only
  re-exports, item schemas, and helper consts.
- Returns `RegisteredContract[] = { file, exportName, contract }`. Expected ~286.
- **Sanity assertion in the suite:** registry length is non-zero and ≥ a floor
  (e.g. 200) so a glob/resolution regression that silently finds nothing fails
  loudly instead of vacuously passing.
- **De-risk step — DONE (spike, 2026-06-05).** A throwaway spike test confirmed
  empirically: `import.meta.glob('../src/app/api/**/contract.ts', { eager: true })`
  enumerated **285 contracts** under the real `apps/web` vitest config (after
  `pnpm turbo run build --filter='./packages/*'`). The committed-barrel fallback
  is therefore **not needed**. (285 vs. the ~286 grep count: the grep counts
  `export const *Contract` text; the registry keeps only values that are actually
  RouteContract-shaped at runtime — a one-off non-contract export accounts for
  the difference. The ≥200 floor assertion covers this comfortably.)

### Component 2 — Malformed-input synthesis (`malformed-input.ts`)

Pure helper, independently unit-tested. Given a Zod schema **and the input
location**, return either a value the schema **provably rejects** *via a payload
the runner can actually deliver*, or a signal that the schema is permissive.

```
synthesizeRejected(schema, location: 'params' | 'query' | 'body')
  : { ok: true; value: unknown } | { ok: false; reason: 'permissive' }
```

**Location-awareness is mandatory (verification finding 2026-06-05).** The runner
builds `query` and `params` from `URLSearchParams` / path segments, so every value
those schemas ever see is a **string** (or absent). A naive non-string probe
produces a *false* result: e.g. for `z.string().min(1)`, `safeParse({ tag: 123 })`
fails (probe "succeeds") but the reachable input `{ tag: '123' }` **passes** — so
we'd assert a 400 on an input the route can never receive while the real input
sails through. Empirically confirmed. Therefore:

- **Candidate set is location-scoped.** `body`: `[null, 123, '∅invalid∅', [], {}]`
  (JSON values — body is `req.json()`). `query` / `params`: **strings or
  omitted only** — `['∅invalid∅', '', <omit the key>]` (never a non-string).
- A field whose **string** candidates all pass (a plain `z.string()` query field
  that accepts any non-empty string) makes that location **string-permissive** →
  classified `permissive`, **not** "covered". This is the honest classification
  the naive probe got wrong.

Algorithm (per location):
1. If the schema is not an introspectable object (`z.unknown()`, `z.any()`, bare
   scalar), try the location-scoped candidate list; return the first the schema
   rejects; if none reject → `permissive`.
2. If it is a `ZodObject`, read `.shape`; for each field probe with the
   location-scoped candidates to find a per-field rejected value; assemble an
   object setting at least one required/constrained field to a rejected value.
   Verify the **whole** schema rejects it via `safeParse` before returning. If no
   field can be broken with location-legal values → `permissive`.

The helper always self-verifies (`safeParse(result).success === false`) so check
(a) never asserts on an unverified "bad" value.

### Component 3 — The suite (`contract-suite.test.ts`)

`describe.each(registry)` — one `describe` block per registered contract, labelled
`${method} ${path} (${exportName})`.

**Check (a) — malformed input → 400, end-to-end.** For each request location the
runner validates *for that contract's method* (`params` if declared; `query` if
declared; `body` only when method ≠ GET and body declared):
- `synthesizeRejected(schema, location)` — **location passed** so query/params
  get string-only candidates (Component 2).
- If `permissive` or the contract declares no validated input for any location →
  record the contract under `input-permissive`/`no-input` and skip the 400
  assertion for that location (no silent omission — counted in the coverage
  report).
- Else build a `NextRequest` carrying the malformed value (query → URL search
  params; body → JSON; params → `ctx.params` Promise per Next 15), wrap
  `withErrorHandler(runRoute(contract, spyHandler, options))`, invoke, and assert:
  - HTTP status **400**,
  - JSON `error.code === 'VALIDATION_ERROR'`,
  - `spyHandler` was **never called** (validation precedes the handler).
  - `options.resolveCommunityId` is a stub (only reached *after* validation, so
    irrelevant to the malformed-input path; provided so tenant-scoped contracts
    don't throw the "no resolver" error if a future change reorders things).

**Check (b) — RBAC entry exists.** Static, no request:
- No `permission` → record `inapplicable`.
- Has `permission` → pass if `RBAC_RESOURCES.includes(resource) &&
  RBAC_ACTIONS.includes(action)`, **or** `(resource, action)` ∈
  `KNOWN_NON_MATRIX_PERMISSIONS` (documented allowlist: the 5 out-of-matrix
  resources, with `move_checklists` allowing `update`). Otherwise **fail** with a
  message naming the contract, resource, and action.

> **What (b) is and is NOT (verification finding — do not over-sell this).** The
> contract's `permission` is `{ resource: string; action: string }` *decorative
> metadata*; the runner does not enforce it. The **actual** enforcement is
> `requirePermission(membership, resource: RbacResource, action: RbacAction)`
> (`apps/web/src/lib/db/access-control.ts:76`), whose parameters are already
> typed to the matrix — so the compiler *already* guarantees matrix-validity at
> the real enforcement site. Several out-of-matrix routes (`help/article`,
> `communities/cancel`, …) don't call `requirePermission` at all. Therefore (b)
> is a **metadata-integrity** check (keeps the label honest for future
> OpenAPI/docs codegen; catches a brand-new resource forgotten in the matrix or a
> typo'd `resource`) — **not** an authorization safeguard, and it covers ~34
> contracts only by allowlist rubber-stamp. (b) **cannot** detect the
> higher-value bug — the contract's label disagreeing with the handler's actual
> `requirePermission(...)` call — because it never reads `route.ts`. That
> label↔enforcement cross-check would need route-AST parsing and multi-method
> disambiguation; **deferred as YAGNI**, explicitly out of B4 scope.

**Coverage report.** A final `afterAll`/summary `test` logs and asserts these
counts so coverage is visible and can't silently erode:
- `covered` — got a real end-to-end (a) 400 assertion.
- `input-permissive` — schema accepts all location-legal inputs (incl. the
  string-permissive query/params case above).
- `no-input` — contract declares no validated `params`/`query`/`body`.
- `rbac-checked` / `rbac-inapplicable` (no `permission`) / `rbac-allowlisted`
  (out-of-matrix, see check (b)).
- `unknown-response` — contracts with `response: z.unknown()`/`z.any()`. Pure
  tracked-debt signal (see (c) note); **logged, not asserted** — these are the
  routes the runtime `buildResponse` canary is blind to.

Assert `covered ≥ floor` (candidate `≥ 180`). **Honest-numbers caveat:** the only
measured baseline so far (285 / 265-coverable) used a *non-location-aware* probe
and is therefore **optimistic** — the string-aware synthesizer will reclassify
some of the 75 query-bearing contracts as `input-permissive`. The real floor is
set from the first run of the location-aware suite, not from 265.

### Component 4 — Branch-protection audit + ADR

- `gh api repos/Ruckus000/PropertyPro/branches/main/protection` (and
  `/required_status_checks`) to read which checks are required.
- Confirm the memory finding: `integration-tests` + `perf-check` are **not**
  required (only Lint/guards/verify-scoped-db-access/branch-freshness gate; the
  full Build/Unit/integration suite is not required — which is why B6/B2
  auto-merge fired in ~30s).
- Write `docs/adr/ADR-005-required-status-checks.md`: the finding, the risk (this
  new B4 suite runs in the unit-test job, which is *also* not a required check, so
  it would not gate a merge until branch-protection is updated), and a
  recommendation to add `Unit Tests` (and ideally `integration-tests` /
  `perf-check`) to the required set.
- **Document-only.** Changing GitHub branch-protection is an outward-facing
  repo-admin action; the ADR flags it for the maintainer to apply. The harness PR
  does not flip the setting.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `import.meta.glob` doesn't resolve in this vitest setup | **RESOLVED by spike (2026-06-05): enumerated 285 contracts.** Fallback not needed. |
| A `permissive` schema (e.g. `z.unknown()` request) makes (a) vacuous | Synthesizer reports `permissive`; coverage report counts it; not silently skipped. |
| **Non-string probe gives false (a) coverage on query/params** (verified 2026-06-05) | Synthesizer is **location-aware** (Component 2): query/params get string-only candidates; string-permissive fields are classified `permissive`, not "covered". |
| Check (b) over-sold as authz enforcement | Spec explicitly scopes (b) to metadata-integrity; label↔enforcement cross-check deferred as YAGNI. |
| Response-shape unenforced for 127 `z.unknown()` contracts | Surfaced via `unknown-response` counter; tightening is a separate follow-up. |
| Glob-importing a contract with hidden server import → suite-load crash | Verified: all 206 contract.ts import only pure-schema modules. Sanity floor assertion catches a future regression. |
| Checks pass vacuously (registry empty, every contract permissive) | Registry-floor assertion + coverage-floor assertion + meta-tests (negative controls). |
| Suite is green but doesn't gate merges | ADR-005 surfaces the branch-protection gap explicitly. |
| Next 15 params-as-Promise shape | Build `ctx.params` as a resolved Promise, matching `run-route.ts`'s `parseParams`. |

## Testing

- The harness is the test. Add `contract-suite-meta.test.ts` negative controls:
  a throwaway contract with a bad RBAC resource (check (b) must fail) and an
  input-permissive contract (must classify as `permissive`, not falsely "covered"),
  asserted via the extracted check functions so we prove they can fail.
- Unit-test `malformed-input.ts` directly (object schema, scalar schema,
  all-optional schema, `z.unknown()`, coercion schema).
- Verify: direct `tsc` (turbo cache serves stale green — run the real compiler),
  `pnpm test`, `pnpm lint`. Fresh worktree needs
  `pnpm turbo run build --filter='./packages/*'` first or web tests fail to
  resolve `@propertypro/api-contract`.

## Delivery

One PR: the harness (Components 1–3 + meta-tests) + ADR-005 (Component 4). Branch
`b4/contract-test-harness` off `origin/main`. Cohesive and small; split only if
review prefers the ADR separate.
