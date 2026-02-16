# Phase 2 Execution Plan - Multi-Tenancy, Billing, and Onboarding

**Date:** 2026-02-16  
**Author:** PropertyPro Engineering  
**Status:** In progress on `main` (9/16 base Phase 2 tasks complete; mandatory pre-batch hardening progress is 2/3 complete)  
**Prerequisites:** Phase 0 complete, Gate 1 signed off, Phase 1 complete with Gate 2 closed

---

## Execution Progress Log (Single-Writer)

Rules:
- Update this section on `main` only (never from feature worktrees).
- Append one line per completed milestone with date, branch, and commit hash.
- Do not edit historical lines; append new lines only.

Milestones:
- [2026-02-13] Phase 2 kickoff landed on `main` - `P2-30` middleware/routing hardening completed (tenant resolution, anti-spoofing headers, token-route carve-out).
- [2026-02-13] Initial `P2-43` integration slice landed on `main` - baseline isolation harness and integration config added.
- [2026-02-14] Parallel Phase 2 batch merged and gate-passed on `main` - `P2-31`, `P2-32`, `P2-32a`, `P2-37`, `P2-40`, `P2-41`, `P2-42`.
- [2026-02-15] `P2-43` merged (`feat/p2-43-multi-tenant-isolation` -> `main`, merge `bbaade5`) with expanded route isolation coverage (`aac4bbb`).
- [2026-02-16] Spec path normalization completed across active Phase 2 specs under `specs/phase-2-multi-tenancy/` (removed legacy `apps/api` references).
- [2026-02-16] `P2-PRE-03` scoped-only DB enforcement completed on `main` (`main`, commit `226b4861ff2a4c67a654979bd1235ec9770efd58`; unsafe namespace, runtime import guard, and CI workflow).

Current cursor:
- Run remaining implementation chain: `P2-33` -> `P2-33.5` -> `P2-34/P2-34a` -> `P2-35` -> (`P2-38`, `P2-39`).
- Run apartment track in parallel where dependencies permit: `P2-36` -> `P2-44` and then `P2-38`.

---

## Phase 2 Tracking Model (Canonical)

- Base tasks counted in denominator (`16` total): `P2-30`, `P2-31`, `P2-32`, `P2-32a`, `P2-33`, `P2-34`, `P2-35`, `P2-36`, `P2-37`, `P2-38`, `P2-39`, `P2-40`, `P2-41`, `P2-42`, `P2-43`, `P2-44`.
- Subtasks not counted in denominator: `P2-34a`.
- Hardening tasks not counted in denominator: `P2-33.5`, `P2-PRE-02`, `P2-PRE-03`.
- Canonical source for base-task ratio math is this file. `IMPLEMENTATION_PLAN.md` references this status but does not maintain a separate base-task ratio.

---

## Mandatory Hardening and Prerequisites

### P2-33.5 - Billing and Provisioning Schema Migration (Required before P2-34)
- **Status:** Not Started
- **Objective:** One migration only, schema-only, no business-logic code mixed in.
- **Migration scope (single Drizzle migration):**
- Add columns on `communities`:
- `stripe_customer_id TEXT`
- `stripe_subscription_id TEXT`
- `subscription_plan TEXT`
- `subscription_status TEXT`
- Add table `stripe_webhook_events`:
- `event_id TEXT PRIMARY KEY`
- `received_at TIMESTAMPTZ DEFAULT now()`
- `processed_at TIMESTAMPTZ`
- Add table `provisioning_jobs`:
- `id BIGSERIAL PRIMARY KEY`
- `community_id BIGINT NULL REFERENCES communities(id)`
- `stripe_event_id TEXT UNIQUE`
- `status TEXT CHECK (status IN ('initiated','community_created','user_linked','checklist_generated','categories_created','preferences_set','email_sent','completed','failed'))`
- `last_successful_status TEXT CHECK (last_successful_status IS NULL OR last_successful_status IN ('community_created','user_linked','checklist_generated','categories_created','preferences_set','email_sent','completed'))`
- `started_at TIMESTAMPTZ`
- `completed_at TIMESTAMPTZ`
- `error_message TEXT`
- `retry_count INT DEFAULT 0`
- **Contract notes:**
- `status` is the operational state (`initiated`...`completed`, `failed`).
- `last_successful_status` stores only successful step checkpoints and never stores `initiated` or `failed`.
- Initial row at `initiated` must have `last_successful_status IS NULL`.
- `community_id` is intentionally nullable until `community_created` succeeds.
- **Exit gate:**
- `pnpm --filter @propertypro/db db:generate`
- `pnpm --filter @propertypro/db db:migrate`
- `pnpm --filter @propertypro/db test:integration`
- Confirm migration metadata chain is in sync (`packages/db/migrations/meta/_journal.json` + snapshot).

