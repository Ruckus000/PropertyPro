# Phase 4 Execution Plan - Hardening, Deployment, and Gate 4 Closeout

**Date:** 2026-02-22
**Author:** PropertyPro Engineering
**Status:** Complete on `main` (10/10 base Phase 4 tasks complete; Batches A+B+C+D+E complete; Gate 4 signed off 2026-02-26)
**Prerequisites:** Phase 0 complete, Gate 1 signed off, Phase 1 complete with Gate 2 closed, Phase 2 complete with Gate 3 closed, Phase 3 complete with exit verification captured

**Transition Tracking Note (2026-03-04):**
- This file tracks the legacy phase program completed on `main`.
- Transition Plan v4.1 wave status is tracked in `IMPLEMENTATION_PLAN.md` under "Transition Plan v4.1 Progress Snapshot (2026-03-04)".

---

## Execution Progress Log (Single-Writer)

Rules:
- Update this section on `main` only (never from feature worktrees).
- Append one line per completed milestone with date, branch, and commit hash.
- Do not edit historical lines; append new lines only.

Milestones:
- [2026-02-22] Phase 4 execution branch/workstream initialized (`codex/p4-gate4-predeploy-validation`) - created canonical Phase 4 tracker, updated implementation status snapshots, and recorded Gate 4 pre-deployment kickoff baseline after Phase 3 closeout merge (`90d6e17`).
- [2026-02-24] `P4-55` complete - Row-Level Security policies, coverage config, and integration validation merged on `main` via PR #14 (`05a5691`).
- [2026-02-24] `P4-56` complete - Security audit baseline established: CORS restriction, CSP headers, security response headers, Zod input validation, sanitized error responses, BadRequestError error class, dependency scan documented. Security audit doc at `docs/SECURITY_AUDIT.md`. All 1419 tests passing on branch `codex/p4-56-security-audit`.
- [2026-02-24] `P4-57` complete - Declarative RBAC matrix (7 roles × 3 community types × 9 resources × 2 actions = 378 cells) with route-level enforcement and read guards. Merged on `main` via PR #17 (`9953858`) with followup fix (`b8185be`). Docs at `docs/RBAC_MATRIX.md`.
- [2026-02-24] `P4-58` complete - Integration tests for critical user flows: compliance lifecycle, meeting deadlines, document upload, announcements CRUD. Merged on `main` via PR #18 (`a52e216`).
- [2026-02-24] `P4-61` complete (out-of-sequence from Batch C) - Idempotent demo reset script with FK-safe deletion across 21 tenant tables, Supabase Auth cleanup, nightly cron via GitHub Actions. Merged on `main` via PR #20 (`d587692`).
- [2026-02-24] `P4-63` complete - WCAG 2.1 AA accessibility audit: axe-core automated testing (9 tests), ARIA role/attribute fixes on forms, skip-to-content navigation, landmark IDs. Docs at `docs/ACCESSIBILITY.md`. Branch `codex/p4-63-64-batch-c`, PR #21 (`9ab3f89`).
- [2026-02-24] `P4-64` complete - Community data export: ZIP of 4 CSVs (residents, documents, maintenance requests, announcements) via streaming archiver. GET `/api/v1/export` with RBAC (settings/read), export UI at `/settings/export`, 21 unit tests. Branch `codex/p4-63-64-batch-c`, PR #21 (`9ab3f89`).
- [2026-02-24] `P4-59` complete - CI/CD pipeline: unified `ci.yml` (lint → typecheck → test → build, parallel first three stages, build gates on all passing), `deploy.yml` (production deploy on main push with smoke test, PR preview deploys with PR comment). Branch `claude/phase-4-review-wvuYU`.
- [2026-02-24] `P4-60` complete - Production deployment config: `vercel.json` updated with HSTS header and build commands, deployment runbook at `docs/DEPLOYMENT.md` covering env var inventory, DNS/domain setup, CI/CD pipeline overview, deployment procedures, rollback, and monitoring. Branch `claude/phase-4-review-wvuYU`.
- [2026-02-25] `P4-62` complete - k6 load testing: scripts at `scripts/load-tests/k6-script.js`, 4 test runs with iterative fixes, 8/8 thresholds passing (p95 < 2s, error rate 1.82%). Results at `docs/audits/p4-62-load-test-results.md`. Merged via PR #24 (squash).
- [2026-02-26] Gate 4 sign-off — all 10/10 base Phase 4 tasks complete and merged to `main`. Evidence at `docs/audits/gate4-evidence-2026-02-26.md`.

