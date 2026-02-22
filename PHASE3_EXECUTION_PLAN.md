# Phase 3 Execution Plan - PM, Mobile, and Ops Hardening

**Date:** 2026-02-21
**Last Updated:** 2026-02-22
**Author:** PropertyPro Engineering
**Status:** Complete on `main` (10/10 base Phase 3 tasks complete; hardening tasks complete; Phase 3 exit verification passed)
**Prerequisites:** Phase 0 complete, Gate 1 signed off, Phase 1 complete with Gate 2 closed, Phase 2 complete with Gate 3 closed

---

## Execution Progress Log (Single-Writer)

Rules:
- Update this section on `main` only (never from feature worktrees).
- Append one line per completed milestone with date, branch, and commit hash.
- Do not edit historical lines; append new lines only.

Milestones:
- [2026-02-21] Phase 3 execution branch/workstream initialized (`codex/phase3-execution-plan`) - created canonical Phase 3 tracker, verification script, CI consistency workflow, and performance budget command/workflow scaffolding.
- [2026-02-21] `P3-PRE-01` spec/path normalization completed - corrected stale Phase 3 spec paths to `apps/web/src/...`, aligned PM portfolio source-of-truth to `user_roles`, normalized maintenance status/priority contract language, and clarified `P3-54` as final performance pass.
- [2026-02-21] `P3-PRE-03`/`P3-PRE-05` baseline safeguards completed - added unscoped PM portfolio query helper under `@propertypro/db/unsafe` and expanded middleware protected path prefixes for planned `/pm`, `/mobile`, `/contracts`, and `/audit-trail` surfaces.
- [2026-02-21] Batch B complete (`P3-45`, `P3-46`) - PM portfolio dashboard and community switcher shipped and Agent C verified (`codex/p3-batch-b-pm-core`).
- [2026-02-21] Batch C complete (`P3-47`, `P3-48`, `P3-49`) - white-label branding, PhoneFrame mobile preview, and mobile layout/pages shipped (`codex/p3-batch-b-pm-core`).
- [2026-02-22] Batch E complete (`P3-52`, `P3-53`) - contract/vendor tracking and audit trail viewer merged via PR #9 (`baf4bb4`, `codex/p3-batch-b-pm-core`) out of planned sequence before Batch D.
- [2026-02-22] Batch E post-merge hardening complete - audit trail CSV cap/redaction hardening merged via PR #10 (`379494c`, `claude/gracious-ptolemy`).
- [2026-02-22] Batch D complete (`P3-50`, `P3-51`) - maintenance request submission and admin inbox merged via PR #11 (`c266565`, `codex/p3-batch-b-pm-core`).
- [2026-02-22] `P3-PRE-02` schema compatibility contract completed - reconciled orphan contracts-index migration into `0019`, restored Drizzle journal/snapshot lockstep, and fixed fresh-bootstrap `0018` maintenance migration breakpoints/enum default application on `db:migrate` (`codex/p3-phase3-closeout`).
- [2026-02-22] Batch F complete (`P3-54`) - final performance closeout verification passed (`pnpm build` + `pnpm perf:check`) with no additional Phase 3 code changes required (`codex/p3-phase3-closeout`).
- [2026-02-22] Phase 3 exit verification completed - build/typecheck/lint/tests/integration preflight/plan verifier/perf check all passed; evidence captured in `docs/audits/phase3-exit-evidence-2026-02-22.md` (`codex/p3-phase3-closeout`).
- [2026-02-22] Phase 4 / Gate 4 pre-deployment validation kickoff baseline executed - local `main` fast-forwarded to PR #12 merge commit `90d6e17`, closeout branch/worktree (`codex/p3-phase3-closeout`) deleted locally/remotely, and recommended post-merge sanity checks rerun on `main` (`pnpm plan:verify:phase3`, `set -a; source .env.local; set +a; pnpm --filter @propertypro/db db:migrate`).

Current cursor:
- 10/10 base tasks complete (P3-45 through P3-54 — Batches B, C, D, E, and F done).
- Phase 4 / Gate 4 pre-deployment validation kickoff baseline is complete (main sync, closeout cleanup, and recommended post-merge sanity checks on `main`).
- Next: Phase 4 planning/execution and formal Gate 4 pre-deployment checklist completion.
- Gate 3 remains closed; Gate 4 remains the official pre-deployment gate in Phase 4.