### P2-PRE-02 - Phase 2 Spec Path Normalization
- **Status:** Complete (2026-02-16)
- **Objective:** Eliminate stale `apps/api/src` references in remaining high-risk specs.
- **Completed scope:**
- `specs/phase-2-multi-tenancy/34-stripe-integration.md`
- `specs/phase-2-multi-tenancy/35-provisioning-pipeline.md`
- `specs/phase-2-multi-tenancy/37-lease-tracking.md`
- `specs/phase-2-multi-tenancy/41-email-notifications.md`
- `specs/phase-2-multi-tenancy/42-rate-limiting.md`
- `specs/phase-2-multi-tenancy/43-multi-tenant-isolation-tests.md`
- `specs/phase-2-multi-tenancy/44-apartment-demo-seed.md`
- **Verification command:**
```bash
! rg -n "apps/api/src|apps/api/" specs/phase-2-multi-tenancy/*.md
```

### P2-PRE-03 - Scoped-Only DB Access Enforcement
- **Status:** Complete (2026-02-16)
- **Objective:** Turn DB-scoping process guidance into a hard constraint.
- **Required implementation:**
- Keep root export (`@propertypro/db`) scoped-only for application access.
- Add explicit unsafe export path (example: `@propertypro/db/unsafe`) for deliberate unscoped access in rare cases (migration tooling, seed internals).
- Unsafe API naming should be explicit (`createUnscopedClient`) and code-reviewed as an exception.
- Add CI guard to block direct raw ORM usage in app runtime code.
- **CI guard (authoritative):**
```bash
pnpm guard:db-access
```
- **Exit gate:**
- `pnpm lint`
- `pnpm typecheck`
- Scoped DB access guard green on `main`.

---

## Phase 2 Snapshot

Completed base Phase 2 tasks on `main`:
- `P2-30` Subdomain Routing Middleware
- `P2-31` Marketing Landing Page
- `P2-32` Legal Pages
- `P2-32a` Document Extraction Status
- `P2-37` Lease Tracking
- `P2-40` Community Features Config
- `P2-41` Email Notifications
- `P2-42` Rate Limiting
- `P2-43` Multi-Tenant Isolation Tests

Remaining base implementation tasks:
- `P2-33` Self-Service Signup
- `P2-34/P2-34a` Stripe Integration + Payment Failure Handling
- `P2-35` Provisioning Pipeline
- `P2-36` Apartment Operational Dashboard
- `P2-38` Apartment Onboarding Wizard
- `P2-39` Condo Onboarding Wizard
- `P2-44` Apartment Demo Seed

Count check: 9 completed + 7 remaining = 16 base tasks.  
Open non-denominator subtask scope: `P2-34a`.

Remaining mandatory hardening tasks:
- `P2-33.5` Billing and provisioning schema migration

---

## P2-34a Policy Contract (Must Be Implemented Exactly)

### Grace period
- 14-day minimum grace period after first payment failure before any admin feature lockout.
- Rationale: aligns with statutory notice sensitivity; prevents silent compliance misses during billing turbulence.

### Degradation tiers
- Day 0 to Day 13 (`past_due`): public notices and owner document portal remain fully accessible; admin features remain enabled; billing warnings visible.
- Day 14 (`canceled`/enforced grace-lock): admin write operations lock (`uploads`, `meeting creation`, `announcement compose`, other mutation routes); owner portal remains read-only; public website and notices remain available.
- Day 30 (`delinquent long-tail mode`): keep public notices and owner document read access online; keep admin writes locked; expose reactivation + data export paths.

### Notification chain
- Day 0: email billing admin immediately on `invoice.payment_failed`.
- Day 3: second email + dashboard banner.
- Day 7: banner escalation to all board-level admins.
- Day 14: lock admin write features and send lockout notification.
- Day 30: final delinquency notice with reactivation + export guidance.

### Enforcement mechanism (server authoritative)
- Subscription degradation is enforced at API layer first; UI restrictions are secondary UX only.
- Admin mutation routes must call `requireActiveSubscriptionForMutation` (or equivalent shared guard) and return `403` with `subscription_required` on locked statuses.
- Public notices and owner document read access remain available per degradation policy.
- Webhook routes are explicitly exempt from subscription guard (`/api/v1/webhooks/*`) so billing recovery events can always process.

---

## P2-35 Provisioning State Machine Contract

Provisioning must be implemented as resumable state transitions backed by `provisioning_jobs.status` and `provisioning_jobs.last_successful_status`.