Current cursor:
- 10/10 base Phase 4 tasks complete. All batches (A-E) complete.
- Gate 4 signed off 2026-02-26.
- Implementation plan fully complete: 65/65 tasks + 5/5 quality gates.

---

## Phase 4 Tracking Model (Canonical)

- Base tasks counted in denominator (`10` total): `P4-55`, `P4-56`, `P4-57`, `P4-58`, `P4-59`, `P4-60`, `P4-61`, `P4-62`, `P4-63`, `P4-64`.
- Official quality gate in this phase: `GATE 4` (pre-deployment verification).
- Canonical source for Phase 4 ratio math, batch sequencing, and Gate 4 closeout checklist is this file.

---

## Phase 4 Scope Snapshot

Completed base Phase 4 tasks on `main`:
- `P4-55` Row-Level Security
- `P4-56` Security Audit
- `P4-57` RBAC Audit
- `P4-58` Integration Tests
- `P4-59` CI/CD Pipeline
- `P4-60` Production Deployment
- `P4-61` Demo Reset Script
- `P4-63` Accessibility Audit
- `P4-62` Load Testing
- `P4-64` Data Export

Remaining base Phase 4 tasks:
- (none)

Count check: 10 completed + 0 remaining = 10 base tasks.

---

## Batch Execution Plan

Gate failure protocol:
"If a batch fails its exit gate: (1) do not merge to `main`; (2) fix on the feature branch; (3) if fix reveals an upstream design flaw, land a focused hotfix on `main` first, then rebase/recreate current branch; (4) escalate to replanning if rework exceeds half-day scope."

### Batch A - Database and App Security Baseline
Tasks:
- `P4-55` Row-Level Security
- `P4-56` Security Audit

Why first:
- These are the highest-risk, highest-leverage tasks and directly unblock the core Gate 4 security checklist.
- `P4-56` depends on `P4-55` in the implementation plan.

Batch-specific gate checks:
- RLS enabled on all tenant-scoped tables with policy coverage verification.
- Cross-tenant RLS negative tests pass for read/write paths.
- Service-role bypass behavior verified for migrations/background access.
- Security audit baseline doc exists with remediations tracked.
- Dependency scan reports zero critical/high vulnerabilities (or blocking remediation PR exists before merge).
- Middleware/API hardening checks (CORS/CSP/input validation error shape) are covered by tests.

#### `P4-55` execution scope (concrete subtask breakdown)

Implementation outputs (Batch A / task-level):
- SQL migration to enable RLS + create policies on tenant-scoped tables (`packages/db/migrations/XXXX_p4_55_rls.sql`)
- Policy inventory/config map for coverage assertions and maintenance (`packages/db/src/schema/rls-config.ts`)
- DB integration tests for policy enforcement, coverage, and service-role bypass (`packages/db/__tests__/rls-policies.integration.test.ts`)
- Web/API validation test(s) for route behavior under restricted DB role if app-level harness is needed (`apps/web/__tests__/rls-validation.test.ts`)

Tenant-scoped table inventory (direct `community_id` columns; current schema scan = 21):
- `announcement_delivery_log`
- `announcements`
- `compliance_audit_log`
- `compliance_checklist_items`
- `contract_bids`
- `contracts`
- `demo_seed_registry`
- `document_categories`
- `documents`
- `invitations`
- `leases`
- `maintenance_comments`
- `maintenance_requests`
- `meeting_documents`
- `meetings`
- `notification_digest_queue`
- `notification_preferences`
- `onboarding_wizard_state`
- `provisioning_jobs`
- `units`
- `user_roles`

Global/non-tenant exceptions to explicitly document in `rls-config` (no `community_id`, different handling):
- `communities`, `users`, `pending_signups`, `stripe_webhook_events`
- Note: `compliance_audit_log` is tenant-scoped but append-only and requires role-restricted read policy design.