Cross-phase merge guard:
- Any feature branch more than 20 commits behind `origin/main` is non-mergeable until rebased/recreated.
- CI enforcement is active via `.github/workflows/branch-freshness-guard.yml`.

---

## Phase 3 Tracking Model (Canonical)

- Base tasks counted in denominator (`10` total): `P3-45`, `P3-46`, `P3-47`, `P3-48`, `P3-49`, `P3-50`, `P3-51`, `P3-52`, `P3-53`, `P3-54`.
- Pre-phase hardening tasks not counted in denominator: `P3-PRE-01`, `P3-PRE-02`, `P3-PRE-03`, `P3-PRE-04`, `P3-PRE-05`.
- Canonical source for Phase 3 ratio math is this file. `IMPLEMENTATION_PLAN.md` references Phase 3 status context but does not own ratio accounting.

---

## Mandatory Hardening and Prerequisites

### P3-PRE-01 - Spec and Path Normalization
- **Status:** Complete (2026-02-21)
- **Objective:** Eliminate stale path references and normalize contradictory Phase 3 contracts before implementation starts.
- **Required outcomes:**
- Phase 3 specs reference `apps/web/src/...` paths and current route groups.
- PM portfolio contract uses `user_roles.role='property_manager_admin'` as source-of-truth.
- Maintenance status/priority contract is canonicalized with backward-compatible aliases.
- Mobile meetings tab behavior is explicitly tied to feature-gate semantics.
- `P3-54` is documented as a final pass over all shipped Phase 3 surfaces.

### P3-PRE-02 - Schema Compatibility Contract
- **Status:** Complete (2026-02-22)
- **Objective:** Safely evolve existing live schema (especially `maintenance_requests`) without breaking seeded or existing data.
- **Required outcomes:**
- Migrations are additive and backward-safe.
- Legacy maintenance values (`open`, `normal`) remain readable via compatibility mapping.
- Drizzle migration files and `meta/_journal.json` remain in lockstep.
- No direct production SQL edits outside Drizzle migration history.

### P3-PRE-03 - Cross-Community Read Boundary for PM Portfolio
- **Status:** Complete (2026-02-21)
- **Objective:** Enable portfolio-level PM reads via tightly scoped unscoped helper(s), while preserving app-level scoped-query default.
- **Required outcomes:**
- Unscoped PM helper exposed only through `@propertypro/db/unsafe`.
- No raw ORM imports in runtime app code outside approved allowlist.
- Scoped DB access guard remains authoritative.

### P3-PRE-04 - DevOps Guardrails
- **Status:** Complete (2026-02-21)
- **Objective:** Make Phase 3 planning and performance guardrails enforceable in CI.
- **Required outcomes:**
- `pnpm plan:verify:phase3` script exists and is wired to CI.
- `pnpm perf:check` command exists and has dedicated CI workflow.
- Documentation and verification outputs are deterministic and review-friendly.

### P3-PRE-05 - Security Route Coverage Baseline
- **Status:** Complete (2026-02-21)
- **Objective:** Ensure planned new protected route families are covered by middleware auth/tenant flow.
- **Required outcomes:**
- Middleware protected prefixes include planned `/pm`, `/mobile`, `/contracts`, `/audit-trail` paths.
- New routes inherit request tracing and tenant/header anti-spoofing behavior.

---

## Phase 3 Snapshot

Completed base Phase 3 tasks on `main`:
- `P3-45` PM Portfolio Dashboard
- `P3-46` PM Community Switcher
- `P3-47` White-Label Branding
- `P3-48` Phone Frame Mobile Preview
- `P3-49` Mobile Layouts
- `P3-50` Maintenance Request Submission
- `P3-51` Maintenance Request Admin
- `P3-52` Contract and Vendor Tracking
- `P3-53` Audit Trail Viewer
- `P3-54` Performance Optimization

Remaining base implementation tasks:

Count check: 10 completed + 0 remaining = 10 base tasks.

Remaining mandatory hardening tasks:

---

## Batch Execution Plan

Gate failure protocol:
"If a batch fails its exit gate: (1) do not merge to `main`; (2) fix on the feature branch; (3) if fix reveals an upstream design flaw, land a focused hotfix on `main` first, then rebase/recreate current branch; (4) escalate to replanning if rework exceeds half-day scope."

### Batch A - Contracts and Safety Foundations
Tasks:
- `P3-PRE-01`, `P3-PRE-02`, `P3-PRE-03`, `P3-PRE-04`, `P3-PRE-05`

