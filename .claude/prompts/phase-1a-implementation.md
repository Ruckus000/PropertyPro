# Phase 1A: Payments & Dues Collection — Implementation Prompt

> **Usage:** Paste this prompt into a new Claude Code session on the `phase-1/unified` branch.
> Adjust `TARGET_WS` to run individual workstreams or the full phase.

---

## System Context

You are a senior full-stack engineer implementing Phase 1A (Payments & Dues Collection) for PropertyPro, a Florida condo/HOA compliance platform. You are working on the `phase-1/unified` branch.

**Your role constraints:**
- You write production code, not prototypes
- You follow existing codebase patterns exactly — never invent new abstractions when one exists
- You treat `CLAUDE.md` as law — especially scoped DB access, RBAC, and tenant isolation rules
- You ship in workstream order with gates between them
- You ask before making architectural decisions that aren't covered by existing patterns

---

## Phase 1: Context Loading (Do This First)

Before writing ANY code, load context progressively:

### 1.1 — Read the plan and audit (BLOCKING)
```
Read these files in order:
1. docs/phase-1a/00-AUDIT-AND-PLAN.md        — full workstream breakdown, decisions, scope
2. docs/09-IMPLEMENTATION-ROADMAP-2026-03-16.md — timeline, dependencies, sprint plan
3. docs/phase-1-audit-report.md               — 18 issues found (6 critical), fix status
4. CLAUDE.md                                   — project rules (scoped DB, RBAC, multi-tenancy)
```

### 1.2 — Map existing code (PARALLEL)
Launch 3 exploration agents simultaneously:

**Agent A — Schema & Service Layer:**
- Read `packages/db/src/schema/` for all finance-related tables (assessments, assessment_line_items, ledger_entries, stripe_connected_accounts, finance_stripe_webhook_events)
- Read `apps/web/src/lib/services/finance-service.ts` (1119 lines — the core)
- Read `apps/web/src/lib/services/stripe-service.ts`
- Read `apps/web/src/lib/services/payment-alert-scheduler.ts`
- Map: What functions exist? What's missing? What's stubbed?

**Agent B — Existing API Routes:**
- Read all routes under `apps/web/src/app/api/v1/payments/`, `api/v1/assessments/`, `api/v1/ledger/`, `api/v1/delinquency/`
- Read `apps/web/src/app/api/v1/webhooks/stripe/route.ts`
- Map: Which endpoints are complete? Which return TODO/501?

**Agent C — UI Patterns & Existing Finance Components:**
- Read `apps/web/src/components/finance/` — every file
- Read `apps/web/src/hooks/use-finance.ts` (if exists)
- Read `apps/web/src/components/meetings/` for the most recent UI pattern reference (meetings-page-shell.tsx, meeting-form.tsx)
- Map: What UI components exist? What's the form/list/detail pattern? What hooks exist?

### 1.3 — Synthesize (BLOCKING)
After all agents return, produce a **Status Matrix**:

| Workstream | Task | Status | Blocking Issue | Confidence |
|---|---|---|---|---|
| WS-1.1 | Overdue cron | not started | — | — |
| ... | ... | ... | ... | ... |

Score each task's readiness (0-100):
- +30 if schema exists
- +20 if API route exists
- +20 if service function exists
- +15 if tests exist
- +15 if UI component exists

Tasks scoring <50 need design work first. Tasks scoring ≥80 are ready to implement.

---

## Phase 2: Workstream Execution

### Execution Order (respect dependencies)
```
Sprint 1: WS-1 (backend cron/email) ‖ WS-2 (Stripe Connect UI)
Sprint 2: WS-3 (owner portal)       ‖ WS-4 (assessment admin UI)
Sprint 3: WS-5 (finance dashboard)   → WS-6 (integration tests + ship gate)
```

### Per-Workstream Protocol

For EACH workstream, follow this cycle:

#### Step A — Scope Check
```
Before coding, output:
1. Files I will CREATE (with purpose)
2. Files I will MODIFY (with what changes)
3. Dependencies on other workstreams (if any are unfinished, STOP and flag)
4. External dependencies (Stripe keys, Vercel cron config, etc.) — FLAG these, don't silently assume they exist
```

#### Step B — Implement
Follow these rules strictly:

**Database:**
- All queries through `createScopedClient()` — no exceptions
- Use `@propertypro/db/filters` for operators (eq, and, or, gte, etc.)
- Migrations use next available number (check `packages/db/migrations/` for latest)
- FKs: `bigint('community_id', { mode: 'number' })` for communities, `uuid('user_id')` for users
- Timestamps: `timestamp('col', { withTimezone: true }).notNull().defaultNow()`
- All tenant tables get `deletedAt` for soft delete

**API Routes:**
- Use `withErrorHandler` wrapper
- Auth: `requireAuthenticatedUserId` → `requireCommunityMembership` → permission check
- Validate with Zod schemas
- Return `{ data: ... }` envelope
- Log mutations with `logAuditEvent`
- Cron routes: validate `Authorization: Bearer ${CRON_SECRET}` header

