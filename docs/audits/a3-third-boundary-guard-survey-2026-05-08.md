# A3 Third Boundary Guard — Routes-Layer Survey

> **SUPERSEDED (2026-07-18):** The guard shipped as
> `scripts/verify-route-table-imports.ts` and its route-layer allowlist has been
> drained to zero — tier-C (direct table import) routes went 89 → 0, and
> route-layer `@propertypro/db/filters` importers 76 → 0. Treat the "guard not
> yet implemented / don't enable" note below as historical. See
> `docs/audits/2026-07-18-refactor-audit-and-cleanup-roadmap.md` §3 and DBB-05.

**Date**: 2026-05-08
**Author**: Claude (audit pass)
**Status**: Survey only — guard not yet implemented (superseded — see banner above)
**Scope**: Read-only investigation of `apps/web/src/app/api/**/route.ts` for direct
`@propertypro/db` imports per ADR-003. Companion to `guard:component-api-calls`
(#198) and `guard:component-service-imports` (#208).

## Headline numbers

230 total `route.ts` files under `apps/web/src/app/api/`. Three tiers:

| Tier | Count | % of 230 | Description |
|---|---|---|---|
| **A. Service-only** | 114 | 49.6% | No `@propertypro/db` import at all. Already compliant with the strictest possible rule — delegates all DB access to `@/lib/services/...` wrappers. |
| **B. Helper-only** | 27 | 11.7% | Imports only the canonical helpers: `createScopedClient`, `paginate`, `logAuditEvent`, `buildAccessibleDocumentsFilter`, presigned-URL helpers, search helpers. No table or schema-enum imports. |
| **C. Direct table/schema imports** | 89 | 38.7% | Imports at least one table reference (`communities`, `users`, etc.) or a schema enum from `@propertypro/db`. Would violate a strict "no direct table imports" rule. |

Plus crosscutting:

| Crosscut | Count | Description |
|---|---|---|
| `@propertypro/db/filters` operators | 76 | All also in tier C — every `/filters` user also imports a table (used to build `where` predicates for inline queries or paginate calls). |
| `@propertypro/db/unsafe` | 42 | `createUnscopedClient` (34), `findUserCommunitiesUnscoped`, `findCommunityBySlugUnscoped`, `getPortfolioDashboard`, `isPmAdminInAnyCommunity`. Already gated by the `guard:authz-comments` CI rule (#203) — every call site has an `// AUTHZ:` justification. |

## Top imported symbols (collapsed across multi-line imports)

From `@propertypro/db`:

| Symbol | Routes | Tier | Should the guard allow it? |
|---|---|---|---|
| `createScopedClient` | 62 | B | **Allow** — canonical scoped DB access |
| `logAuditEvent` | 31 | B | **Allow** — required for mutation audit trail |
| `communities` | 29 | C | **Restrict** — should go through a service |
| `paginate` | 13 | B | **Allow** — Plan A2/B3 canonical pagination |
| `users` | 12 | C | **Restrict** — should go through a service |
| `createPresignedDownloadUrl` | 9 | B | **Allow** — canonical storage helper |
| `userRoles` | 8 | C | **Restrict** |
| `documents` | 8 | C | **Restrict** |
| `units` | 5 | C | **Restrict** |
| `documentDrafts` | 5 | C | **Restrict** |
| `accountDeletionRequests` | 5 | C | **Restrict** |
| `accessPlans` | 5 | C | **Restrict** |
| `pendingSignups` | 4 | C | **Restrict** |
| `meetings` | 4 | C | **Restrict** |
| `faqs` | 4 | C | **Restrict** |
| `documentCategories` | 4 | C | **Restrict** |
| `demoInstances` | 4 | C | **Restrict** |
| `communityJoinRequests` | 4 | C | **Restrict** |
| `billingGroups` | 4 | C | **Restrict** |
| (~20 more tables with 1-3 imports each) | | C | **Restrict** |

From `@propertypro/db/filters`:

| Operator | Imports |
|---|---|
| `eq` | 70 |
| `and` | 35 |
| `isNull` | 19 |
| `inArray` | 11 |
| `desc` | 7 |
| `sql` | 6 |
| `lt` | 5 |
| `gte` | 3 |
| `gt` | 3 |
| `lte`, `isNotNull`, `asc`, `or`, `ne`, `ilike` | 1-2 each |

## Proposed third boundary guard rule

**Rule**: Routes under `apps/web/src/app/api/**/route.ts` may import from
`@propertypro/db`, but only the following symbols are allowed:

### Allowed (canonical DB-layer surface)

- `createScopedClient` — tenant-scoped DB access. Required for any DB op.
- `paginate` — Plan A2/B3 canonical pagination helper.
- `logAuditEvent` — mutation audit trail.
- `createPresignedDownloadUrl`, `createPresignedUploadUrl`, `deleteStorageObject` — storage helpers.
- Search helpers: `searchDocuments`, `searchUsersByTrigram`,
  `searchResidentsByTrigram`, `searchViolationsByTrigram`,
  `searchMeetingsByTrigram`, `searchMaintenanceByTrigram`.
- Notification query helpers: `markNotificationsRead`,
  `archiveNotifications`, `countUnreadNotifications`.
- Document access helpers: `buildAccessibleDocumentsFilter`,
  `buildDocumentAccessFilter`, `getAccessibleDocuments`,
  `getDocumentWithAccessCheck`, `isDocumentAccessible`.
- Type-only imports (`import type {...}`) — always allowed (no runtime cost,
  cross-cutting types like `WorkOrderStatus` are needed for narrow filter
  param typing).

### Restricted (would need a service wrapper)

- All table references: `communities`, `users`, `documents`,
  `documentCategories`, `userRoles`, `units`, `meetings`, etc.
- Schema enum value-imports (rare — most schema enums are also re-exported
  via type-only imports, which stay allowed).

### Filters operators (`@propertypro/db/filters`)

**Allow blanket** for now. 76/89 tier-C routes also use `/filters` to build
`where` predicates for `paginate()` or inline queries. Rejecting `/filters`
would force a service wrapper around every table/operator combination — a
much larger migration than necessary.

A future tightening could require operators ONLY when used in a
`paginate(scoped, allowedHelperTable, ..., { where: ... })` call. Hard to
detect statically without an AST parser. Not worth chasing in v1.

### Unsafe imports (`@propertypro/db/unsafe`)

Already gated by `guard:authz-comments` (#203). No change needed in this
guard — leave the existing `// AUTHZ: ...` requirement in place.

## Estimated migration cost

- **Tier A (114 routes)**: zero work. Already compliant.
- **Tier B (27 routes)**: zero work. Already compliant under the proposed rule.
- **Tier C (89 routes)**: each route needs one of:
  1. **Existing service wrapper** — for tables that already have a service
     (e.g. `apps/web/src/lib/services/work-orders-service.ts`,
     `package-visitor-service.ts`, `finance-service.ts`). Just refactor the
     route to call the wrapper instead of inlining the query.
  2. **New service wrapper** — for tables that don't yet have one (some
     admin/billing/internal routes).
  3. **Grandfather** — for routes where extracting a service is high-cost
     and low-leverage (one-off internal cron endpoints, etc.).

A reasonable v1 ships: enable the guard with a `KNOWN_DIRECT_TABLE_IMPORT_FILES`
allowlist of all 89 tier-C routes. Drain progressively (the same pattern as
`guard:component-api-calls`'s `KNOWN_DIRECT_API_CALL_FILES`). Estimated
session cost: 30-60 routes per session × 2-3 sessions to drain.

## Spot-check: tier-C examples

- `v1/violations/route.ts` — uses paginate but also imports
  `violations` table directly. Could go through a thin service wrapper
  (`listViolationsForPage(...)`).
- `v1/communities/delete/route.ts` — imports `communities` for one-off
  ownership check. Easy candidate for a `getCommunity(id)` service helper.
- `v1/admin/access-plans/community/[id]/route.ts` — imports
  `accessPlans` for admin operations. Service exists at
  `apps/admin/src/lib/services/access-plans-service.ts` — refactor to use it.

## Recommended next steps

1. **Don't enable the guard yet** — current state has 89 violators, and
   shipping the guard with that big an allowlist creates the same noise the
   `KNOWN_DIRECT_API_CALL_FILES` allowlist had to deal with.
2. **Phase 1 (1 PR)**: Ship `scripts/verify-route-table-imports.ts` with the
   89-route allowlist. Add to `pnpm lint`. Becomes the floor: no NEW route
   may import a table without an explicit allowlist entry.
3. **Phase 2 (2-3 PRs)**: Drain the 89 routes by extracting service
   wrappers for the most-imported tables (`communities`, `users`,
   `documents`, `userRoles`, `units` cover ~62 of the 89). Each PR drops
   files from the allowlist as their service wrappers land.
4. **Phase 3**: Tighten as needed (e.g. require `/filters` operators only
   in paginate-where contexts) once the bulk migration is done.

## Alternative: incremental grandfathering

If shipping the guard with an 89-route allowlist feels too noisy, a softer
approach: enable the guard with a 0-route allowlist but add a CI warning
(not error) for now. After 2-3 weeks, flip to error. Lets the team see the
violation count drift in CI over time before enforcement.

## Open questions for plan owner

1. **Schema enum value-imports** — for example, `WorkOrderStatus` is both
   a TypeScript type and a runtime enum constant. Type-only imports stay
   allowed; should value-imports of these enums also stay allowed? They
   often serve as Zod schema sources (`z.enum(['low', 'normal', 'high'])`
   is hand-written rather than generated from the schema, so they don't
   actually need a value-import in practice).
2. **Plan A1 interaction** — A1 (route contract registry, paused) would
   require routes to declare a Zod request+response schema. If A1 lands,
   the guard could become "every route must export a `contract` constant"
   which subsumes the table-import question. Defer A3 phase 2/3 until A1's
   resume conditions fire?
3. **Cron + internal routes** — `v1/internal/...` and `v1/webhooks/...` are
   special cases (no user-facing semantics, often need broader DB access).
   Should they stay grandfathered indefinitely or get their own service
   wrappers like everything else?

## Related work

- `guard:component-api-calls` (#198) — first boundary guard. Components
  can't fetch `/api/v1/*` directly. 58 grandfathered files; 90 known
  direct fetches as of 2026-05-08. Drain progressively.
- `guard:component-service-imports` (#208) — second boundary guard.
  Components can `import type` from `@/lib/<domain>/services/*` but cannot
  value-import. Clean enforcement.
- ADR-003 (`docs/adr/ADR-003-layering-and-import-boundaries.md`) — defines
  the three-layer model (route → service → DB).
