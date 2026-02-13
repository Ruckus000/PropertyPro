# Phase 1 Execution Plan — Ralph Wiggum Technique

**Date:** 2026-02-11
**Author:** PropertyPro Engineering
**Status:** Phase 1 engineering implementation complete on `main`; Gate 2 code-verification closeout recorded (2026-02-13)
**Prerequisites:** Phase 0 complete, Gate 1 signed off

---

## Execution Progress Log (Single-Writer)

To prevent cross-worktree conflicts, treat this section as the only place to track live execution status.

Rules:
- Update this section on `main` only (never from feature worktrees).
- Append one line per completed milestone with date, branch, and commit hash.
- Do not edit historical lines; append new lines only.

Milestones:
- [2026-02-11] Batch 0 complete (`feature/p0-middleware-request-id-fix` → `main`, commit `391b329`) — middleware preserves incoming `x-request-id`.
- [2026-02-11] Gap remediation complete (`main`) — `AuditEventParams.communityId` aligned to `number`, migration/hygiene gates added, `.tsbuildinfo` untracked and ignored.
- [2026-02-11] Batch 0.5 audit logging foundation implemented on feature branch (`8b2a5dc`) and merged to `main` (`0c0bd22`).
- [2026-02-11] Batch 1 partial (`P1-27b`) implemented on feature branch (`0f0ed93`, `9e811f0`) and merged to `main` (`894f56c`).
- [2026-02-11] Verification gate checkpoint (`main`) — `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm --filter @propertypro/db test:integration` all passed.
- [2026-02-11] Batch 1 kickoff (`main`) — created worktrees/branches for remaining Batch 1 tasks (`P1-09`, `P1-11`, `P1-17`, `P1-18`, `P1-21`, `P1-22`, `P1-28`).
- [2026-02-11] Batch 1 execution pause (`main`) — background Claude runs hit permission prompts in worktrees and were rerun with non-interactive permissions.
- [2026-02-11] Batch 1 throttle checkpoint (`main`) — latest run stopped by usage limit reset at **4:00 PM America/New_York**; no new merges, WIP exists in `p1-09`, `p1-17`, `p1-18`, `p1-21`, `p1-22`, `p1-28`, while `p1-11` is still clean.
- [2026-02-11] Batch 1 merges complete (`main`) — merged `P1-28` (`40497ea`), `P1-22` (`3649149`), `P1-21` (`715abbf`), `P1-11` (`ab4aa2b`), `P1-17` (`7f06ec5`), `P1-18` (`fa0feac`), and `P1-09` (`9ba3dc8`).
- [2026-02-11] Batch 1 verification gate (`main`) — `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration` all passed after merges.
- [2026-02-12] Batch 1 red-findings remediation merged (`codex/p1-batch1-red-findings-remediation` → `main`, merge commit `18c356d`) — merge gate passed with `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and db integration tests; middleware auth split coverage (`401` API unauthenticated, `403` API unverified, page-route redirects) and route-level unauthenticated mutation rejection coverage were confirmed in test suite.
- [2026-02-12] Batch 2 kickoff unblocked (`main`) — Issue #2 (`communityId` membership authorization) remains intentionally deferred from remediation and is tracked as required security debt before Phase 1 Gate 2 sign-off.
- [2026-02-12] Batch 2 branch/worktree kickoff executed (`main`, commit `ae517d4`) — created `codex/p1-10-compliance-dashboard-ui`, `codex/p1-12-magic-bytes`, `codex/p1-13-text-extraction`, `codex/p1-16-meeting-management`, `codex/p1-19-csv-import`, `codex/p1-20-invitation-auth`, and `codex/p1-26-notification-preferences` on `../pp-worktrees/p1-10`, `../pp-worktrees/p1-12`, `../pp-worktrees/p1-13`, `../pp-worktrees/p1-16`, `../pp-worktrees/p1-19`, `../pp-worktrees/p1-20`, and `../pp-worktrees/p1-26`.
- [2026-02-12] Batch 2 partial merges landed on `main` — merged `P1-10` (`02409c9`), `P1-13` (`54afb8c`), `P1-19` (`dbc9cec`), and `P1-20` (`b2335fc`); remaining Batch 2 tasks are `P1-12`, `P1-16`, and `P1-26`.
- [2026-02-12] Batch 2 completion landed on `main` — merged remaining Batch 2 tasks (`P1-12`, `P1-16`, `P1-26`) and validated route/test integration.
- [2026-02-12] Issue #2 hardening implemented on `main` — shared community-membership authorization guard added across authenticated `/api/v1` mutation routes; authenticated non-member foreign-`communityId` mutations return `403` and member mutations preserve expected behavior.
- [2026-02-12] Migration reconciliation completed on `main` — Drizzle metadata chain aligned for manual sequencing (`0002_invitation_auth`, `0003_meetings`) and schema drift check now reports no pending generation.
- [2026-02-12] Batch 2 verification gate rerun (`main`) — `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration` passed (`17/17`).
- [2026-02-12] Batch 3 implementation landed (`main`, commit pending) — completed `P1-14`, `P1-17c`, `P1-23`, `P1-24`, and `P1-29`, including new tenant resolver utilities, document search API/query layer, announcement delivery logging, public website routes, resident dashboard, and demo seed script with `demo_seed_registry`.
- [2026-02-12] Batch 3 migration generation completed (`main`, commit pending) — generated `0004_boring_whistler` (adds `announcement_delivery_log`, `demo_seed_registry`, and document search GIN index) and confirmed `pnpm --filter @propertypro/db db:generate` is no-op post-generation.
- [2026-02-12] Batch 3 verification checkpoint (`main`, commit pending) — `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` passed; db integration rerun in this execution environment is blocked by DNS/network resolution (`ENOTFOUND aws-0-us-west-2.pooler.supabase.com`), so Gate 2 remains pending external rerun.
- [2026-02-12] Batch 3 verification rerun completed (`main`, commit pending) — `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration` all passed after seed compatibility updates for legacy db role/constraint drift (`6/6`, `20/20` integration).
- [2026-02-13] Gate 2 hardening follow-up completed (`main`, commit pending) — finalized scoped-query adoption and audit/read-path closeout (`seed:demo` switched to `tsx`, `selectFrom` added to scoped client, duplicate elevated-role checks removed, demo-seed assertions extended, invitation-flow integration smoke added), fixed download audit ordering to prevent false-positive `document_accessed` entries on URL-generation failure, and added regression coverage (`500` + no audit log when presign fails). Verification gate rerun passed: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (`545/545`), `pnpm --filter @propertypro/db test:integration` (`28/28`), and `pnpm seed:demo`.

Current cursor:
- Next actions: begin Phase 2 execution planning from `main` (starting with `P2-30` subdomain routing) while tracking environment-owned staging/production demo-seed execution.
- Gate note: Phase 1 task closeout and Gate 2 engineering verification are complete on `main`.

---

## Executive Summary

Phase 1 contains 22 tasks (P1-09 through P1-29, plus P1-17c) that build the compliance core: document management, meeting management, resident management, announcements, auth flows, and the compliance engine itself. The dependency graph permits significant parallelism — up to 8 tasks can run concurrently in the first batch.

This plan uses the Ralph Wiggum technique (iterative autonomous agent loops) with `git worktree` isolation to maximize throughput while preventing cross-task interference. Tasks are organized into 6 sequential batches. Within each batch, tasks run as parallel Ralph loops on isolated worktrees. Between batches, branches merge to `main` and a verification gate confirms integration before the next batch starts.

**Estimated minimum calendar time:** 6 batch cycles (not 21 sequential tasks).

---

## Platform Invariants Checklist

Every task implementing API routes or DB mutations must satisfy:

1. [ ] **Scoped client:** All queries use `createScopedClient(communityId)` from packages/db
2. [ ] **community_id filtering:** Never query without community context (throws TenantContextMissing)
3. [ ] **withErrorHandler:** Every API route wrapped in `withErrorHandler` from `apps/web/src/lib/api/error-handler.ts`
4. [ ] **logAuditEvent:** Every mutation (create/update/delete) calls `logAuditEvent` from `packages/db/src/utils/audit-logger.ts`
5. [ ] **No `any` or `@ts-ignore`:** Strict TypeScript
6. [ ] **Cross-tenant test:** Test that communityA cannot see communityB data

---

## Pre-Requisite: Middleware Bug Fix (Before Batch 1)

The `X-Request-ID` middleware (`apps/web/src/middleware.ts:25`) unconditionally overwrites incoming request IDs with `crypto.randomUUID()`. This breaks end-to-end tracing (load balancer → middleware → route handler → Sentry).

**Fix:** Preserve incoming `x-request-id` if present; generate only when absent.

```
Current:  response.headers.set('X-Request-ID', crypto.randomUUID());
Fixed:    response.headers.set('X-Request-ID', request.headers.get('x-request-id') || crypto.randomUUID());
```

**Why before Batch 1:** P1-27b (Audit Logging Middleware) and P1-22 (Session Management) both touch middleware and depend on request tracing. Fixing this after they're built means merge conflicts and rework.

**Verification:** Run the Sentry verification test with an explicit `x-request-id` header. Confirm the Sentry event's `request_id` tag matches the sent value, not a middleware-generated UUID.

---

## Dependency Graph

```
BATCH 0.5 (1 task — quick foundation, ~15 min)
═══════════════════════════════════════════════════
P1-27a Audit Logging Foundation ──────────┐
                                          │
                      ┌────── merge to main ──────────────┐
                      ▼                                    │
