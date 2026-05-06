# Migration Orphan Files Follow-up (2026-05-06)

## Summary

`scripts/verify-migration-ordering.ts` was strengthened to flag any SQL file
in `packages/db/migrations/` that lacks a corresponding entry in
`meta/_journal.json`. This surfaced **3 historical files on disk that the
journal does not know about**. They were grandfathered into the guard via
`KNOWN_ORPHAN_MIGRATION_FILES` so CI passes, but each one requires a
production-DB-aware reconciliation that this audit cannot perform from a
worktree without env vars.

The previous version of the guard only flagged files with numbers *beyond*
the last journal index, which is why these stayed invisible.

This is distinct from the 2026-03-31 incident (DB-side journal-row drift on
0126–0128); that one was already reconciled. This is filesystem-side drift.

## The three files

| File | Symptom | Suspected origin |
| --- | --- | --- |
| `0011_billing_scheduler.sql` | Adds `payment_failed_at`, `last_failed_payment_at`, `next_reminder_at` columns to `communities`. Duplicate-numbered with `0011_flawless_diamondback.sql` (which IS in journal — it creates `pending_signups` + maintenance enums). | P2-34a era. Likely hand-written outside Drizzle's generator to land a hotfix; companion file `payment-alert-scheduler.ts` reads these columns in production today. |
| `0012_maintenance_requests.sql` | Creates `maintenance_status` enum + `maintenance_requests` table + partial index. Duplicate-numbered with `0012_modern_colossus.sql` (which IS in journal — `onboarding_wizard_state`). | P2-36 era. Same pattern — hand-rolled migration to ship apartment ops dashboard. |
| `0035_add_transparency_columns_rollback.sql` | Drops the `is_conditional` column added in `0035_add_transparency_columns.sql`. | Explicit emergency-rollback record, kept as documentation rather than executed via the journal. |

## Risk assessment

- **Low for current production state.** All evidence (live use of `payment_failed_at` in [`payment-alert-scheduler.ts`](apps/web/src/lib/services/payment-alert-scheduler.ts), the maintenance_requests table being queried by the operations hub) suggests these schema changes were applied to production via direct SQL apply, not through Drizzle.
- **High for environment parity.** A fresh database created via `pnpm --filter @propertypro/db db:migrate` would NOT have these schema changes, because the journal does not know about them. This means CI integration tests, demo seeds, and any local developer's database may quietly diverge from production schema.

## Required reconciliation (needs DB access)

For each of the three files, the operator must:

1. Run a schema check against production to confirm whether the change has been applied.
2. **If applied:** retro-add a journal entry with the file's true content hash, so future DB initializations include the change.
3. **If not applied (unlikely for #1 and #2, expected for #3 rollback):** decide whether the change is still needed; if yes, regenerate via `drizzle-kit generate` to land cleanly.
4. After reconciliation, remove the file from `KNOWN_ORPHAN_MIGRATION_FILES` in [`scripts/verify-migration-ordering.ts`](scripts/verify-migration-ordering.ts).

## Mitigation in place

The strengthened guard now blocks **any new** SQL file from landing without a journal entry. Existing tooling (`drizzle-kit generate`) produces both file and journal entry atomically, so the only way to introduce a new orphan would be a manual file write — which CI will reject.

## References

- Strengthened guard: [`scripts/verify-migration-ordering.ts`](scripts/verify-migration-ordering.ts) (`KNOWN_ORPHAN_MIGRATION_FILES`, `checkMigrationFilesExist`).
- Prior incident (different drift class, already resolved): [`docs/audits/migration-drift-recovery-2026-03-31.md`](docs/audits/migration-drift-recovery-2026-03-31.md).
- Architectural plan: `~/.claude/plans/draft-a-plan-that-reflective-pie.md` Phase C (C8).
