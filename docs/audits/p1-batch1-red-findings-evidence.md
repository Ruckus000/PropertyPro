# P1 Batch 1 Red Findings Evidence (2026-02-11)

## Scope
- Migration generation for missing Batch 1 tables.
- P1-27b merge-blocking evidence and DB-enforcement truth check.

## Evidence Matrix
| Finding | Status | Evidence |
| --- | --- | --- |
| Missing Batch 1 migration SQL (`compliance_audit_log`, `compliance_checklist_items`, `announcements`) | Resolved | `packages/db/migrations/0001_condemned_mikhail_rasputin.sql` includes `CREATE TABLE` statements for all three tables. |
| P1-27b app-layer merge-blocking tests (append-only rejection + cross-tenant audit reads) | Present | `pnpm exec vitest run packages/db/__tests__/audit-logging.test.ts` passes (`19/19`), including append-only and cross-tenant audit-read cases. |
| P1-27b DB-layer append-only enforcement (trigger/revoke/policy) | Gap remains | No DB-native enforcement found in schema/migrations (`packages/db/src/schema/compliance-audit-log.ts`, `packages/db/migrations/0001_condemned_mikhail_rasputin.sql`). |

## Classification
- **App layer:** append-only behavior is enforced by `createScopedClient` guard logic (rejects update/delete for `compliance_audit_log`).
- **Database layer:** append-only behavior is **not yet enforced natively** (no trigger/revoke/policy found).

## Follow-Up Task (Gap Tracking)
- **Task ID:** `P1-27c-db-append-only-enforcement`
- **Required deliverables:**
  - Migration that enforces append-only at DB level for `compliance_audit_log` (block UPDATE/DELETE).
  - DB-level integration test proving direct UPDATE/DELETE is rejected even outside scoped-client guards.
  - Regression check that INSERT remains allowed.
