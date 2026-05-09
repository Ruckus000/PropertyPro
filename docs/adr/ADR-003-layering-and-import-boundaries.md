# ADR-003: Layering and Import Boundaries

- Status: Accepted
- Date: May 6, 2026
- Deciders: Engineering Lead
- Scope: How code is organized across `apps/web/`; what each layer may and may not import

## Context

PropertyPro has grown to ~227 API routes, ~330 components, ~30 hooks, and ~80 schema modules. The platform-axis foundations (tenant isolation, RBAC matrix, scoped DB access, audit log, soft-delete discipline) are strong and CI-enforced. The convention-axis is starting to fragment: equivalent operations are sometimes implemented at the route layer, sometimes via a service module, sometimes inline in a component.

Concrete drift observed during the 2026-05-06 architectural audit:

- 57 of 330 components call `fetch('/api/v1/...')` directly, bypassing the hook layer (and therefore TanStack Query's caching, retry, and invalidation).
- 15 of 30 hooks use raw `fetch` instead of the canonical `requestJson` helper at [apps/web/src/lib/request/](apps/web/src/lib/request/).
- Some domains have a `lib/<domain>/` service module; others inline queries in `route.ts`; others put queries in `packages/db/src/queries/`. No rule says which to use.
- Components occasionally import from service modules. In every audited case the import was a `import type { … }` (safe), but the convention is not codified.

This ADR codifies the canonical layering so the codebase converges over time, and identifies the import boundaries we will enforce mechanically.

## Decision

### Canonical layering for `apps/web/`

```
┌──────────────────────────────────────────────────────────┐
│  Server-rendered pages   apps/web/src/app/**/page.tsx    │
│  Client containers       apps/web/src/app/**/*-client.tsx│
│         │           │                                     │
│         │           ▼                                     │
│         │   Components (presentational)                   │
│         │   apps/web/src/components/**                    │
│         │           │                                     │
│         ▼           ▼                                     │
│  Hooks   apps/web/src/hooks/**     ← only place           │
│         │                            that fetches          │
│         ▼                            /api/v1/* from        │
│  HTTP boundary  /api/v1/*            the client side       │
│         │                                                  │
│         ▼                                                  │
│  Route handlers   apps/web/src/app/api/**/route.ts        │
│         │                                                  │
│         ▼                                                  │
│  Services   apps/web/src/lib/<domain>/                    │
│  (business logic, multi-step orchestration, transactions)  │
│         │                                                  │
│         ▼                                                  │
│  Queries   packages/db/src/queries/  +                    │
│            scoped client (`createScopedClient`)           │
│         │                                                  │
│         ▼                                                  │
│  PostgreSQL (RLS-enforced, tenant-scoped)                 │
└──────────────────────────────────────────────────────────┘
```

### Layer responsibilities

**Pages and components.** Render UI. Resolve permissions and tenant context server-side via `requirePageCommunityMembership` for server pages. Read data via hooks (client) or via direct service calls (server only). Components are prop-driven; they do not own data fetching for `/api/v1/*` endpoints.

**Hooks.** The single entry point to `/api/v1/*` from the client. Use TanStack Query plus the `requestJson` helper. Own query keys, cache invalidation, retry, and error normalization. New hooks must use `requestJson`; raw `fetch` is grandfathered only.

**Route handlers.** Validate input with Zod, check permission via `requirePermission`, optionally enforce community membership / plan / demo gates, then delegate to a service or use the scoped client directly for trivial reads. Handlers are thin: schema → permission → service → envelope. Multi-step business logic does not live here.

**Services (`lib/<domain>/`).** Business logic, multi-step orchestration, transactions, audit logging, side effects (notifications, emails). One service module per domain. Services may use the scoped client and/or call into shared queries in `packages/db/src/queries/`.

**Queries (`packages/db/src/queries/`).** Reusable cross-domain query functions. Optional — most reads can stay inline in services. Use this layer only when the same query is needed by ≥2 services.

**Scoped client (`@propertypro/db`, `createScopedClient`).** The only sanctioned way to talk to the tenant-scoped DB. Auto-injects `community_id` and `deletedAt IS NULL`. Already enforced by [`scripts/verify-scoped-db-access.ts`](scripts/verify-scoped-db-access.ts).

### Import boundaries (mechanically enforced)

| Layer | May import from | Must NOT import from |
| --- | --- | --- |
| **Components** (`apps/web/src/components/**/*.tsx`) | Hooks; UI primitives; types from services (`import type`) | Service runtime code; `@propertypro/db`; direct `fetch('/api/v1/*')` |
| **Hooks** (`apps/web/src/hooks/**`) | `requestJson`, generated client types, types from services | Service runtime code; `@propertypro/db`; drizzle ops |
| **Route handlers** (`apps/web/src/app/api/**/route.ts`) | `lib/<domain>/`, `lib/api/**`, scoped client, `@propertypro/db/filters`, RBAC matrix | Drizzle operators directly (must use `@propertypro/db/filters`) |
| **Services** (`apps/web/src/lib/<domain>/`) | Scoped client, `@propertypro/db/filters`, queries package, other services in same domain | Hooks, components, drizzle ops directly |

### Mechanically enforced today (this ADR's scope)

- ✅ **DB access guard** ([`scripts/verify-scoped-db-access.ts`](scripts/verify-scoped-db-access.ts)) — already in `pnpm lint`. Routes/services may not import drizzle ops directly; must use `@propertypro/db/filters`. Unsafe DB access is allowlisted with documented per-file rationale.
- ✅ **Migration journal guard** ([`scripts/verify-migration-ordering.ts`](scripts/verify-migration-ordering.ts)) — strengthened 2026-05-06 to flag any orphan SQL files.
- 🆕 **Component-API-call guard** ([`scripts/verify-component-api-calls.ts`](scripts/verify-component-api-calls.ts), this ADR) — components and pages may not call `fetch('/api/v1/*')` directly. The 57 historical violators are grandfathered into a `KNOWN_DIRECT_API_CALL_FILES` allowlist; new violators fail CI.
- 🆕 **Component → service boundary guard** ([`scripts/verify-component-service-imports.ts`](scripts/verify-component-service-imports.ts)) — components under `apps/web/src/components/**` may not value-import from `@/lib/<domain>/services/*` (or `@/lib/<domain>/<x>-service`). `import type` is allowed (types erase at build). Server components / page files / route handlers are out of scope — they may legitimately call services. Current state is clean (0 violations); guard is preventive.

### Not yet enforced (future work)

These rules are policy from this ADR forward but not yet CI-enforced. Will be folded into the foundation tracks A1 (route contract registry) and A2 (pagination contract):

- Route handlers must export a `contract` constant (Zod request + response schema, declared permission, paginated flag).
- Hooks must use generated client types from the contract registry, not hand-written response types.
- List endpoints must paginate via the canonical helper and return the double-wrapped envelope `{ data: { data: T[], pagination } }` (route side) so that `requestJson<{data, pagination}>` unwraps the outer `data` field on the consumer side. See `.claude/rules/api-patterns.md` for the full route shape + filter pushdown + test mock patterns.
- New hooks must use `requestJson` (current adoption: ~50% of hooks).

## Decision Drivers

- **Mechanism over guidance.** A rule documented in CLAUDE.md without enforcement decays. Every rule in the "enforced today" section above has a CI check.
- **No big-bang refactors.** The 57 components calling `/api/v1/*` directly are not rewritten as part of this ADR. Existing code is grandfathered; new code is held to the rule.
- **Preserve invariants.** Tenant isolation, RBAC matrix, audit log, append-only tables, soft-delete — none of these are touched.
- **Boring is the goal.** Adding a new resource should feel mechanical: schema → service → route → hook → page. No fresh layering decisions per feature.

## Consequences

### Positive

- New code converges on a single shape; reviewers can flag deviation by pointing to this ADR.
- Direct `fetch('/api/v1/*')` calls from components are blocked at CI for new files. The 57 existing call sites become a visible debt ledger that drains over time as features touch those files.
- The ADR creates a stable target for the foundation tracks (A1 contract registry, A2 pagination, A4 resource generator) to build on.

### Negative / accepted

- Existing drift is not automatically fixed. The 57 grandfathered components still bypass hooks; cache and retry behavior remain inconsistent until they are migrated.
- Type-only imports of service shapes from components are permitted today. If we later extract API request/response types to a shared package (per A1), services should stop being the type source.

## References

- Architectural standardization plan: `~/.claude/plans/draft-a-plan-that-reflective-pie.md`.
- Tenant isolation rule: [`.claude/rules/tenant-isolation.md`](.claude/rules/tenant-isolation.md).
- Migration safety rule: [`.claude/rules/migration-safety.md`](.claude/rules/migration-safety.md).
- API patterns rule: [`.claude/rules/api-patterns.md`](.claude/rules/api-patterns.md).
- DB access guard: [`scripts/verify-scoped-db-access.ts`](scripts/verify-scoped-db-access.ts).
- Migration ordering guard: [`scripts/verify-migration-ordering.ts`](scripts/verify-migration-ordering.ts).