### Operational statuses
- `initiated`
- `failed`
- `community_created`
- `user_linked`
- `checklist_generated`
- `categories_created`
- `preferences_set`
- `email_sent`
- `completed`

### Step order (ordinal map for progression only)
- Use ordinal comparison for successful steps only:
- `community_created` = 0
- `user_linked` = 1
- `checklist_generated` = 2
- `categories_created` = 3
- `preferences_set` = 4
- `email_sent` = 5
- `completed` = 6
- `failed` is never part of the ordinal map.
- `initiated` is not a successful step checkpoint.

### Execution semantics
- Each provisioning step checks progression using `last_successful_status` ordinals, not lexical string comparison.
- Each successful step persists `status=<step>` and `last_successful_status=<step>` atomically.
- Retry never restarts from the beginning; it resumes from `last_successful_status`.
- Failure writes `status='failed'`, increments `retry_count`, and stores `error_message`.
- Failure does not overwrite `last_successful_status`.
- Retry action invokes the same provision function against existing job row.
- If `last_successful_status IS NULL`, retry resumes from `community_created`.
- If `last_successful_status = <step>`, retry resumes from the next ordered step after `<step>`.
- `status='failed'` is an error state, not a step index.

### Reference flow (pseudocode contract)
```ts
const STEP_SEQUENCE: ProvisioningStepSuccess[] = [
  'community_created',
  'user_linked',
  'checklist_generated',
  'categories_created',
  'preferences_set',
  'email_sent',
  'completed',
];

function nextStep(lastSuccessfulStatus: ProvisioningStepSuccess | null): ProvisioningStepSuccess {
  if (lastSuccessfulStatus == null) return STEP_SEQUENCE[0];
  const idx = STEP_SEQUENCE.indexOf(lastSuccessfulStatus);
  const nextIdx = Math.min(idx + 1, STEP_SEQUENCE.length - 1);
  return STEP_SEQUENCE[nextIdx];
}

async function provision(job: ProvisioningJob): Promise<void> {
  let step = nextStep(job.lastSuccessfulStatus);
  while (true) {
    await runStep(step, job); // updates status + last_successful_status on success
    if (step === 'completed') break;
    step = nextStep(step);
  }
}
```

### Public types and contracts
```ts
type ProvisioningStepSuccess =
  | 'community_created'
  | 'user_linked'
  | 'checklist_generated'
  | 'categories_created'
  | 'preferences_set'
  | 'email_sent'
  | 'completed';

type ProvisioningStatus = 'initiated' | ProvisioningStepSuccess | 'failed';
```

---

## Dependency-Driven Remaining Batches

Gate failure protocol:
"If a batch fails its exit gate: (1) do not merge to `main`; (2) fix on the feature branch; (3) if fix reveals a design flaw in a prior batch, create a hotfix branch from `main`, fix upstream first, merge it, then rebase current batch; (4) if design flaw requires >4 hours rework, escalate to a planning session before proceeding."

### Batch A - Foundations (post-hardening)
Tasks:
- `P2-33` Self-Service Signup
- `P2-36` Apartment Operational Dashboard

Why:
- `P2-33` unblocks Stripe and provisioning chain.
- `P2-36` unblocks apartment onboarding and demo chain.

Exit gate (generic):
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

Exit gate (batch-specific):
- Signup integration verifies reserved subdomains rejected (`admin`, `api`, `www`, `mobile`, `pm`, `app`, `dashboard`, `login`, `signup`, `legal`).
- Apartment dashboard feature gating verified through `CommunityFeatures` flags (no direct community-type checks in component code).

### Batch B - Billing and Apartment Demo
Tasks:
- `P2-34` + `P2-34a` Stripe + degradation policy implementation (depends on `P2-33` and `P2-33.5`)
- `P2-44` Apartment demo seed (depends on `P2-36`, `P2-37`, `P1-29`)

Why:
- Billing chain is critical path to provisioning.
- Demo seed can proceed in parallel once apartment dashboard is available.

Exit gate (generic):
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration`

Exit gate (batch-specific):
- Stripe webhook integration test sends `checkout.session.completed` with valid signature and verifies `communities.stripe_customer_id` updated.
- Same Stripe event sent twice verifies no duplicate side effects and confirms dedup via `stripe_webhook_events`.
- Webhook POST remains processable even while subscription is degraded/locked.
- Direct admin mutation API call in locked state returns `403` with `subscription_required`.
- Billing degradation tests confirm Day 14 admin-write lock while public notices + owner read access remain available.

### Batch C - Provisioning
Task:
- `P2-35` Provisioning pipeline state machine (depends on `P2-34`, `P2-34a`, `P2-33.5`)

Why:
- Blocks both onboarding wizards.
- Highest idempotency and failure-recovery risk in remaining Phase 2 scope.

Exit gate (generic):
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration`