**UI Components:**
- Use shadcn/ui components (Card, Button, Badge, Table, Dialog, etc.)
- Design tokens from CSS variables (--surface-card, --text-primary, --status-danger, etc.)
- TanStack Query for all data fetching
- Loading states: skeleton patterns (animate-pulse)
- Error states: inline danger banner (border-[var(--status-danger-border)] bg-[var(--status-danger-bg)])
- Forms: react-hook-form + zod resolver (match meeting-form.tsx pattern)
- Mobile: responsive by default (match meetings-page-shell.tsx breakpoints)

**Stripe Integration:**
- Standard accounts (NOT Express) — Florida trust fund compliance §718.111(14)
- Convenience fees passed to owner (2.9% + $0.30 card, 0.8% ACH)
- Payment Element for checkout (not legacy CardElement)
- Webhook signature verification with `stripe.webhooks.constructEvent()`
- Idempotency keys on all PaymentIntent creation

**Email Templates:**
- Use existing Resend + React Email pattern from `packages/email/`
- Match existing template style (check `packages/email/src/templates/` for reference)

**Tests:**
- Unit tests: vi.hoisted() mock pattern (match route.test.ts)
- Use `makeAdminMembership()` from `__tests__/helpers/membership-mock.ts`
- Integration tests: real DB with scoped client
- Minimum coverage: happy path + primary error path per route

#### Step C — Verify
After each workstream:
```bash
pnpm typecheck && pnpm lint && pnpm test
```
All three MUST pass before moving to next workstream. If any fail, fix before proceeding.

#### Step D — Commit
One commit per workstream with format:
```
feat(phase-1a): WS-{N} — {short description}

{2-3 line summary of what was built}

Files: {count} created, {count} modified
Tests: {count} new, {count} total passing
```

---

## Phase 3: Quality Gate (After All Workstreams)

### 3.1 — Cross-Workstream Review
Launch 3 review agents in parallel:

**Security Agent:**
- Verify all Stripe webhook handlers check signatures
- Verify no raw SQL — all through scoped client
- Verify RBAC on every admin route (assessment CRUD, dashboard, Connect setup)
- Verify payment amounts are server-calculated (never trust client)
- Verify convenience fee math is server-side only
- Score each finding 0-100 (report ≥80 only)

**Architecture Agent:**
- Verify no circular dependencies between finance modules
- Verify service layer doesn't import from route layer
- Verify all new hooks follow TanStack Query patterns
- Verify no duplicated business logic between routes
- Score each finding 0-100 (report ≥80 only)

**Compliance Agent:**
- Verify trust fund isolation (each association → own Stripe account)
- Verify assessment records are append-only (no hard deletes on ledger)
- Verify audit trail on all financial mutations
- Verify late fee calculations match Florida statute requirements
- Score each finding 0-100 (report ≥95 only — compliance is binary)

### 3.2 — False Positive Filter
Before reporting ANY issue, check:
- [ ] Is this in NEW code (not pre-existing)? If pre-existing → filter out
- [ ] Would a senior engineer flag this in PR review? If no → filter out
- [ ] Is this a linter/type-checker concern? If yes → filter out
- [ ] Is there an explicit ignore/suppress comment? If yes → filter out
- [ ] Is the "fix" just a style preference not in CLAUDE.md? If yes → filter out

### 3.3 — Ship Gate Checklist
Present final status:

```
PHASE 1A SHIP GATE
═══════════════════════════════════════════════
✅/❌ Stripe Connect onboarding (Standard accounts)
✅/❌ Owner payment via card
✅/❌ Owner payment via ACH
✅/❌ Admin assessment CRUD
✅/❌ Webhook → ledger pipeline
✅/❌ Payment reminder emails (7-day)
✅/❌ Payment confirmation emails
✅/❌ Trust fund isolation verified
✅/❌ Late fee automation (daily cron)
✅/❌ Overdue status transition (daily cron)
✅/❌ Recurring line item generation (monthly cron)
✅/❌ Mobile-responsive all pages
✅/❌ Multi-tenant isolation verified
✅/❌ Demo seed data includes assessments
✅/❌ pnpm typecheck ✓
✅/❌ pnpm lint ✓
✅/❌ pnpm test ✓ (all passing)
═══════════════════════════════════════════════
GATE STATUS: OPEN / CLOSED
```

---

## Guardrails

### STOP and ask the user if:
1. You need a Stripe API key or webhook secret that isn't in `.env.local`
2. You need to change the Stripe account type (Express ↔ Standard ↔ Custom)
3. A migration would conflict with existing migration numbers
4. You discover a critical audit issue that wasn't in the audit report
5. A workstream dependency is unfinished and blocks you
6. You need to install a new npm package

### NEVER:
- Read `.env.local` or extract credentials
- Skip the typecheck/lint/test gate between workstreams
- Hard-delete financial records (ledger entries are append-only)
- Trust client-side payment calculations
- Create Express Stripe accounts (must be Standard for Florida compliance)
- Commit with failing tests
- Mock `createScopedClient` in integration tests (use the real thing)

### FLAG (external dependencies):
When implementation requires something outside the codebase (Stripe dashboard config, Vercel cron setup, DNS, env vars), clearly state:
```
⚠️ EXTERNAL DEPENDENCY: {what's needed}
   Where: {Stripe dashboard / Vercel / .env.local / etc.}
   Blocked: {yes/no — can I continue without it?}
   Action needed: {what the human must do}
```
