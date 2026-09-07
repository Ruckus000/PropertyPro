# Migration ledger reconciliation

**Command:** `scripts/with-env-local.sh pnpm db:ledger:verify`
**Script:** [`scripts/verify-migration-ledger.ts`](../../scripts/verify-migration-ledger.ts)
**When:** after every manual migration apply, and before trusting any claim about what production has.

## What it answers

Migrations reach production **by hand** (Supabase MCP `apply_migration`), and
`apply_migration` does not write drizzle's ledger — every row in
`drizzle.__drizzle_migrations` is typed in by a person. That ledger is the input
to drizzle's own apply gate, so when it drifts, the tool's behaviour drifts with
it, silently.

This reconciles the ledger against the migration files by **hashing the file
bytes**, which is the only comparison that can see all four failure modes. A row
count cannot see any of them.

## Reading the output

```
migration files: 70 · ledger rows: 69 · applied: 69 · ledger tip: 1788797631673
```

| line | meaning | what to do |
|---|---|---|
| `ORPHAN` | a ledger row whose hash matches no migration file | the migration was applied from a branch that never landed, or the file changed after applying. Land the file, or correct the row to match it. |
| `MISMATCH` | `created_at` ≠ the file's journal `when` | drizzle's gate reads `created_at`; the two must agree. `UPDATE` the row to the journal value. |
| `UNAPPLIED` | a file with no ledger row, not on the allowlist | apply it and record the row — or, if it is deliberately held, add it to `KNOWN_UNAPPLIED_MIGRATIONS` **with a reason**. |
| `DEAD ENTRY` | the allowlist names a migration that no longer exists | remove it, so the list keeps meaning something. |
| ⚠️ `EXPECTED-UNAPPLIED` | on the allowlist | nothing. Exit stays 0. |
| ⚠️ `STRANDED` | unapplied **and** below the ledger tip | see below. Exit stays 0 when it is also allowlisted. |

**Exit codes:** `0` reconciled · `1` drift · `2` could not check (no
`DATABASE_URL`, connection failed, no migration files, empty ledger). A `2` is
never a pass — it means the comparison did not happen.

## `STRANDED` is the one that surprises people

Drizzle applies a migration only when `lastApplied.created_at < folderMillis`.
So a migration whose `when` sits **below** the ledger's highest `created_at` can
never be applied by `drizzle-kit migrate` again. It does not error. It does
nothing, reports success, and moves on.

Today that is `0062_secret_ballot` (`when=1786414111600`, tip `1788797631673`).
Shipping it needs a **manual apply plus a hand-written ledger row** — re-running
the migrator will silently skip it. That is a fact worth knowing *before* someone
concludes the migration "didn't work".

## Why this is not in `pnpm lint`

A freshly-migrated database is reconciled by construction — `drizzle-kit migrate`
writes the ledger from the very files this compares against. Measured 2026-09-07:
`main` had 70 journal entries; the disposable local test DB had **70** ledger rows
(including `0062`), production had **69**. Against CI's ephemeral Postgres this
check passes unconditionally, and a check that cannot fail is worse than no check
(`.claude/rules/verification.md`).

So it lives in the `db:*` namespace, is absent from `scripts/run-lint-guards.mjs`
on purpose, and is run by a person against production. What CI *does* enforce is
the comparison logic — `reconcile()` is pure and unit-tested in
`scripts/__tests__/verify-migration-ledger.test.ts`.

## Safety

**Read-only — one `SELECT`.** Safe against production at any time, the same
posture as `scripts/verify-stripe-mode.ts`. `scripts/with-env-local.sh` points at
production by design; that wrapper is dangerous for scripts that *write*, and
this is not one. It prints the database host it connected to before doing
anything, so you can see which database you just made a claim about.

> A worktree created without `scripts/setup.sh` has no root `.env.local`, and the
> wrapper hardcodes `$repo_root/.env.local`. Symlink the main checkout's copy in,
> or run from the main checkout.

## Related

- [`.claude/rules/migration-safety.md`](../../.claude/rules/migration-safety.md) — the manual-apply procedure this verifies
- [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md) §7.3 — Database Migration Deploy
- `pnpm exec tsx scripts/verify-migration-ordering.ts` — the filesystem-only sibling (journal, snapshot chain, cross-branch collisions). It never opens a database; this never reads the journal's ordering. Neither subsumes the other.