Exit gate (batch-specific):
- Provisioning test for `condo_718` verifies all expected resources are created.
- Failure injection at step 3 verifies retry resumes from persisted `last_successful_status` (not step 1).
- Failure before first successful step (`last_successful_status IS NULL`) verifies retry starts at `community_created`.

### Batch D - Onboarding Completion
Tasks:
- `P2-38` Apartment onboarding wizard (depends on `P2-35`, `P2-36`, `P2-37`)
- `P2-39` Condo onboarding wizard (depends on `P2-35`, `P1-09`)

Why:
- Final user-facing closeout for Phase 2 onboarding flows.

Exit gate (generic):
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration`

Exit gate (batch-specific):
- Wizard persistence test covers step progression, abandonment at step 3, return flow, and state restoration.
- Condo onboarding Step 1 statutory upload verifies checklist generation behavior for both `condo_718` and `hoa_720`.

---

## Phase 2 Invariants Checklist

Every remaining Phase 2 task must satisfy:
- [ ] All DB access uses `createScopedClient(communityId)` for tenant-scoped data.
- [ ] Every API route is wrapped with `withErrorHandler`.
- [ ] Every compliance-relevant mutation logs via `logAuditEvent`.
- [ ] No `any` and no `@ts-ignore`.
- [ ] Community filtering is enforced at query layer, never UI-only.
- [ ] Cross-tenant isolation tests are added/updated for changed endpoints.
- [ ] Stripe webhook handlers are idempotent and signature-verified before processing.
- [ ] Webhook handlers fetch fresh Stripe state and tolerate out-of-order delivery.
- [ ] Subscription enforcement is API-authoritative (not UI-only) on admin mutation routes.
- [ ] Subscription enforcement explicitly exempts `/api/v1/webhooks/*`.
- [ ] Non-transactional email paths include `List-Unsubscribe`.
- [ ] Specs for active tasks must use corrected `apps/web` route/service paths (no `apps/api` paths).

---

## Known Limitations (Accepted for Phase 2)

- Rate limiting is in-memory and per-isolate (`apps/web/src/lib/middleware/rate-limiter.ts`). This mitigates casual abuse but is not distributed-attack grade. Redis-backed hardening is deferred.
- Tenant isolation is application-enforced (scoped client + middleware + integration tests), not DB-enforced via RLS yet. RLS remains a later hardening phase.
- Tenant cache in middleware is FIFO-bounded (`256` entries) rather than true LRU (`apps/web/src/middleware.ts`). This is acceptable at current scale; cache strategy hardening is deferred.

---

## Gate 3 Verification (Phase 2 Closeout)

Run after all Phase 2 tasks and hardening tasks are complete:
- [ ] All Phase 2 tests pass.
- [ ] Cross-tenant isolation tests pass.
- [ ] Subdomain routing resolves correctly in test environment.
- [ ] Stripe checkout -> webhook -> subscription flow works end-to-end.
- [ ] Provisioning pipeline creates community with required resources.
- [ ] Rate limiting returns `429` correctly.
- [ ] `pnpm build && pnpm typecheck` clean.
- [ ] `pnpm lint` clean.
- [ ] `pnpm plan:verify:phase2` clean.
- [ ] `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration` passes.

Evidence commands:
```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm plan:verify:phase2
pnpm test
set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration
```

---

## External Dependencies and Risks

Open external prerequisites for remaining Phase 2 work:
- Stripe keys and webhook secret configured for local and deploy environments.
- Resend API key configured for payment and system emails.
- Upstash Redis deferred; if enabled in Phase 2, document environment and rollout plan.

Highest remaining risks:
- `P2-34/P2-34a`: webhook ordering/idempotency and degradation policy correctness.
- `P2-35`: multi-step provisioning partial-failure recovery.
- `P2-38/P2-39`: onboarding state continuity and resume correctness.

---

## Migration Hygiene for Remaining Work

When remaining tasks introduce schema changes:
- Prefer one migration generation pass on `main` after merging a batch with schema edits.
- Keep Drizzle journal/snapshot metadata in lockstep with migration files.
- Do not patch production schema manually outside Drizzle migrations.

---

## Assumptions and Defaults

- `failed` is not ordered in progression logic and is never used in ordinal comparisons.
- Resume source of truth is `last_successful_status`; `status` communicates current operational state.
- Webhook routes are always exempt from subscription guard to preserve billing recovery flows.
- This correction pass updates planning and implementation contracts; it does not alter completed Phase 2 status reporting.
