# Production Verification — Orphan Migrations (2026-05-06)

Phase 0.1 of the verification gate from `~/.claude/plans/draft-a-plan-that-reflective-pie.md`.

Queries were run via the Supabase MCP against the **PropertyPro production project** (`vbqobyagjzvlfpfozvmx`, region `us-west-2`, ACTIVE_HEALTHY). Read-only schema introspection only; no row data examined or echoed.

---

## Hypothesis

The 3 SQL files in `packages/db/migrations/` that lack journal entries (`0011_billing_scheduler.sql`, `0012_maintenance_requests.sql`, `0035_add_transparency_columns_rollback.sql`) were applied to production via direct SQL outside the Drizzle journal. If true, production has the schema but `pnpm --filter @propertypro/db db:migrate` on a fresh DB would not.

## Methodology

For each orphan file, query `information_schema.columns`, `pg_indexes`, `pg_type`, and `to_regclass(...)` to confirm whether each individual schema element it defines is present in production.

## Results

### `0011_billing_scheduler.sql` — partially applied

| Element | In file | In prod? |
|---|---|---|
| `communities.payment_failed_at` (timestamptz) | yes | ✅ present |
| `communities.next_reminder_at` (timestamptz) | yes | ✅ present |
| `communities.subscription_canceled_at` (timestamptz) | yes | ✅ present |
| `communities_next_reminder_at_idx` (partial idx on `next_reminder_at IS NOT NULL`) | yes | ❌ **missing** |

**The 3 columns are present, but the partial index is not.** Whoever applied the migration via direct SQL appears to have run only the `ALTER TABLE` statements and skipped the `CREATE INDEX`.

### `0012_maintenance_requests.sql` — fully applied

| Element | In file | In prod? |
|---|---|---|
| `maintenance_status` enum | yes | ✅ present |
| `maintenance_requests` table | yes | ✅ present |

### `0035_add_transparency_columns_rollback.sql` — never applied

| Element | Effect | Observed |
|---|---|---|
| `compliance_checklist_items.is_conditional` (the column the rollback would `DROP`) | should be absent if rollback ran | ✅ **still present** |

The "rollback" file in the repo is a record of a rollback plan that was never executed. The forward migration `0035_add_transparency_columns.sql` is in the journal and remains in effect. The rollback file is documentation of an aborted rollback — keep in repo for historical context, but it is misleading as a pending change.

---

## Net findings

1. **Drift hypothesis confirmed**: all schema changes in the 3 orphan files were applied via direct SQL, bypassing the Drizzle journal. This is a process gap the architectural plan does not address — the application path for "apply this SQL to prod" should produce a journal entry as a side effect, not be a separate manual operation.

2. **Latent perf bomb (low severity today, growing)**: the `communities_next_reminder_at_idx` partial index is missing. The `payment-alert-scheduler` cron runs hourly and queries `communities` filtered by `next_reminder_at IS NOT NULL`. Without the index, every cron tick is an O(n) scan. Impact today is small (community count is small), but this scales linearly and will surface as cron latency / DB load before it becomes a 5xx.

3. **Aborted-rollback file is misleading**: `0035_add_transparency_columns_rollback.sql` exists but was never run. A new engineer reading the repo could reasonably conclude the column has been dropped.

---

## Recommended actions

| Action | Severity | Owner |
|---|---|---|
| **Apply the missing index in production**: `CREATE INDEX CONCURRENTLY communities_next_reminder_at_idx ON communities (next_reminder_at) WHERE next_reminder_at IS NOT NULL;` and add a journal entry for it. Use `CONCURRENTLY` to avoid taking a write lock. | Medium | DB / infra |
| **Retro-add journal entries** for `0011_billing_scheduler` (with the missing-index step also applied), `0012_maintenance_requests`, and the original `0035_add_transparency_columns` (which was journaled but the rollback was not). Drain `KNOWN_ORPHAN_MIGRATION_FILES` from [`scripts/verify-migration-ordering.ts`](../../scripts/verify-migration-ordering.ts) once each is reconciled. | Medium | DB / infra |
| **Delete or rename `0035_add_transparency_columns_rollback.sql`** so it doesn't read as a pending rollback. Move to a `migrations/aborted/` subdirectory or delete entirely (the forward migration's history is enough record). | Low | Cleanup PR |
| **Process gate**: investigate how direct SQL was applied to prod outside the journal. The fact that this happened twice (`0011`, `0012`) suggests it's not an isolated lapse. Add a tooling guard or runbook so it cannot happen again. | High (process) | Eng leadership |
| **Surface the [drizzle-kit snapshot collision](../../docs/audits/guard-adversarial-coverage-2026-05-06.md#04c--migration-ordering-guard-against-drizzle-kit-generated-names)** that's blocking `db:generate`. The team cannot currently produce new migrations through the canonical path; the longer this sits, the more work piles up as direct SQL — recreating the very class of drift this audit is unwinding. | High | Migration-tooling triage |

---

## What this audit did NOT find

- Application code referencing nonexistent schema. The 4 prod columns/tables/enums referenced by `payment-alert-scheduler.ts` and the operations hub's maintenance-requests queries all exist. **Not a live incident.**
- Any other schema drift beyond the 3 known orphan files. (Inspection scope was limited to those files; the audit doesn't claim a full schema sweep.)
