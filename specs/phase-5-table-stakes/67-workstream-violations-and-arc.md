# Workstream 67: Violations and ARC

**Complexity:** Large
**Tier:** 1 (ship first)
**Migration Range:** 0055-0064
**Depends on:** WS 65 (ledger contract, RBAC resources, feature flags, test harness)

---

## 1. Objective And Business Outcome

Enable associations to manage the full violation lifecycle (report → notice → hearing → fine → resolution) and Architectural Review Committee (ARC) submissions (application → review → decision). Both are core compliance features for condo/HOA communities.

---

## 2. In Scope

- Violation reporting and case management
- Violation notice generation with Florida-compliant timelines
- Hearing scheduling and outcome recording
- Fine imposition and posting to AR ledger (via WS 65 `postLedgerEntry()`)
- Fine payment tracking
- ARC application submission with document attachments
- ARC review workflow (committee assignment, review periods, decision recording)
- ARC decision notifications
- Status tracking dashboards for both violations and ARC

---

## 3. Out Of Scope

- Ledger table schema and write interface (WS 65)
- Payment collection for fines (WS 66 payment infrastructure)
- Automated fine escalation schedules (future enhancement)
- Integration with county/city code enforcement databases

---

## 4. Dependencies

| Dependency | Source | Status |
|---|---|---|
| Ledger table + `postLedgerEntry()` | WS 65 | Must land first |
| `violations` and `arc_submissions` RBAC resources | WS 65 | Must land first |
| `hasViolations` and `hasARC` feature flags | WS 65 | Must land first |
| Document upload infrastructure | Existing (Phase 2) | Available |
| Notification service | Existing | Available |

---

## 5. Data Model And Migrations

### New Tables (migrations 0055-0064 range)

**violations** — Violation cases
- id, communityId, unitId, reportedByUserId, category, description, status (reported/noticed/hearing_scheduled/fined/resolved/dismissed), severity (minor/moderate/major), evidenceDocumentIds (JSONB array), noticeDate, hearingDate, resolutionDate, resolutionNotes, createdAt, updatedAt, deletedAt

**violation_fines** — Fines associated with violations
- id, communityId, violationId, amountCents, ledgerEntryId (FK to ledger_entries), status (pending/paid/waived), issuedAt, paidAt, waivedAt, waivedByUserId, createdAt, updatedAt, deletedAt

**arc_submissions** — ARC applications
- id, communityId, unitId, submittedByUserId, title, description, projectType, estimatedStartDate, estimatedCompletionDate, attachmentDocumentIds (JSONB array), status (submitted/under_review/approved/denied/withdrawn), reviewNotes, decidedByUserId, decidedAt, createdAt, updatedAt, deletedAt

All tables: communityId FK, RLS enabled, soft-delete support.

---

## 6. API Contracts

```
# Violations
POST   /api/v1/violations              — Report violation
GET    /api/v1/violations              — List violations (filtered by status, unit)
GET    /api/v1/violations/:id          — Get violation detail
PATCH  /api/v1/violations/:id          — Update status/details
POST   /api/v1/violations/:id/fine     — Impose fine (posts to ledger)
POST   /api/v1/violations/:id/resolve  — Mark resolved
POST   /api/v1/violations/:id/dismiss  — Dismiss violation

# ARC
POST   /api/v1/arc                     — Submit ARC application
GET    /api/v1/arc                     — List ARC submissions
GET    /api/v1/arc/:id                 — Get ARC detail
PATCH  /api/v1/arc/:id/review          — Start review / assign committee
POST   /api/v1/arc/:id/decide          — Record decision (approve/deny)
POST   /api/v1/arc/:id/withdraw        — Owner withdraws application
```

All routes: `withErrorHandler`, tenant-scoped, audit-logged.

---

## 7. Authorization + RLS Policy Family Mapping

### Violations

