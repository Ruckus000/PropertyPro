# ADR-002: Seed User ID Reconcile Policy

- Status: Accepted
- Date: April 19, 2026
- Owner: Ruckus000
- Attorney Review Sign-off: TBD
- Scope: Seed/demo reconciliation of `public.users.id` to Supabase auth UUIDs

## Context

Before PR #113, `ensureUser()` in `packages/db/src/seed/seed-community.ts` preserved the existing
`public.users.id` whenever it drifted from the preferred Supabase auth user id. Commit `fe0b9a02`
logged this as a debug-only warning:

`preserving existing public.users.id=...; auth user id ... differs and automatic churn is disabled`

That behavior avoided ID churn during demo reseeds, but it allowed `public.users.id` to diverge from
`auth.users.id`. Once that drift existed, seeded auth sessions could resolve the auth user correctly
while foreign keys and `user_roles` still pointed at the stale public user UUID.

PR #113 reversed that policy in seed code by introducing
`reconcilePublicUserIdWithAuthId()` and `rekeyAllForeignKeysToPublicUsers()`. Those helpers run only
in privileged seed flows such as `pnpm seed:demo` and migrate-time setup paths like
`pnpm --filter @propertypro/db db:migrate`. They are not part of runtime request handlers.

`compliance_audit_log` is append-only at the database layer via the
`compliance_audit_log_append_only_guard` trigger defined in
`packages/db/migrations/0005_append_only_audit_log.sql`. Rekeying audit rows therefore requires a
brief trigger disable/enable sequence inside the same transaction as the foreign-key rewrite.

## Decision

Seed reconciliation is now authoritative:

- If a seeded user already exists in `public.users` but its UUID differs from the preferred Supabase
  auth UUID, seed code will move the identity to the auth UUID instead of preserving the stale row
  id.
- The helper re-keys every discovered foreign key to `public.users.id` so dependent records follow
  the canonical auth UUID.
- If a `public.users` row already exists at the auth UUID, seed updates that row in place, re-keys
  foreign keys to it, and deletes the stale row.
- If no `public.users` row exists at the auth UUID, seed first parks the stale row email on the
  `orphan+<uuid>@seed.propertypro.invalid` pattern, inserts a replacement row at the auth UUID,
  re-keys foreign keys to the replacement row, and deletes the stale row.
- This policy is limited to seed/demo and migrate-time setup code. Runtime request handlers, admin
  tools, and ordinary application writes must not reuse this pattern.

The brief `compliance_audit_log_append_only_guard` disable is acceptable in this scope because:

- The disable/update/enable sequence runs inside a single transaction, so rollback restores both the
  data state and the trigger state.
- The helper validates both UUID inputs before issuing SQL and runs only under privileged seed
  execution with service-role access.
- The code path is never reachable from production application request handlers.

## Consequences

| Type | Consequence |
|---|---|
| Positive | Seeded `public.users.id` values now converge on the matching Supabase auth UUID, preventing auth/public identity drift from persisting across reseeds. |
| Positive | Foreign keys, including `compliance_audit_log.user_id`, move with the reconciled identity instead of leaving split references behind. |
| Tradeoff | Seed runs that need reconciliation may serialize briefly on `compliance_audit_log` trigger DDL because the append-only guard uses table-level locking. |
| Tradeoff | The policy intentionally uses a privileged seed-only escape hatch, which must remain documented and out of runtime code paths. |

## Alternatives Considered

| Alternative | Reason Rejected |
|---|---|
| Keep preserving the existing `public.users.id` and only log a warning | Leaves `public.users.id` drift in place, which can break seeded auth/session expectations and keep `user_roles` attached to the wrong UUID. |
| Insert or keep a second `public.users` row at the auth UUID without re-keying every foreign key | Splits a single identity across multiple UUIDs and leaves stale dependent records behind. |
| Run reconciliation from runtime handlers or admin workflows | Expands privileged trigger-DDL behavior into production app code and weakens the append-only audit boundary outside controlled seed flows. |