Subtasks (execute in order):
1. Policy design + SQL helper strategy
- Define auth mapping from `auth.uid()` -> `users.id` -> `user_roles.community_id`.
- Choose/sessionize tenant context for insert auto-scoping (e.g., DB session setting used by policies/triggers) and document fallback behavior for service-role jobs.
- Define policy families: standard tenant CRUD, service-role-only/system tables, and audit-log restricted reads.

2. `rls-config` source of truth
- Encode tenant-scoped table list, policy family, and expected access mode (`tenant_crud`, `tenant_read_only`, `service_only`, `audit_log_restricted`).
- Encode explicit exclusions to prevent silent drift when new schema files are added.
- Reuse config in tests to drive coverage assertions (no hand-maintained duplicate table list).

3. Migration implementation (`P4-55`)
- Enable RLS on every tenant-scoped table (all 21 above).
- Create `SELECT` / `INSERT` / `UPDATE` / `DELETE` policies per family with `USING` + `WITH CHECK`.
- Add insert auto-scoping mechanism for tenant tables (trigger/default/session context) so forged `community_id` writes are rejected or overwritten by DB policy path.
- Preserve service-role/background access (verify bypass behavior; do not break migrations/seed/demo reset workflows).
- Keep changes additive/reviewable; avoid manual production SQL outside Drizzle migration flow.

4. DB integration test suite (required for task completion)
- Policy coverage test: query catalog (`pg_class`/`pg_tables`) and assert RLS enabled for every tenant-scoped table from `rls-config`.
- Cross-tenant read negative tests: community A auth context cannot read community B rows across representative tables (and table-family coverage).
- Cross-tenant write negative tests: forged `community_id` insert/update/delete attempts fail or no-op per policy.
- Audit-log tests: non-authorized tenant roles denied; authorized canonical roles limited to own/managed communities only.
- Service-role test: privileged connection can access multi-community rows (bypass confirmed).

5. Batch A readiness outputs before `P4-56`
- Record exact test command(s) and evidence artifact paths for Gate 4 checklist.
- List any tables intentionally deferred/excluded (must be zero unless justified in writing with follow-up issue).
- Document operational rollback/mitigation notes for overly restrictive policy regressions.

### Batch B - Access Control and Integration Coverage
Tasks:
- `P4-57` RBAC Audit
- `P4-58` Integration Tests

Why now:
- `P4-57` depends on `P4-56`; `P4-58` depends on `P4-57`.
- These complete most remaining Gate 4 evidence requirements (matrix coverage + >80% integration coverage).

Batch-specific gate checks:
- Declarative RBAC matrix is implemented and test-generated for full role/community/resource/action coverage.
- Route-handler and query-layer authorization enforcement validated (not UI-only).
- Integration flows cover signup/provisioning, document lifecycle, compliance, and role isolation.
- Coverage report for `apps/web/src/` is captured and exceeds 80%.

### Batch C - Parallel Hardening Utilities (Non-Blocking to Security Chain)
Tasks:
- `P4-63` Accessibility Audit
- `P4-64` Data Export
- `P4-61` Demo Reset Script

Why here:
- `P4-63` only depends on `P3-54`; `P4-64` and `P4-61` are largely independent of the main security chain.
- Can run in parallel with Batch B if staffing permits without blocking Gate 4 security sequencing.

Batch-specific gate checks:
- Axe/keyboard/landmark accessibility suite passes on critical surfaces.
- Data export enforces scoped-query/community isolation and format correctness.
- Demo reset script is idempotent and preserves schema/RLS policies.

### Batch D - CI/CD and Deployment Readiness
Tasks:
- `P4-59` CI/CD Pipeline
- `P4-60` Production Deployment

Why after Batch B:
- `P4-59` depends on `P4-58`; `P4-60` depends on `P4-59`.
- CI/CD should gate on the strengthened test/security posture, not precede it.

Batch-specific gate checks:
- PR CI order is lint -> typecheck -> test -> build and fail-fast.
- Node 20 is enforced in Actions.
- Deployment runbook and env var inventory are documented.
- Staging/production deployment smoke checks pass.

### Batch E - Performance Validation and Gate 4 Closeout
Tasks:
- `P4-62` Load Testing
- Gate 4 evidence consolidation / sign-off capture

