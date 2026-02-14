# P1 Batch 1 Red Findings Evidence (2026-02-11)

## Scope
- Migration generation for missing Batch 1 tables.
- P1-27b merge-blocking evidence and DB-enforcement truth check.

## Evidence Matrix
| Finding | Status | Evidence |
| --- | --- | --- |
| Missing Batch 1 migration SQL (`compliance_audit_log`, `compliance_checklist_items`, `announcements`) | Resolved | `packages/db/migrations/0001_condemned_mikhail_rasputin.sql` includes `CREATE TABLE` statements for all three tables. |
| P1-27b app-layer merge-blocking tests (append-only rejection + cross-tenant audit reads) | Present | `pnpm exec vitest run packages/db/__tests__/audit-logging.test.ts` passes (`19/19`), including append-only and cross-tenant audit-read cases. |
| P1-27b DB-layer append-only enforcement (trigger/revoke/policy) | Resolved (2026-02-14) | DB-native trigger enforcement added in `packages/db/migrations/0005_append_only_audit_log.sql`; DB-level integration coverage added in `packages/db/__tests__/audit-log-append-only-db.integration.test.ts` (`3/3` passing). |

## Classification
- **App layer:** append-only behavior is enforced by `createScopedClient` guard logic (rejects update/delete for `compliance_audit_log`).
- **Database layer:** append-only behavior is enforced natively via trigger (`compliance_audit_log_append_only_guard`) that rejects UPDATE/DELETE.

## Follow-Up Task (Gap Tracking)
- **Task ID:** `P1-27c-db-append-only-enforcement`
- **Status:** Complete (2026-02-14)
- **Deliverables completed:**
  - Migration enforcing append-only at DB level for `compliance_audit_log` (UPDATE/DELETE blocked).
  - DB-level integration test proving direct UPDATE/DELETE rejection outside scoped-client guards.
  - Regression coverage proving INSERT remains allowed.

## Auth Hardening Addendum (2026-02-11)
- Runtime identity for `/api/v1` mutation routes now resolves from Supabase server session cookies instead of `x-user-id` request headers.
- Middleware now differentiates unauthenticated outcomes by route type:
  - Page routes continue redirecting to `/auth/login?returnTo=...`.
  - API routes under `/api/v1` return JSON `401` without redirect.
- Unverified users on protected API routes now receive JSON `403` (`Email verification required`) instead of HTML redirects.

## Community Authorization Follow-Up (Pre-Gate-2 Security Requirement)
- **Issue:** [#2](https://github.com/Ruckus000/PropertyPro/issues/2) — `[P1][High] Enforce communityId membership authorization on document/compliance mutations`
- **Status:** Closed on 2026-02-14 with implementation evidence posted in issue comment.
- **Truthful classification:** identity hardening + community membership authorization on targeted document/compliance mutations are both enforced and covered by DB-backed integration tests.

## Validation Addendum (2026-02-14)
- `pnpm --filter @propertypro/db db:migrate`: pass (applies `0005_append_only_audit_log`).
- `pnpm exec vitest run packages/db/__tests__/audit-logging.test.ts`: pass (`19/19`).
- `pnpm --filter @propertypro/db exec vitest run --config vitest.integration.config.ts __tests__/audit-log-append-only-db.integration.test.ts`: pass (`3/3`).
- `pnpm --filter @propertypro/db test:integration`: pass (`31/31`).
- `pnpm exec vitest run --config apps/web/vitest.integration.config.ts`: pass (`47/47`).
- `pnpm seed:verify`: pass.
