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
| 🔒 `HELD — DO NOT APPLY` | on the allowlist, with a recorded reason | **nothing.** Exit stays 0. This is a decision, not a finding |

**Exit codes:** `0` reconciled · `1` drift · `2` could not check (no
`DATABASE_URL`, connection failed, no migration files, empty ledger). A `2` is
never a pass — it means the comparison did not happen.

## `HELD` means do not apply it, and the wording is load-bearing

A migration on `KNOWN_UNAPPLIED_MIGRATIONS` is absent from production **because
somebody chose that**. The command exits 0 and prints a `🔒 HELD — DO NOT APPLY`
block carrying the reason. There is nothing to action.

That block is worded the way it is because an earlier version was not, and it
caused an incident. It used to print `⚠️ EXPECTED-UNAPPLIED` — a warning glyph
over a passive noun phrase — and then, directly beneath it, a separate block
ending *"Shipping it needs a manual apply plus a hand-written ledger row."* A
session read that, opened a task called "Apply missing 0062_secret_ballot
migration to production", and started working on it. `0062` drops five columns
that live election code reads. Nothing was wrong with the reconciliation; the
prose was an instruction sitting under a label that looked like a problem.

The wording is now pinned by tests in
[`scripts/__tests__/verify-migration-ledger.test.ts`](../../scripts/__tests__/verify-migration-ledger.test.ts).
If you are editing it, keep two properties: the header refuses in the
imperative, and the block does not read as a procedure.

### Holding a migration forks CI from production

This is the consequence that is easiest to miss and hardest to recover from,
so the `HELD` block states it every run.

`pnpm db:test-local:reset` and the CI service container apply **every migration
on disk**. Production has only the ones somebody applied. So a held migration
means the two schemas differ, and **every test touching its tables validates a
shape production does not have** — in the feature most likely to be switched on
later without re-testing, because it is the one that was gated.

Measured on `0062_secret_ballot`, 2026-09-07:

| | five dropped columns | `selection_digest` |
|---|---|---|
| local / CI | 0 (gone) | present |
| production | 5 (present) | absent |

The exact inverse. All 173 election tests passed against a schema production has
never had — which is why an **inverted dependency**, live code requiring the held
migration, survived undetected until somebody read it by hand. A green suite
could not have caught it, and still cannot.

So before switching a gated feature on, re-test against production's real schema.
The `HELD` block names the affected tables so you know which ones those are.

### The stranding note

A migration whose `when` sits **below** the ledger's highest `created_at` can
never be applied by `drizzle-kit migrate` again — it applies only when
`lastApplied.created_at < folderMillis`, so it does not error, it does nothing
and reports success.

Today that is `0062_secret_ballot` (`when=1786414111600`, tip `1788797631673`).
That fact is printed under an explicit precondition, because it matters only
*if and when* the hold is deliberately lifted — which for a contract migration
means shipping the code that stops depending on it first. It is not a step to
take now, and the command says so.

For a migration that is stranded and **not** on the allowlist, the framing is
the opposite: that is real drift, it is reported as a `UNAPPLIED` problem with
the stranding folded in, and the command exits 1.

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