BATCH 1 (8 parallel — all deps are Phase 0 + P1-27a)
═══════════════════════════════════════════════════
P1-09  Compliance Engine ──────────────────┐
P1-11  Document Upload Pipeline ───────────┤
P1-17  Announcement System ────────────────┤
P1-18  Resident Management ────────────────┤
P1-21  Password Reset ────────────────────┤
P1-22  Session Management ─────────────────┤
P1-27b Audit Logging Middleware ───────────┤
P1-28  Email Infrastructure ───────────────┘
                                           │
                      ┌────── merge to main + verify ──────┐
                      ▼                                     │
BATCH 2 (7 parallel)                                        │
═══════════════════════════════════════════════════          │
P1-10  Compliance Dashboard UI ←── P1-09                    │
P1-12  Magic Bytes Validation  ←── P1-11                    │
P1-13  Text Extraction         ←── P1-11                    │
P1-16  Meeting Management      ←── P1-09                    │
P1-19  CSV Import              ←── P1-18                    │
P1-20  Invitation Auth Flow    ←── P1-18, P1-22             │
P1-26  Notification Preferences←── P1-18                    │
                      │                                     │
                      ┌────── merge to main + verify ──────┐
                      ▼                                     │
BATCH 3 (5 parallel)                                        │
═══════════════════════════════════════════════════          │
P1-14  Document Search         ←── P1-13                    │
P1-17c Announcement Emails     ←── P1-17, P1-26, P1-28     │
P1-23  Public Website          ←── P1-16                    │
P1-24  Resident Portal Dash    ←── P1-16, P1-17            │
P1-29  Demo Seed Data          ←── P1-09, P1-10, P1-11, P1-12
                      │
                      ┌────── merge to main + verify ──────┐
                      ▼                                     │
BATCH 4 (1 task)                                            │
═══════════════════════════════════════════════════          │
P1-15  Document Management UI  ←── P1-12, P1-14            │
                      │                                     │
                      ┌────── merge to main + verify ──────┐
                      ▼                                     │
BATCH 5 (1 task)                                            │
═══════════════════════════════════════════════════          │
P1-25  Resident Document Library←── P1-14, P1-15           │
                      │                                     │
                      └────── merge to main ────────────────┘
                      ▼
              GATE 2 VERIFICATION
```

### Critical Path (longest sequential chain)

```
P1-11 (Upload) → P1-13 (Extraction) → P1-14 (Search) → P1-15 (Doc Mgmt UI) → P1-25 (Resident Doc Library)
  Batch 1          Batch 2               Batch 3           Batch 4               Batch 5
```

This 5-task chain through the document pipeline determines minimum calendar time. Everything else can run in parallel alongside it. If any task in this chain slips, the entire Phase 1 timeline slips.

### Secondary Critical Path

```
P1-09 (Compliance) → P1-16 (Meetings) → P1-24 (Resident Dashboard)
  Batch 1              Batch 2             Batch 3
```

Shorter but high-risk: P1-09 is the most complex task in Phase 1 (date arithmetic with DST, timezone splits, rolling windows). If it takes multiple Ralph iterations to stabilize, it delays Batch 2 for both P1-10 and P1-16.

---

## Worktree Setup

Each Ralph loop runs on an isolated git worktree so parallel tasks never interfere with each other's working directory.

### Initial setup (run once before Batch 1):

```bash
# From the main repo root
cd /path/to/PropertyPro

