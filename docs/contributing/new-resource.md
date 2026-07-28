# Adding a New Resource

`pnpm new:resource <plural-name>` scaffolds the canonical CRUD slice for a new
tenant-scoped resource. It is the boring path — use it for every new resource
unless you have a specific reason not to. (See "When NOT to use the scaffolder"
below.)

> **Plan reference:** Architectural Standardization Plan § A4. The scaffolder
> exists so "which pattern do I follow?" stops being the most common
> new-engineer question.

## One-command flow

```bash
pnpm new:resource gadgets
```

That command produces a working list endpoint, hook, and pages — typecheck +
lint + unit tests all pass with **no manual edits required**. The acceptance
gate for this scaffolder is exactly that. The scaffolder generates a list
endpoint (`GET /api/v1/<plural>`) plus stub pages; it does not generate Create,
Update, or Delete handlers (add those by hand once you know your resource's
shape).

The generator writes:

```
packages/db/src/schema/<plural>.ts
apps/web/src/lib/services/<plural>-service.ts
apps/web/src/app/api/v1/<plural>/contract.ts
apps/web/src/app/api/v1/<plural>/route.ts                     (runRoute-wrapped)
apps/web/src/hooks/use<PluralPascal>.ts
apps/web/src/app/(authenticated)/<plural>/page.tsx
apps/web/src/app/(authenticated)/<plural>/<plural>-list.tsx
apps/web/src/app/(authenticated)/<plural>/[id]/page.tsx
apps/web/__tests__/api/<plural>/route.test.ts
apps/web/__tests__/integration/<plural>.integration.test.ts
```

It also appends a re-export to `packages/db/src/schema/index.ts`.

### It does not write the migration

The scaffolder deliberately writes **nothing** under `packages/db/migrations/` —
no `.sql`, no journal entry, no snapshot. Generate the migration yourself once
the schema columns are right:

```bash
pnpm --filter @propertypro/db db:generate --name create_<plural>
```

That writes the `.sql`, the journal entry **and** the snapshot together, which is
the only way they stay consistent. It used to append a journal entry, which was
wrong twice over: an entry with no matching `meta/NNNN_snapshot.json` fails
`checkSnapshotChainIntact`, so every scaffold run left `migration-ordering` red;
and a hand-written `CREATE TABLE` could drift from `packages/db/src/schema/`,
which is what drizzle actually diffs — so the next `db:generate` would emit a
second migration re-creating the same table.

Then **append the RLS block** the scaffolder prints to the generated `.sql`.
drizzle emits the table and the FK, but never `ENABLE`/`FORCE ROW LEVEL
SECURITY`, the four baseline policies, or the `pp_rls_enforce_tenant_scope`
trigger — those are this repo's convention. The canonical template lives at
`scripts/scaffold-resource.test/fixtures/rls-block.sql`.

## Plural / singular conventions

The argument is the **plural lowercase kebab-case name**:

| Good | Bad |
|---|---|
| `widgets` | `Widgets` |
| `document-categories` | `DocumentCategories` |
| `work-orders` | `work_orders` |

The scaffolder derives the singular by dropping the trailing `s`. For
irregular plurals, pass `--singular`:

```bash
pnpm new:resource categories --singular category
pnpm new:resource people --singular person
```

## What you MUST do after running the scaffolder

These are policy decisions the scaffolder deliberately does not make for you.
They are NOT optional — the resource will work end-to-end without them, but
permissions will be wrong.

### 1. Wire the RBAC matrix (`packages/shared/src/rbac-matrix.ts`)

Add your resource to `RBAC_RESOURCES`:

```ts
export const RBAC_RESOURCES = [
  'documents',
  // ...
  'gadgets',   // ← your new resource
] as const;
```

Then fill in the matrix cells across community types and roles. The `satisfies`
operator on `RBAC_MATRIX` enforces exhaustiveness — TypeScript will refuse to
compile until every cell is set.

### 2. Replace the placeholder permission on the contract

The scaffolded `contract.ts` ships with:

```ts
permission: { resource: 'documents', action: 'read' }
```

This is a placeholder so the file type-checks against the existing
`RBAC_RESOURCES` tuple before your resource is added. Once step 1 is done,
swap to your real resource:

```ts
permission: { resource: 'gadgets', action: 'read' }
```