Why last:
- `P4-62` depends on production deployment (`P4-60`).
- Gate 4 sign-off should be captured after security, accessibility, CI/CD, deployment, and load evidence are all current.

Batch-specific gate checks:
- k6 load scenarios execute against deployed environment with documented results and bottlenecks.
- Final Gate 4 checklist is fully marked complete with evidence links/paths.

---

## Gate 4 Checklist (Canonical Owner)

Formal Gate 4 sign-off requires all of the following:
- [x] RLS policies enabled and tested on all tenant-scoped tables (`P4-55`) — PR #14, `05a5691`
- [x] RBAC matrix has 100% test coverage across role × community_type × resource combinations (`P4-57`) — PR #17, 378 cells covered
- [x] Integration test suite passes with >80% code coverage (`P4-58`) — PR #18, 4 flow suites
- [x] Dependency scan reports no critical/high vulnerabilities (`P4-56`) — PR #16, 3 dev-only findings
- [x] Accessibility audit passes WCAG 2.1 AA baseline (`P4-63`) — branch `codex/p4-63-64-batch-c`, 9 axe-core tests, docs at `docs/ACCESSIBILITY.md`
- [ ] Merge-gate verification commands and evidence are captured in a timestamped artifact under `docs/audits/`

Recommended pre-signoff command bundle (to finalize when Batch D/E land):
```bash
pnpm lint
pnpm typecheck
pnpm test
scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate
scripts/with-env-local.sh pnpm seed:verify
scripts/with-env-local.sh pnpm --filter @propertypro/db test:integration
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts --coverage
pnpm audit --audit-level=high
```

---

## Phase 4 Invariants Checklist

Every Phase 4 task must satisfy:
- [ ] No `any` and no `@ts-ignore`.
- [ ] Every API route uses `withErrorHandler`.
- [ ] Tenant/role access control remains enforced at query layer (not UI-only).
- [ ] Multi-tenant isolation regressions are covered by tests when touching auth/data boundaries.
- [ ] Drizzle migration history (`meta/_journal.json` + snapshots) remains in lockstep.
- [ ] RLS changes are additive/reviewable and tested against both tenant and service-role access paths.
- [ ] Compliance-relevant mutations continue to call `logAuditEvent`.

---

## Phase 4 Exit Verification (Internal)

Run when all Phase 4 base tasks and Gate 4 evidence items are complete:
- [ ] 10/10 base Phase 4 tasks complete in this file.
- [ ] `pnpm build` clean.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean.
- [ ] `pnpm test` clean.
- [ ] Env-dependent verification commands run via `scripts/with-env-local.sh` (local verification wrapper).
- [ ] `pnpm --filter @propertypro/db db:migrate` clean.
- [ ] `pnpm seed:verify` clean.
- [ ] `pnpm --filter @propertypro/db test:integration` clean.
- [ ] `pnpm exec vitest run --config apps/web/vitest.integration.config.ts --coverage` clean (`apps/web/src` coverage evidence for `P4-58`).
- [ ] `pnpm plan:verify:phase4` clean.
- [ ] `pnpm perf:check` clean.
- [ ] `pnpm audit --audit-level=high` clean.
- [ ] Evidence artifact captured under `docs/audits/` with timestamped command outputs and Gate 4 checklist sign-off evidence.

Evidence commands:
```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate
scripts/with-env-local.sh pnpm seed:verify
scripts/with-env-local.sh pnpm --filter @propertypro/db test:integration
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts --coverage
pnpm plan:verify:phase4
pnpm perf:check
pnpm audit --audit-level=high
```

---

## Key Risks and Notes

Highest Phase 4 risks:
- RLS misconfiguration causing either cross-tenant leakage or production breakage (overly restrictive policies).
- RBAC matrix drift between declarative policy docs and route/query enforcement.
- Coverage-target work causing brittle or slow integration suites that block CI throughput.
- Deployment-time env/config drift (Supabase/Stripe/Resend/Sentry/Vercel) surfacing only after `main` merges.

Execution notes:
- Gate 4 should be treated as a formal evidence gate, not an implicit "tests green" checkpoint.
- Keep DB and app hardening evidence tightly paired (RLS + route/query tests) to avoid false confidence.