Exit gate:
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration`

### Batch B - PM Core
Tasks:
- `P3-45` PM Portfolio Dashboard
- `P3-46` PM Community Switcher

Batch-specific gate checks:
- PM user sees only communities where they hold `property_manager_admin` role.
- Context switch revalidates membership server-side before data read.
- Missing/removed community IDs fall back gracefully without leaking data.

### Batch C - Branding and Mobile Shell
Tasks:
- `P3-47` White-Label Branding
- `P3-48` Phone Frame Mobile Preview
- `P3-49` Mobile Layouts

Batch-specific gate checks:
- Branding upload validates image magic bytes and file size.
- Same-origin iframe retains auth context.
- Mobile meetings tab behavior matches documented feature gate contract.
- Touch targets and safe-area behavior validated.

### Batch D - Maintenance Vertical
Tasks:
- `P3-50` Maintenance Request Submission
- `P3-51` Maintenance Request Admin

Batch-specific gate checks:
- Status transition graph enforced server-side.
- Resident endpoints never expose internal notes.
- Resident read scope is requester-owned requests only.
- Media-processing failures are non-destructive and observable.

### Batch E - Contracts and Audit Viewer
Tasks:
- `P3-52` Contract and Vendor Tracking
- `P3-53` Audit Trail Viewer

Batch-specific gate checks:
- Contract features gated off for apartment communities.
- Bid embargo respected until close date.
- Audit CSV export sanitizes formula-injection vectors.

### Batch F - Performance Closeout
Task:
- `P3-54` Performance Optimization

Batch-specific gate checks:
- Core Web Vitals targets validated in representative flows.
- Bundle budget checks pass (`pnpm perf:check`).
- Dynamic import/lazy-load assertions are present for heavy surfaces.
- No regression in integration suites.

---

## Phase 3 Invariants Checklist

Every Phase 3 task must satisfy:
- [ ] All tenant-scoped data access uses `createScopedClient(communityId)` unless a documented unsafe helper exception applies.
- [ ] Every API route uses `withErrorHandler`.
- [ ] Every compliance-relevant mutation logs via `logAuditEvent`.
- [ ] No `any` and no `@ts-ignore`.
- [ ] Query-layer access control is enforced for tenant and role boundaries.
- [ ] Upload endpoints enforce magic-bytes validation and size limits.
- [ ] New non-transactional emails include `List-Unsubscribe` headers.
- [ ] New protected route families are covered by middleware auth/tenant checks.
- [ ] New runtime code passes scoped DB access guard (`pnpm guard:db-access`).

---

## Phase 3 Exit Verification (Internal)

Run when all Phase 3 base tasks and hardening tasks are complete:
- [x] 10/10 base tasks complete in this file.
- [x] Hardening tasks complete.
- [x] `pnpm build` clean.
- [x] `pnpm typecheck` clean.
- [x] `pnpm lint` clean.
- [x] `pnpm test` clean.
- [x] `set -a; source .env.local; set +a; pnpm test:integration:preflight` clean.
- [x] `pnpm plan:verify:phase3` clean.
- [x] `pnpm perf:check` clean.
- [x] Evidence artifact captured under `docs/audits/` with timestamped command outputs.

Evidence commands:
```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
set -a; source .env.local; set +a; pnpm test:integration:preflight
pnpm plan:verify:phase3
pnpm perf:check
```

---

## External Dependencies and Risks

Open external prerequisites:
- Supabase storage and DB credentials for integration environments.
- Resend API key for notification and status-update flows.
- Stripe keys/webhook secret remain required for subscription-guarded mutation paths.

Highest Phase 3 risks:
- PM portfolio reads accidentally bypassing membership constraints.
- Maintenance status migration drift (`open`/`normal` legacy values) causing runtime inconsistencies.
- Contracts alert scheduling errors around timezone edges.
- Performance regressions as new PM/mobile bundles are introduced.

---

## Assumptions and Defaults

- PM portfolio membership source-of-truth remains `user_roles` with role `property_manager_admin`.
- Community switch recency is device-local (browser storage), not DB-backed.
- Native mobile app remains out of scope in Phase 3; `/mobile/*` is web-only.
- `urgent` is canonical highest maintenance priority; `emergency` remains accepted as write alias.
- Phase 3 uses an internal closeout checklist; official Gate 4 remains the pre-deployment gate in Phase 4.