The contract runner does not enforce permissions today — they are metadata for
future codegen / docs — but the route handler should call `requirePermission`
explicitly when you add write operations.

### 3. Customize columns

The scaffolded schema (`packages/db/src/schema/<plural>.ts`) is the canonical
shape: `id`, `community_id`, `name`, `description`, `created_at`, `updated_at`,
`deleted_at`. Add or remove columns to match your resource, then update the
matching `CREATE TABLE` in the migration SQL.

The scaffolded migration includes baseline RLS policies (SELECT for any
community member; INSERT/UPDATE/DELETE restricted to privileged roles — board
/ cam / pm_admin) and the `pp_rls_enforce_tenant_scope` trigger. Tighten or
loosen the policies to match your resource's access rules.

### 4. Apply the migration and verify

Apply it to the **disposable local database**, never to production:

```bash
pnpm db:test-local:setup
pnpm typecheck
pnpm lint
pnpm test
```

> **⚠️ Do not run `pnpm --filter @propertypro/db db:migrate` here.**
>
> `.env.local`'s `DATABASE_URL` points at **production**, so that command
> applies your freshly-scaffolded table to the live database.
>
> This is not hypothetical. A stray `widgets` table — this guide's own example
> resource — reached production exactly this way and sat there unnoticed,
> recorded in *neither* migration ledger, until it was found by diffing prod
> against the migrations. It was removed in migration `0036`.
>
> Production migrations are applied **deliberately and manually** via the
> Supabase MCP, then verified against `information_schema` and recorded in the
> drizzle ledger. See [`.claude/rules/migration-safety.md`](../../.claude/rules/migration-safety.md).

## Why option (b): the scaffolder does not auto-edit RBAC

We considered having the scaffolder write a "sensible default" `RBAC_RESOURCES`
entry and matrix row. We rejected it: RBAC defaults are policy decisions
(should `tenants` read `gadgets`? should `cam` write?), and a wrong default in
this file silently grants or denies access. A loud "next step — add this by
hand" is harder to ignore than a quiet auto-edit. If the scaffolder grew a
flag like `--rbac=admin-only` in the future, that would be a separate PR with
its own design.

## When NOT to use the scaffolder

The scaffolder is the boring path. Some resources don't fit:

- **Cross-tenant tables.** Anything in `packages/db/src/schema/` that is NOT
  community-scoped (e.g. `users`, `communities`, `platform_admin_users`,
  `stripe_prices`). The scaffolder bakes in `community_id` + RLS — use a
  hand-written schema instead.
- **Non-CRUD resources.** Event streams, webhook endpoints, cron entry points.
  The scaffolder emits a paginated GET; if that's not your shape, write it
  from scratch.
- **Resources sharing a route prefix.** If you need
  `/api/v1/elections/[id]/proxies/[proxyId]/...`, scaffold the parent
  (`elections`), then hand-author the nested routes.
- **Resources with non-id sort keys** (announcements `is_pinned`/`published_at`,
  reservations `start_time`, etc.). The scaffolded list uses `paginate()` on
  `id desc`. See `docs/audits/b3-hard-tier-pagination-design-2026-05-11.md`
  before building anything with a non-id user-visible sort order.

## Where the templates live

The scaffolder's output is byte-identical to the golden fixtures at
`scripts/scaffold-resource.test/fixtures/widgets/`. Those fixtures double as
documentation — read them to see exactly what code the scaffolder emits.

`scripts/__tests__/scaffold-resource.test.ts` diffs scaffolder output against
those fixtures on every CI run, so template drift is caught immediately.

## Related references

- `~/.claude/plans/draft-a-plan-that-reflective-pie.md` § A4 — the spec this
  scaffolder implements.
- `.claude/rules/tenant-isolation.md` — scoped DB access rules.
- `.claude/rules/migration-safety.md` — migration numbering + journal rules.
- `.claude/rules/api-patterns.md` — canonical envelope, pagination, validation
  conventions.
- `.claude/rules/design.md` — PageHeader / Breadcrumbs requirements.
- `packages/api-contract/src/index.ts` — `defineRoute` / `runRoute` /
  `Infer<typeof contract>` public surface (Plan A1).
- `apps/web/src/app/api/v1/document-categories/{contract.ts,route.ts}` — the
  in-tree pilot from #405 that this scaffolder generalizes.