# Create a worktrees directory outside the repo
mkdir -p ../pp-worktrees
```

### Per-batch worktree creation:

```bash
# Example for Batch 1 — create one worktree per task
git worktree add ../pp-worktrees/p1-09 -b feature/p1-09-compliance-engine
git worktree add ../pp-worktrees/p1-11 -b feature/p1-11-document-upload
git worktree add ../pp-worktrees/p1-17 -b feature/p1-17-announcements
git worktree add ../pp-worktrees/p1-18 -b feature/p1-18-resident-management
git worktree add ../pp-worktrees/p1-21 -b feature/p1-21-password-reset
git worktree add ../pp-worktrees/p1-22 -b feature/p1-22-session-management
git worktree add ../pp-worktrees/p1-27b -b feature/p1-27b-audit-logging-middleware
git worktree add ../pp-worktrees/p1-28 -b feature/p1-28-email-infrastructure
```

### Per-batch worktree cleanup (after merge):

```bash
# Remove worktrees after successful merge
git worktree remove ../pp-worktrees/p1-09
# ... repeat for each
```

### Environment propagation:

Each worktree needs access to `.env.local`. Symlink it:

```bash
# In each worktree
ln -s /path/to/PropertyPro/.env.local ../pp-worktrees/p1-09/.env.local
```

And run `pnpm install` in each worktree before starting the Ralph loop (lockfile is shared via git, but `node_modules` is per-worktree).

### Test Isolation Strategy

Integration tests running in parallel worktrees can conflict when sharing the same database. Use ONE of these approaches:

**Option A: Defer Integration Tests (Recommended for this plan)**
- Unit tests and component tests run in worktrees
- Integration tests (`test:integration`) run ONLY after batch merge on `main`
- Add to each Ralph prompt: "Run `pnpm test` for unit/component tests. Skip integration tests (those run post-merge)."

**Option B: Per-Worktree Test Prefix**
- Each worktree uses a unique test data prefix: `test_p109_`, `test_p111_`, etc.
- Add to each Ralph prompt: "Use test data prefix 'test_p1XX_' (replace XX with task number) for all test fixtures to avoid conflicts with parallel tasks."

---

## Schema Migration Conflict Strategy

**This is the most dangerous aspect of parallel development.** Multiple Batch 1 tasks create new schema files:

| Task | New schema files |
|------|-----------------|
| P1-09 | `compliance-checklist-items.ts` |
| P1-16 | `meetings.ts`, `meeting-documents.ts` |
| P1-17 | `announcements.ts` |
| P1-27a | `compliance-audit-log.ts` |

### Rules to prevent migration conflicts:

1. **New tables only.** No Batch 1 task may ALTER existing Phase 0 tables. If a task discovers it needs a column on an existing table, it must document the change and defer it to the merge step.
2. **Schema files are additive.** Each task creates new `.ts` files in `packages/db/src/schema/`. These don't conflict because they're separate files.
3. **One migration per merge.** Do NOT generate Drizzle migrations inside worktrees. After merging all branches for a batch, generate a single migration from `main` that includes all new tables.
4. **Schema index re-export.** The `packages/db/src/schema/index.ts` barrel file will have merge conflicts (every task adds an export line). Resolve manually during merge — this is a 2-minute fix.

### Post-merge migration workflow:

```bash
# After merging all Batch N branches to main
cd /path/to/PropertyPro

# Migration commands — use DIRECT connection (bypasses PgBouncer)
# The pooled connection uses PgBouncer in transaction mode which doesn't work
# reliably with DDL statements. Always use DIRECT_DATABASE_URL for migrations.
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit generate  # single migration covering all new tables
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit migrate   # apply to Supabase

