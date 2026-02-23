# Phase 4 Execution Plan - Hardening, Deployment, and Gate 4 Closeout

**Date:** 2026-02-22
**Author:** PropertyPro Engineering
**Status:** Kickoff in progress (0/10 base Phase 4 tasks complete; Gate 4 is the active formal milestone)
**Prerequisites:** Phase 0 complete, Gate 1 signed off, Phase 1 complete with Gate 2 closed, Phase 2 complete with Gate 3 closed, Phase 3 complete with exit verification captured

---

## Execution Progress Log (Single-Writer)

Rules:
- Update this section on `main` only (never from feature worktrees).
- Append one line per completed milestone with date, branch, and commit hash.
- Do not edit historical lines; append new lines only.

Milestones:
- [2026-02-22] Phase 4 execution branch/workstream initialized (`codex/p4-gate4-predeploy-validation`) - created canonical Phase 4 tracker, updated implementation status snapshots, and recorded Gate 4 pre-deployment kickoff baseline after Phase 3 closeout merge (`90d6e17`).

Current cursor:
- 0/10 base Phase 4 tasks complete (`P4-55` through `P4-64`).
- Gate 4 pre-deployment validation is the active milestone; kickoff baseline checks on `main` are complete (Phase 3 plan verifier + DB migrate).
- Next: Execute Batch A (`P4-55`, `P4-56`) and establish the DB/application security baseline for Gate 4.

---

## Phase 4 Tracking Model (Canonical)

- Base tasks counted in denominator (`10` total): `P4-55`, `P4-56`, `P4-57`, `P4-58`, `P4-59`, `P4-60`, `P4-61`, `P4-62`, `P4-63`, `P4-64`.
- Official quality gate in this phase: `GATE 4` (pre-deployment verification).
- Canonical source for Phase 4 ratio math, batch sequencing, and Gate 4 closeout checklist is this file.

---

## Phase 4 Scope Snapshot

Phase 4 base tasks:
- `P4-55` Row-Level Security
- `P4-56` Security Audit
- `P4-57` RBAC Audit
- `P4-58` Integration Tests
- `P4-59` CI/CD Pipeline
- `P4-60` Production Deployment
- `P4-61` Demo Reset Script
- `P4-62` Load Testing
- `P4-63` Accessibility Audit
- `P4-64` Data Export

Count check: 0 completed + 10 remaining = 10 base tasks.

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
- [ ] RLS policies enabled and tested on all tenant-scoped tables (`P4-55`)
- [ ] RBAC matrix has 100% test coverage across role × community_type × resource combinations (`P4-57`)
- [ ] Integration test suite passes with >80% code coverage (`P4-58`)
- [ ] Dependency scan reports no critical/high vulnerabilities (`P4-56`)
- [ ] Accessibility audit passes WCAG 2.1 AA baseline (`P4-63`)
- [ ] Merge-gate verification commands and evidence are captured in a timestamped artifact under `docs/audits/`

Recommended pre-signoff command bundle (to finalize when Batch D/E land):
```bash
pnpm lint
pnpm typecheck
pnpm test
set -a; source .env.local; set +a; pnpm test:integration:preflight -- --coverage
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

## Key Risks and Notes

Highest Phase 4 risks:
- RLS misconfiguration causing either cross-tenant leakage or production breakage (overly restrictive policies).
- RBAC matrix drift between declarative policy docs and route/query enforcement.
- Coverage-target work causing brittle or slow integration suites that block CI throughput.
- Deployment-time env/config drift (Supabase/Stripe/Resend/Sentry/Vercel) surfacing only after `main` merges.

Execution notes:
- Gate 4 should be treated as a formal evidence gate, not an implicit "tests green" checkpoint.
- Keep DB and app hardening evidence tightly paired (RLS + route/query tests) to avoid false confidence.
