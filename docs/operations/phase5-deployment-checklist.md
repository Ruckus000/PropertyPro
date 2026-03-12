# Phase 5 Deployment Checklist

## Scope

This checklist covers production deployment readiness for Phase 5 workstreams WS66-WS72.

## 1. Pre-Deployment Checks

- Confirm deploy branch: `codex/phase-5-table-stakes` (or merged equivalent).
- Confirm required evidence docs exist:
  - `docs/audits/phase5-66-2026-03-09.md`
  - `docs/audits/phase5-67-2026-03-09.md`
  - `docs/audits/phase5-68-2026-03-09.md`
  - `docs/audits/phase5-69-2026-03-09.md`
  - `docs/audits/phase5-70-2026-03-09.md`
  - `docs/audits/phase5-71-2026-03-09.md`
  - `docs/audits/phase5-72-2026-03-09.md`
  - `docs/audits/phase5-gate-2026-03-09.md`
- Validate env load command succeeds:

```bash
set +u; set -a; source .env.local; set +a
```

- Apply DB migrations before app rollout:

```bash
pnpm --filter @propertypro/db db:migrate
```

- Rebuild workspace packages after source changes:

```bash
pnpm --filter @propertypro/shared build && pnpm --filter @propertypro/db build
```

- Run Phase 5 verification in this exact order:

```bash
set +u; set -a; source .env.local; set +a
pnpm --filter @propertypro/db db:migrate
pnpm --filter @propertypro/shared build && pnpm --filter @propertypro/db build
pnpm lint
pnpm typecheck
pnpm test
npx tsx scripts/verify-migration-ordering.ts
npx tsx scripts/verify-no-mocks-in-integration.ts
npx tsx scripts/verify-phase5-security-gates.ts
pnpm exec vitest run --config apps/web/vitest.integration.config.ts apps/web/__tests__/integration/phase5-security-gates.integration.test.ts
pnpm exec vitest run apps/web/__tests__/middleware/phase5-security-gates.test.ts
npx tsx scripts/verify-audit-evidence.ts
```

## 2. Deployment Execution

- Deploy database migrations first, then app deploy.
- Deploy web app with production env vars already set.
- Confirm middleware is active for `/api/v1/*` (request IDs + rate-limit behavior).

## 3. Post-Deployment Validation

- Smoke test representative Phase 5 endpoints in each domain:
  - Finance: `/api/v1/assessments`, `/api/v1/ledger`
  - Violations/ARC: `/api/v1/violations`, `/api/v1/arc`
  - Polls/Forum: `/api/v1/polls`, `/api/v1/forum/threads`
  - Work Orders/Amenities: `/api/v1/work-orders`, `/api/v1/amenities`
  - Calendar/Accounting: `/api/v1/calendar/google/connect`, `/api/v1/accounting/connect`
  - Package/Visitor: `/api/v1/packages`, `/api/v1/visitors`
- Verify cross-tenant access attempts return `403`/`404`.
- Verify feature-disabled community combinations return `403`.
- Verify audit rows exist in `compliance_audit_log` for new mutations.

## 4. Rollback Criteria

Trigger rollback if any of the following occur:

- Cross-tenant data exposure confirmed.
- Unauthorized role can mutate protected finance/operations endpoints.
- Widespread `500` responses across Phase 5 APIs.
- Migration errors leave critical Phase 5 tables unavailable.

## 5. Rollback Actions

- Halt traffic to new release (rollback app deployment).
- Keep DB schema forward-only; do not manually drop Phase 5 tables.
- If hotfix is required, patch app behavior with feature flags or route guards first.
- Record incident timeline and affected endpoints in the corresponding runbook.