# Migration gate: if audit schema exists, migration SQL must include audit table creation.
if rg --files packages/db/src/schema | rg '^packages/db/src/schema/compliance-audit-log.ts$' > /dev/null; then
  rg "compliance_audit_log" packages/db/migrations/*.sql > /dev/null || {
    echo "ERROR: compliance_audit_log is missing from migration SQL. Regenerate migrations from main before proceeding.";
    exit 1;
  }
fi

# App/test queries use the pooled connection (default DATABASE_URL)
pnpm build && pnpm typecheck && pnpm lint && pnpm test
set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration
```

---

## Batch Definitions

### Batch 0: Middleware Fix

**Tasks:** 1 (not a Ralph loop — manual fix)
**Estimated time:** 15 minutes
**Merge to main before Batch 0.5.**
**Execution status:** Completed (2026-02-11)

---

### Batch 0.5: Audit Logging Foundation

**Tasks:** 1 (quick foundation task, ~15 min)
**Purpose:** Provide `logAuditEvent()` function so all Batch 1 mutation tasks can call it.
**Merge to main before Batch 1.**
**Execution status:** Completed and merged to `main` (merge commit `0c0bd22`, 2026-02-11)

#### P1-27a — Audit Logging Foundation

```bash
cd /path/to/PropertyPro
git checkout -b feature/p1-27a-audit-logging-foundation

# Manual implementation (not a full Ralph loop):
# 1. Create packages/db/src/schema/compliance-audit-log.ts with the table definition
# 2. Create packages/db/src/utils/audit-logger.ts with logAuditEvent() stub
#    - In development: logs to console
#    - In production: inserts to compliance_audit_log table
# 3. Export from packages/db/src/index.ts
# 4. Run: pnpm build && pnpm typecheck

git add .
git commit -m "feat(db): add audit logging foundation (P1-27a)"
git checkout main
git merge feature/p1-27a-audit-logging-foundation
```

**Files created:**
- `packages/db/src/schema/compliance-audit-log.ts` — append-only table definition
- `packages/db/src/utils/audit-logger.ts` — `logAuditEvent()` function

**Minimal implementation:**
```typescript
// packages/db/src/utils/audit-logger.ts
export async function logAuditEvent(params: {
  userId: string;
  action:
    | 'create' | 'update' | 'delete'                              // Generic CRUD
    | 'user_invited' | 'settings_changed'                         // User lifecycle
    | 'meeting_notice_posted' | 'meeting_minutes_approved'        // Meeting events
    | 'announcement_email_sent' | 'document_deleted';             // Domain events
  resourceType: string;
  resourceId: string;
  communityId: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;  // For bulk counts, recipient lists, etc.
}) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[AUDIT]', params);
    return;
  }
  // P1-27a stub: console.log only. P1-27b upgrades this to actual DB inserts.
  console.log('[AUDIT]', params);
}
```

---

### Batch 1: Foundation Layer

**Tasks:** 8 parallel Ralph loops
**Estimated time:** 1-2 days (wall clock, limited by P1-09 complexity)

These tasks share no Phase 1 dependencies — they only depend on Phase 0 artifacts. They can all run simultaneously.

#### Conflict zones to watch:

| File | Tasks that touch it | Resolution |
|------|-------------------|------------|
| `packages/db/src/schema/index.ts` | P1-09, P1-17, P1-27a | Manual merge (add all export lines) |
| `apps/web/src/middleware.ts` | P1-22, P1-27b | Merge carefully — P1-22 adds session refresh, P1-27b adds audit injection |
| `packages/shared/src/` | P1-09 (compliance templates) | Only P1-09 touches this; no conflict |
| `packages/email/src/` | P1-28 | Only P1-28 touches this; no conflict |

**Low conflict risk.** The 8 tasks operate in largely separate directories.

#### Ralph prompts for Batch 1:

**P1-09 — Compliance Engine** (HIGH RISK — most complex task)

```bash
cd ../pp-worktrees/p1-09
ralph -n 15 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-09 (Compliance Checklist Engine). Implement it fully per the acceptance criteria and testing requirements.

Key requirements:
- Create packages/db/src/schema/compliance-checklist-items.ts
- Create packages/shared/src/compliance/templates.ts with §718 and §720 constants from the project spec
- Create apps/web/src/app/api/v1/compliance/route.ts
- Create apps/web/src/lib/utils/compliance-calculator.ts
- Use date-fns for ALL date calculations (never native Date or moment.js)
- All dates stored as UTC, convert to community timezone at presentation layer only
- Must handle Florida's Eastern/Central timezone split (per-community timezone from communities.timezone)
- Wrap all route handlers with withErrorHandler from apps/web/src/lib/api/error-handler.ts
- Call logAuditEvent() from packages/db after every create/update/delete mutation

Tests MUST cover ALL of these edge cases explicitly:
- DST spring-forward (March 8 2026 Eastern): 14-day notice deadline must not produce invalid timestamp
- DST fall-back (November 1 2026): posting deadline must resolve unambiguously
- Leap year: document posted Jan 30 → 30-day deadline in leap vs non-leap year
- Weekend deadlines: document the business rule explicitly in code comments
- Timezone split: same checklist item for Pensacola (Central) vs Miami (Eastern)
- Year boundary: document posted Dec 15 → deadline Jan 14 next year
- Apartment community type must generate ZERO compliance checklist items
- Rolling 12-month window for minutes/recordings

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass, and all listed edge case tests are present and green. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-11 — Document Upload Pipeline**

```bash
cd ../pp-worktrees/p1-11
ralph -n 10 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-11 (Document Upload Pipeline). Implement it fully per acceptance criteria.

Key requirements:
- Presigned URL endpoint at apps/web/src/app/api/v1/upload/route.ts
- Document record CRUD at apps/web/src/app/api/v1/documents/route.ts
- Client uploads directly to Supabase Storage via presigned URL (NEVER route file bytes through Next.js — Vercel has a 4.5MB body limit)
- Document uploader component with progress tracking
- All DB queries must use the scoped client from packages/db (createScopedClient)
- Document records must include community_id scoping
- Wrap all route handlers with withErrorHandler from apps/web/src/lib/api/error-handler.ts
- Call logAuditEvent() from packages/db after every create/update/delete mutation

Tests:
- Presigned URL generation returns valid URL
- Document record creation with correct community_id
- Upload error handling
- Cross-tenant isolation: community A cannot see community B documents

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-17 — Announcement System**

```bash
cd ../pp-worktrees/p1-17
ralph -n 10 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-17 (Announcement System). Implement it fully per acceptance criteria.

Note: Email notifications deferred to post-Batch-1 integration; this task implements the announcement CRUD and UI only.

Key requirements:
- Create packages/db/src/schema/announcements.ts
- CRUD API at apps/web/src/app/api/v1/announcements/route.ts
- Announcement composer component (rich text editor)
- Announcement feed component (chronological, pinned items first)
- Pin/unpin and archive functionality
- All queries via scoped client (community_id isolation)
- Wrap all route handlers with withErrorHandler from apps/web/src/lib/api/error-handler.ts
- Call logAuditEvent() from packages/db after every create/update/delete mutation

Tests:
- CRUD integration tests
- Pin/unpin ordering test
- Archive hides from default view
- Cross-tenant isolation

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-18 — Resident Management**

```bash
cd ../pp-worktrees/p1-18
ralph -n 10 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-18 (Resident Management). Implement it fully per acceptance criteria.

Key requirements:
- CRUD API at apps/web/src/app/api/v1/residents/route.ts
- Resident form and list components
- Role assignment via user_roles junction table (user_id, community_id, role)
- Enforce ONE active canonical role per (user_id, community_id) — DB unique constraint exists
- Unit assignment: owner/tenant require unit_id; non-unit roles keep unit_id nullable
- Community-type role constraints per ADR-001 (e.g., site_manager only for apartments)
- All queries via scoped client
- Wrap all route handlers with withErrorHandler from apps/web/src/lib/api/error-handler.ts
- Call logAuditEvent() from packages/db after every create/update/delete mutation

Tests:
- CRUD integration
- Role assignment: same user as board_president in community A and tenant in community B
- Unit assignment policy enforcement
- Scoping: resident list only shows residents from current community

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-21 — Password Reset**

```bash
cd ../pp-worktrees/p1-21
ralph -n 8 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-21 (Password Reset Flow). Implement it fully per acceptance criteria.

Key requirements:
- Forgot password page at apps/web/src/app/auth/forgot-password/page.tsx
- Reset password page at apps/web/src/app/auth/reset-password/page.tsx
- Rate limiting: max 3 reset requests per email per hour
- CRITICAL: Non-existent email must return same response timing as valid email (prevent email enumeration/timing attacks)
- Use Supabase Auth's built-in password reset flow

Tests:
- Happy path: request reset → click link → set new password → login works
- Rate limit: 4th request in same hour is rejected
- Timing attack prevention: verify implementation uses constant-time strategy (same code path for valid/invalid emails, artificial delay to normalize response times) rather than flaky timing assertions
- Reset link expiry

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-22 — Session Management**

```bash
cd ../pp-worktrees/p1-22
ralph -n 8 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-22 (Session Management). Implement it fully per acceptance criteria.

Key requirements:
- Server client wrapper using @supabase/ssr with cookie-reading pattern
- Browser client wrapper for Client Components
- Middleware session refresh (already exists in apps/web/src/middleware.ts — extend it, don't replace it)
- Authenticated layout at apps/web/src/app/(authenticated)/layout.tsx
- Email verification page
- Session NOT available directly in Server Components — must use cookie-reading server client pattern
- Expired sessions redirect to /auth/login with returnTo query param preserving the original URL

Tests:
- Session persistence: login → refresh page → still authenticated
- Expiry: simulate expired token → redirect to login
- Return URL: /dashboard when unauthenticated → /auth/login?returnTo=/dashboard

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-27b — Audit Logging Middleware** (builds on P1-27a foundation)

```bash
cd ../pp-worktrees/p1-27b
ralph -n 10 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-27 (Audit Logging). Implement the MIDDLEWARE portion — the schema and logAuditEvent() stub already exist from P1-27a.

Key requirements:
- The schema (packages/db/src/schema/compliance-audit-log.ts) already exists from P1-27a
- The logAuditEvent() stub (packages/db/src/utils/audit-logger.ts) already exists — upgrade it to actually INSERT to the database
- Enforce append-only constraint (no UPDATE or DELETE) via Drizzle schema or DB trigger
- The scoped query builder in packages/db/src/scoped-client.ts already exempts compliance_audit_log from soft-delete filtering — verify this works with the real table
- Middleware that auto-injects audit logs on Route Handler mutations
- community_id scoping still applies to audit log READS
- Wrap all route handlers with withErrorHandler from apps/web/src/lib/api/error-handler.ts

Tests (CRITICAL):
- Append-only: attempt UPDATE on compliance_audit_log → rejection
- Mutation logging: create document → audit entry with correct action and new_values
- Update logging: update document → old_values AND new_values captured
- Soft-delete exemption: soft-delete resource → audit entries for that resource still visible
- Cross-tenant: community A board_president cannot see community B audit trail

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

Merge-blocking requirement for `feature/p1-27b-audit-logging-middleware`:
- Must include an append-only rejection test for `compliance_audit_log`.
- Must include a cross-tenant audit-read isolation test (community A cannot read community B).

**P1-28 — Email Infrastructure**

```bash
cd ../pp-worktrees/p1-28
ralph -n 8 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-28 (Email Infrastructure). Implement it fully per acceptance criteria.

Key requirements:
- Templates in packages/email/src/templates/: invitation, password-reset, meeting-notice, compliance-alert, announcement
- Use React Email for template rendering
- Send via Resend SDK (packages/email/src/send.ts) — NOT Supabase built-in email
- ALL non-transactional emails must include List-Unsubscribe header (CAN-SPAM + Gmail 2024 sender requirements)
- All emails include community branding (logo, name) in header
- pnpm --filter email dev should start React Email preview server

Tests:
- Template render: each template with test data, no errors, output contains expected content
- List-Unsubscribe header present on non-transactional emails
- Send test in Resend test mode

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

#### Batch 1 merge procedure:

```bash
# 1. Return to main repo
cd /path/to/PropertyPro

# 2. Merge each branch (order doesn't matter since they don't conflict)
git merge feature/p1-28-email-infrastructure    # least likely to conflict
git merge feature/p1-21-password-reset
git merge feature/p1-22-session-management
git merge feature/p1-27b-audit-logging-middleware
git merge feature/p1-17-announcements
git merge feature/p1-18-resident-management
git merge feature/p1-11-document-upload
git merge feature/p1-09-compliance-engine       # most files — merge last

# 3. Resolve any conflicts in schema/index.ts barrel exports (expected)

# 4. Generate single migration for all new tables — use DIRECT connection
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit generate
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit migrate

# 5. Migration gate for audit table (required once P1-27a schema exists)
if rg --files packages/db/src/schema | rg '^packages/db/src/schema/compliance-audit-log.ts$' > /dev/null; then
  rg "compliance_audit_log" packages/db/migrations/*.sql > /dev/null || {
    echo "ERROR: compliance_audit_log is missing from migration SQL. Regenerate migrations from main before proceeding.";
    exit 1;
  }
fi

# 6. Repo hygiene gate (.tsbuildinfo should not be committed unless tooling config changes)
if (git diff --name-only; git diff --name-only --cached) | sort -u | rg '\.tsbuildinfo$' > /dev/null; then
  echo "ERROR: .tsbuildinfo detected in working diff. Remove it unless this merge intentionally changes TypeScript tooling configuration.";
  exit 1;
fi

# 7. Verification gate
pnpm build && pnpm typecheck && pnpm lint && pnpm test
set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration

# 8. Clean up worktrees
git worktree remove ../pp-worktrees/p1-09
# ... repeat for all 8
```

**DO NOT proceed to Batch 2 until the verification gate passes.**

---

### Batch 2: First Dependent Layer

**Tasks:** 7 parallel Ralph loops
**Depends on:** All Batch 1 tasks merged to main
**Estimated time:** 1-2 days

Worktree setup command set from `main`:

```bash
git worktree add ../pp-worktrees/p1-10 -b codex/p1-10-compliance-dashboard-ui
git worktree add ../pp-worktrees/p1-12 -b codex/p1-12-magic-bytes
git worktree add ../pp-worktrees/p1-13 -b codex/p1-13-text-extraction
git worktree add ../pp-worktrees/p1-16 -b codex/p1-16-meeting-management
git worktree add ../pp-worktrees/p1-19 -b codex/p1-19-csv-import
git worktree add ../pp-worktrees/p1-20 -b codex/p1-20-invitation-auth
git worktree add ../pp-worktrees/p1-26 -b codex/p1-26-notification-preferences
```

#### Ralph prompts for Batch 2:

**P1-10 — Compliance Dashboard UI** (depends on P1-09)

```bash
ralph -n 10 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-10 (Compliance Dashboard UI). Implement it fully.

The compliance engine from P1-09 is already implemented — use its API and types.

Key requirements:
- Dashboard page at apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx
- Status colors: green=satisfied, red=overdue, yellow=unsatisfied, gray=not_applicable
- PDF export with all checklist items and current status
- Filter by status and category
- Timeline view for upcoming deadlines
- Use UI components from packages/ui (Button, Card, Badge)

Tests:
- Component test for status badge colors
- PDF export contains expected checklist items
- Filter reduces displayed items correctly

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-12 — Magic Bytes Validation** (depends on P1-11)

```bash
ralph -n 8 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-12 (Magic Bytes Validation). Implement it fully.

Key requirements:
- Use the file-type npm package for magic byte validation (never trust Content-Type headers or extensions)
- Size limits: 50MB documents, 10MB images
- Allowed types: PDF, DOCX, PNG, JPG

Tests (ALL required):
- Valid PDF (%PDF- header) → passes
- .exe renamed to .pdf → rejected (magic bytes mismatch)
- Zero-byte file → rejected
- Exactly 50MB → accepted
- 50MB + 1 byte → rejected
- Each allowed type verified by magic bytes

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-13 — Document Text Extraction** (depends on P1-11)

```bash
ralph -n 10 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-13 (Document Text Extraction). Implement it fully.

Key requirements:
- Extract text from uploaded PDFs using pdf-parse
- Populate search_text and search_vector (tsvector) columns on documents table
- Extraction MUST run asynchronously — never block the upload response
- Extraction failures logged but don't break the upload flow
- pdf-parse loads entire PDF into memory — handle large files carefully

Tests:
- Extract text from known test PDF, verify output
- Upload PDF → search_text populated after extraction
- Corrupt PDF → extraction fails gracefully, document record still exists with empty search_text
- Verify extraction of large file doesn't crash

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-16 — Meeting Management** (depends on P1-09)

```bash
ralph -n 10 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-16 (Meeting Management). Implement it fully.

The compliance engine from P1-09 is already implemented — use its date calculation utilities.

Key requirements:
- Create packages/db/src/schema/meetings.ts and meeting-documents.ts
- CRUD API at apps/web/src/app/api/v1/meetings/route.ts
- Meeting types: board, annual, special, budget, committee
- Compliance deadlines auto-calculated: 14 days for owner meetings, 48 hours for board meetings, 7 days for owner vote documents
- Documents attachable to meetings via meeting_documents join table
- All date calculations use date-fns, stored as UTC, displayed in community timezone
- Wrap all route handlers with withErrorHandler from apps/web/src/lib/api/error-handler.ts
- Call logAuditEvent() from packages/db after every create/update/delete mutation (meeting_notice_posted, meeting_minutes_approved events)

Tests:
- Deadline calculation with same DST/timezone edge cases as P1-09
- CRUD integration
- Document attachment
- Cross-tenant isolation
- Audit log entries created for meeting mutations

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-19 — CSV Import** (depends on P1-18)

```bash
ralph -n 8 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-19 (CSV Import). Implement it fully.

Resident management from P1-18 is already implemented — use its API and types.

Key requirements:
- Import API at apps/web/src/app/api/v1/import-residents/route.ts
- CSV parsing handles: commas in quoted fields, UTF-8 BOM, different line endings (CRLF, LF)
- Preview before import
- Clear error reporting: row number + column + error message
- Duplicate detection by email address
- Wrap all route handlers with withErrorHandler from apps/web/src/lib/api/error-handler.ts
- Call logAuditEvent() from packages/db after every user creation (user_invited event with bulk count in metadata)

Tests:
- Commas in quoted fields
- UTF-8 BOM handling
- Windows line endings
- Empty rows, trailing commas
- Duplicate email detection
- Error report with correct row numbers
- Audit log entries created for bulk user import

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-20 — Invitation Auth Flow** (depends on P1-18, uses P1-22 session patterns)

```bash
ralph -n 10 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-20 (Invitation Auth Flow). Implement it fully.

Resident management (P1-18), email infrastructure (P1-28), and session management (P1-22) are already implemented. Use the session patterns from P1-22 for authenticated state after invitation acceptance.

Key requirements:
- Invitation API at apps/web/src/app/api/v1/invitations/route.ts
- Send invitation email via Resend (use packages/email) — NOT Supabase built-in invite
- Accept invitation page at apps/web/src/app/auth/accept-invite/page.tsx
- Set-password form creates Supabase auth user and links to existing user record
- Token is ONE-TIME USE — second click shows 'already used'
- Token expires after 7 days (configurable)
- Wrap all route handlers with withErrorHandler from apps/web/src/lib/api/error-handler.ts
- Call logAuditEvent() from packages/db for invitation creation (user_invited) and token consumption

Tests:
- Create invitation → accept → set password → login succeeds
- Token reuse → rejected
- Token expiry → rejected with clear message
- Email contains correct link and community name
- Audit log entries created for invitation lifecycle

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-26 — Notification Preferences** (depends on P1-18)

```bash
ralph -n 8 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-26 (Notification Preferences). Implement it fully.

Key requirements:
- notification_preferences table already exists from P0-05 schema — verify structure and adapt if needed
- Settings page at apps/web/src/app/(authenticated)/settings/page.tsx
- Preferences: email_announcements (boolean, default true), email_documents (boolean, default true), email_meetings (boolean, default true), email_maintenance (boolean, default true)
- Email sending must respect per-notification-type toggles
- Default for new users: all notification toggles enabled
- CRITICAL: Password reset and invitation emails always send regardless of preference
- Call logAuditEvent() from packages/db for preference updates (settings_changed event)

Tests:
- Preference CRUD
- Default values applied for new users (all types enabled)
- Preference updates persist correctly
- Disable all non-critical toggles → password reset email IS sent (critical emails bypass preferences)
- Audit log entries created for preference changes

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

#### Batch 2 merge procedure:

Same pattern as Batch 1. Expected schema conflicts: `meetings.ts` and `meeting-documents.ts` from P1-16 are new files (no conflict). Schema index barrel file will need manual resolution.
Execution note (2026-02-12): this procedure has been completed on `main`; retain commands here as the repeatable template for future batch merges.

```bash
# Already merged earlier in Batch 2:
# - codex/p1-10-compliance-dashboard-ui
# - codex/p1-13-text-extraction
# - codex/p1-19-csv-import
# - codex/p1-20-invitation-auth

git merge codex/p1-12-magic-bytes
git merge codex/p1-16-meeting-management
git merge codex/p1-26-notification-preferences

# Migration commands — use DIRECT connection (bypasses PgBouncer)
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit generate
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit migrate

pnpm build && pnpm typecheck && pnpm lint && pnpm test
set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration
```

---

### Batch 3: Second Dependent Layer

**Tasks:** 5 parallel Ralph loops
**Depends on:** All Batch 2 tasks merged to main
**Estimated time:** 1 day

**P1-14 — Document Search** (depends on P1-13)

```bash
ralph -n 8 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-14 (Document Search). Implement it fully.

Text extraction (P1-13) is already populating search_text and search_vector columns.

Key requirements:
- Search API at apps/web/src/app/api/v1/documents/search/route.ts
- PostgreSQL tsvector full-text search with relevance ranking
- Filters: category, date range, document type
- ALL search queries MUST go through scoped client (community_id isolation) — NEVER raw queries
- Empty search returns all documents (filtered by category/date if specified)
- Wrap all route handlers with withErrorHandler from apps/web/src/lib/api/error-handler.ts

Tests:
- Seed documents with known text → search → correct results returned
- Relevance ranking: different match quality → verify ordering
- Cross-tenant isolation: search from community A → zero results from community B
- Date range and category filters narrow results

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-17c — Announcement Email Integration** (depends on P1-17, P1-26, P1-28)

```bash
ralph -n 8 -p "ALL TESTS PASSING" \
  "Implement announcement email integration. Wire the announcement publish flow to send email notifications.

Announcements (P1-17) and email infrastructure (P1-28) are already implemented. Start this only after `P1-26` is merged.

Key requirements:
- Add email sending hook to announcement publish flow in apps/web/src/app/api/v1/announcements/route.ts
- Check notification_preferences: email_announcements=true before sending
- Use the announcement React Email template from packages/email/src/templates/announcement.tsx
- Queue emails asynchronously — NEVER block the publish response waiting for email delivery
- Batch email sending for large recipient lists (max 100 per Resend API call)
- Include List-Unsubscribe header (already configured in P1-28 templates)
- Target audience filtering: respect announcement target_audience field (all, owners_only, board_only, tenants_only)
- Call logAuditEvent() for announcement_email_sent action with recipient count

Tests:
- Publish announcement → email sent to users with email_announcements=true
- Publish announcement → NO email to users with email_announcements=false
- Target audience filtering: board_only announcement → only board members receive email
- Large recipient list → batched correctly (mock Resend to verify batch sizes)
- Async verification: publish response returns before emails are sent

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-23 — Public Website** (depends on P1-16)

```bash
ralph -n 10 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-23 (Public Website). Implement it fully.

Meeting management (P1-16) must be merged before this task starts.

Key requirements:
- Public pages at apps/web/src/app/(public)/[subdomain]/
- Home page, Notices page (labeled 'Notices' per statute), login link
- Tenant resolution: use query param ?tenant=x in development, hostname extraction in production
- RESERVED subdomains that must return 404: admin, api, www, mobile, pm, app, dashboard, login, signup, legal
- Mobile responsive, WCAG 2.1 AA accessible
- No authenticated content visible without login

Tests:
- Tenant resolution: subdomain maps to correct community
- Reserved subdomain: 'admin.propertypro.com' → 404
- Non-existent subdomain → not-found page
- Notices page renders upcoming meetings

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-24 — Resident Portal Dashboard** (depends on P1-16, P1-17)

```bash
ralph -n 8 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-24 (Resident Portal Dashboard). Implement it fully.

Announcements (P1-17) are implemented. `P1-16` must be merged before this task starts.

Key requirements:
- Dashboard at apps/web/src/app/(authenticated)/dashboard/page.tsx
- Personalized welcome (user's first name)
- Upcoming meetings (next 5)
- Recent announcements (last 5, pinned first)
- Quick links to documents, settings, maintenance
- All data scoped to user's community via scoped client
- Use UI components from packages/ui

Tests:
- Component tests for each dashboard section
- Scoping: data comes from correct community only
- Empty state: new community with no data shows appropriate empty states

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

**P1-29 — Demo Seed Data** (depends on P1-09, P1-10, P1-11, P1-12)

```bash
ralph -n 8 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-29 (Demo Seed Data). Implement it fully.

Compliance engine, dashboard UI, and document upload are implemented. `P1-12` (magic bytes) must be merged before this task starts.

Key requirements:
- Seed script at scripts/seed-demo.ts, runnable via pnpm seed:demo
- Create 3 demo communities: 'Sunset Condos' (condo_718), 'Palm Shores HOA' (hoa_720), 'Bay View Apartments' (apartment)
- Demo users with all canonical roles across communities
- Demo documents, compliance checklists, meetings with attached documents
- Demo credentials documented in .env.example comments
- Script must be IDEMPOTENT — running twice must not create duplicates

Tests:
- Idempotency: run seed twice → no duplicate records
- Data verification: after seeding, query each entity type and verify expected counts
- Apartment community has zero compliance checklist items

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. pnpm seed:demo runs without error. Output <promise>ALL TESTS PASSING</promise> when done."
```

#### Batch 3 merge procedure:

```bash
git merge feature/p1-14-document-search
git merge feature/p1-17c-announcement-emails
git merge feature/p1-23-public-website
git merge feature/p1-24-resident-portal-dashboard
git merge feature/p1-29-demo-seed-data

# Migration commands — use DIRECT connection (bypasses PgBouncer)
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit generate
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit migrate

pnpm build && pnpm typecheck && pnpm lint && pnpm test
set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration
```

---

### Batch 4: Document Management UI

**Tasks:** 1 (P1-15)
**Depends on:** P1-12, P1-14 merged to main

```bash
ralph -n 10 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-15 (Document Management UI). Implement it fully.

Document upload (P1-11) is implemented. Start this after `P1-12` and `P1-14` are merged.

Key requirements:
- Document management page at apps/web/src/app/(authenticated)/communities/[id]/documents/page.tsx
- Drag-and-drop upload with progress indicator
- Document list with search and filter (uses the search API from P1-14)
- In-browser PDF viewer, download option for other types
- Version history for documents with multiple versions
- Soft-delete functionality
- Use UI components from packages/ui
- Call logAuditEvent() from packages/db for document soft-delete (document_deleted event)

Tests:
- Component tests for upload area (drag events)
- Document list rendering
- Filter interactions
- Version history display
- Audit log entries created for document soft-delete

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

#### Batch 4 merge procedure:

```bash
git merge feature/p1-15-document-management-ui

# Migration commands — use DIRECT connection (bypasses PgBouncer)
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit generate
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit migrate

pnpm build && pnpm typecheck && pnpm lint && pnpm test
set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration
```

---

### Batch 5: Resident Document Library

**Tasks:** 1 (P1-25)
**Depends on:** P1-14, P1-15 merged to main

```bash
ralph -n 12 -p "ALL TESTS PASSING" \
  "Read IMPLEMENTATION_PLAN.md task P1-25 (Resident Document Library). Implement it fully.

Document search (P1-14) and document management UI (P1-15) are implemented.

Key requirements:
- Access policy matrix in packages/shared/src/access-policies.ts
- DB-level access control in packages/db/src/queries/document-access.ts
- Document library component at apps/web/src/components/documents/document-library.tsx
- Access control enforced at DB layer (Drizzle WHERE clauses), NOT just UI
- owner/board_member/board_president/property_manager_admin: full document access per ADR-001
- tenant: restricted to approved categories by community type per ADR-001
- cam/site_manager: operational document access per ADR-001 community-type constraints
- Never check community_type directly in components — use CommunityFeatures config object

Tests (CRITICAL — access control boundary):
- Role matrix test: for EACH role × EACH document category → verify correct allow/deny per ADR-001
- DB enforcement: manually bypass UI → DB WHERE clause still filters correctly
- Tenant queries restricted category → zero results
- Cross-community: documents from other communities never visible regardless of role
- Gate contract: tests must explicitly assert restricted-role deny on disallowed known categories and unknown/unmapped categories, and elevated-role allow on unknown/unmapped categories
- Higher max iterations (12) because access control matrix is complex and easy to get wrong

Run pnpm test for unit/component tests. Skip integration tests (those run post-merge).
Verify all items in the Platform Invariants Checklist are satisfied.
Completion criteria: pnpm build && pnpm typecheck && pnpm test all pass. Output <promise>ALL TESTS PASSING</promise> when done."
```

#### Batch 5 merge procedure:

```bash
git merge feature/p1-25-resident-document-library

# Migration commands — use DIRECT connection (bypasses PgBouncer)
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit generate
DATABASE_URL=$DIRECT_DATABASE_URL pnpm drizzle-kit migrate

pnpm build && pnpm typecheck && pnpm lint && pnpm test
set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration
```

---

## Gate 2 Verification

After all Phase 1 tasks are merged and verified, run the Gate 2 checklist from IMPLEMENTATION_PLAN.md:

- [x] All Phase 1 tests pass (`pnpm test`)
- [x] All integration tests pass (`pnpm --filter @propertypro/db test:integration`)
- [x] Compliance checklist auto-generates for condo (§718) and HOA (§720)
- [x] Compliance checklist does NOT generate for apartment
- [x] Document upload → extraction → search pipeline works end-to-end
- [x] Resident invitation → accept → login flow works end-to-end
- [x] Audit log captures mutations correctly
- [x] Date edge cases (DST, leap year, weekends) all pass
- [x] Demo seed script runs cleanly (`pnpm seed:demo`)
- [x] `pnpm build && pnpm typecheck` clean
- [x] Issue #2 authorization hardening verified (`403` for authenticated non-member foreign-`communityId` mutations, success for authorized members, no cross-tenant mutation side effects)

---

## Risk Assessment

### Critical Risks

| Risk | Batch | Mitigation |
|------|-------|------------|
| P1-09 date arithmetic bugs cascade to P1-16 | 1→2 | P1-09 has the most comprehensive test suite in Phase 1. If Ralph can't stabilize it in 15 iterations, pause and debug manually before proceeding. |
| Schema migration conflicts during batch merge | All | One migration generated per batch after merge. No migrations inside worktrees. Schema barrel file manually resolved. |
| Access control wrong in P1-25 | 5 | 12-iteration limit. If the role matrix test fails, this is a manual review task — don't let Ralph iterate blindly on security logic. |
| Audit logging middleware misses routes | 1 | P1-27b must wire into withErrorHandler pattern. Every existing Route Handler must be checked during Batch 1 merge. |

### What to do when a Ralph loop doesn't converge

If a task doesn't hit its completion promise within the iteration limit:

1. **Stop the loop.** Don't increase `--max-iterations` — context rot makes later iterations worse, not better.
2. **Read the last iteration's output.** Identify what's failing.
3. **Fix the failing issue manually or refine the prompt.** Then restart Ralph with a fresh session.
4. **If 3 restarts fail:** Implement manually. Some tasks (especially P1-09 date arithmetic) may require human judgment that an autonomous loop can't provide.

### What to do when a batch merge has conflicts

1. Merge the simplest/smallest branches first (fewer conflicts to carry forward).
2. The `packages/db/src/schema/index.ts` barrel file WILL conflict on every batch. This is a 2-minute manual fix — add all export lines.
3. If two tasks modified the same utility file (unlikely given the task separation), take the version from the more complex task and manually port the simpler task's additions.
4. Run the full verification gate after ALL merges in a batch, not after each individual merge.

---

## Resource Estimates

| Batch | Parallel tasks | Estimated API cost (Ralph loops) | Wall clock time |
|-------|---------------|----------------------------------|-----------------|
| 0 | 1 (manual) | $0 | 15 min |
| 1 | 8 | ~$40-80 (8 loops × ~$5-10 each) | 1-2 days |
| 2 | 7 | ~$35-70 | 1 day |
| 3 | 5 | ~$25-50 | 0.5-1 day |
| 4 | 1 | ~$5-10 | 0.5 day |
| 5 | 1 | ~$5-10 | 0.5 day |
| **Total** | **22 tasks** | **~$110-220** | **~4-6 days** |

Cost estimates assume ~$5-10 per Ralph loop at 8-15 iterations per task with Claude Code. Actual costs depend on iteration count and model pricing.

---

## Summary

Phase 1's 22 tasks compress into 6 sequential batches with up to 8-way parallelism. The critical path runs through the document pipeline (5 tasks across 5 batches). The highest-risk task is P1-09 (Compliance Engine) due to date arithmetic complexity — if it doesn't converge, it blocks both the compliance dashboard (P1-10) and meeting management (P1-16).

The plan prioritizes catching integration issues early (batch verification gates), unblocking downstream tasks first (Batch 1 maximizes parallelism for everything that follows), and minimizing rework risk (schema migrations consolidated per-batch, access control tested exhaustively in P1-25).