| Role | Report | View All | View Own | Update Status | Impose Fine |
|---|---|---|---|---|---|
| owner | yes (own unit) | no | yes | no | no |
| tenant | yes (own unit) | no | yes | no | no |
| board_member | yes | yes | yes | no | no |
| board_president | yes | yes | yes | yes | yes |
| cam | yes | yes | yes | yes | yes |
| property_manager_admin | yes | yes | yes | yes | yes |

### ARC

| Role | Submit | View All | View Own | Review/Decide |
|---|---|---|---|---|
| owner | yes | no | yes | no |
| board_member | no | yes | — | no |
| board_president | no | yes | — | yes |
| cam | no | yes | — | yes |
| property_manager_admin | no | yes | — | yes |

---

## 8. UI/UX + Design-System Constraints

- Violation timeline view showing status progression
- Status badges: icon + text + color (reported=blue, noticed=yellow, fined=red, resolved=green)
- ARC submission form with file upload (existing upload infrastructure)
- ARC review dashboard with pending/decided tabs
- Touch targets: minimum 44x44px for action buttons

---

## 9. Failure Modes And Edge Cases

- Fine posting fails (ledger service error) → violation status remains at hearing_scheduled, error surfaced
- Violation reported for unit with no owner → associate with unit only, not user
- ARC submission with oversized attachments → existing magic-byte validation + size limits apply
- Concurrent fine + waive on same violation → use `SELECT ... FOR UPDATE` on the `violation_fines` row before status change. Transaction ensures atomicity: if fine is already waived, the fine operation returns 409; if fine is already paid, waive returns 409.
- Concurrent fine imposition on same violation → `UNIQUE(violation_id)` constraint on `violation_fines` prevents duplicate fines per violation (one fine per violation; escalation creates new violations). If multiple fines per violation are needed in future, switch to optimistic locking via `version` column.
- Violation on deleted unit → reject with 422
- ARC decided while owner is withdrawing → first-writer-wins via `UPDATE ... WHERE status = 'submitted' RETURNING id`; if no rows returned, concurrent decision already occurred → return 409

---

## 10. Testing Plan

### Seed Strategy
- Add violation + ARC fixtures to multi-tenant test communities
- At least 2 violations per community in different statuses
- At least 1 ARC submission per condo/HOA community

### Teardown Rules
- Standard cascade delete via test kit
- `violation_fines` cleanup must handle FK to `ledger_entries`

### Tenant Isolation Matrix
- communityA violations not visible to communityB
- Owner in communityA cannot see other units' violations (unless board/cam role)
- ARC submissions scoped to community

### Concurrency Cases
- Concurrent fine imposition on same violation → only one succeeds
- ARC decision while withdrawal in progress → first-writer-wins

### Environment Requirements
- `DATABASE_URL` — Required
- No external service keys needed

### Required Test Coverage
- Full violation lifecycle: report → notice → hearing → fine → resolve (integration)
- Fine posting to ledger via `postLedgerEntry()` (integration)
- ARC submission → review → decision lifecycle (integration)
- Cross-tenant isolation for all new tables (integration)
- Role-based access enforcement (integration)

---

## 11. Observability And Operational Metrics

- Open violations by community and severity
- Average time from report to resolution
- ARC submission volume and approval rate
- Fine collection rate (via ledger queries)

---

## 12. Definition Of Done + Evidence Required

- [ ] Violation lifecycle CRUD with all API endpoints
- [ ] Fine imposition posting to ledger via WS 65 contract
- [ ] ARC submission and decision workflow
- [ ] Notification delivery for violation notices and ARC decisions
- [ ] No-mock integration tests for both lifecycles
- [ ] Cross-tenant isolation tests for all new tables
- [ ] RLS policies for all new tables
- [ ] Audit logging for all mutations
- [ ] Feature flags (`hasViolations`, `hasARC`) enforcement
- [ ] Evidence doc in `docs/audits/phase5-67-YYYY-MM-DD.md`
