# Workstream 66: Finance, Dues, and Ledger

**Complexity:** Large
**Tier:** 1 (ship first)
**Migration Range:** 0041-0055
**Depends on:** WS 65 (ledger contract, RBAC resources, feature flags, test harness)

---

## 1. Objective And Business Outcome

Enable associations to manage assessments, collect dues via Stripe Connect, track payments in an AR ledger, handle delinquency workflows, and export financial reports. This is the core revenue feature for the platform.

---

## 2. In Scope

- Assessment creation and scheduling (monthly, quarterly, annual, special)
- Dues billing per unit with amount, due date, late fee rules
- Stripe Connect integration (connected accounts per association)
- Payment processing lifecycle (intent → confirmation → ledger posting)
- Webhook handling (payment_intent.succeeded, charge.refunded, charge.dispute.created, etc.)
- AR ledger reads and balance queries (uses WS 65 `postLedgerEntry()` interface)
- Delinquency tracking (overdue thresholds, lien eligibility flags)
- Payment history and statement generation
- Financial report exports (CSV, PDF summary)
- Stripe test mode contract tests (nightly)

---

## 3. Out Of Scope

- Ledger table schema (WS 65)
- `postLedgerEntry()` function (WS 65)
- Fine posting from violations (WS 67)
- Tax calculations or 1099 generation
- ACH/bank transfer (Stripe Connect handles payment methods)
- Accounting software sync (WS 70)

---

## 4. Dependencies

| Dependency | Source | Status |
|---|---|---|
| Ledger table + write interface | WS 65 | Must land first |
| `finances` RBAC resource | WS 65 | Must land first |
| `hasFinance` feature flag | WS 65 | Must land first |
| Stripe Connect account provisioning | New (this workstream) | — |
| Stripe test mode API key (`sk_test_*`) | Environment setup | Must provision |

### Inbound from WS 67 (Violations)

WS 67 creates `assessment_line_items` for fine payments. The `assessmentId` column must be nullable to support one-off charges (fines are not recurring assessments). On payment completion, WS 66 updates `violation_fines.status` to `'paid'`.

---

## 5. Data Model And Migrations

### New Tables (migrations 0041-0055 range)

**assessments** — Recurring or one-time charges
- id, communityId, title, description, amountCents, frequency (monthly/quarterly/annual/one_time), dueDay, lateFeeAmountCents, lateFeeDaysGrace, startDate, endDate, isActive, createdByUserId, createdAt, updatedAt, deletedAt

**assessment_line_items** — Per-unit billing records
- id, assessmentId (nullable — NULL for one-off charges like fines), communityId, unitId, amountCents, dueDate, status (pending/paid/overdue/waived), paidAt, paymentIntentId, lateFeeCents, createdAt, updatedAt, deletedAt

**stripe_connected_accounts** — Per-association Stripe Connect
- id, communityId (unique), stripeAccountId, onboardingComplete, chargesEnabled, payoutsEnabled, createdAt, updatedAt, deletedAt

**stripe_webhook_events** — Webhook idempotency log (append-only)
- id, communityId, stripeEventId (TEXT, NOT NULL, UNIQUE), eventType (TEXT, NOT NULL), processedAt (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()), payload (JSONB), createdAt (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- RLS: `tenant_crud` family (scoped by communityId)
- No soft-delete (event log is append-only)
- Index on `stripeEventId` (unique, used for dedup lookups)

**Webhook Idempotency:** Before processing any Stripe webhook, check `stripe_webhook_events` for a matching `stripeEventId`. If found, return 200 without re-processing. If not found, insert the event row, then process. Use a transaction to prevent TOCTOU races.

All tables: communityId FK, RLS enabled, soft-delete support (except `stripe_webhook_events`).

---

## 6. API Contracts

```
POST   /api/v1/assessments              — Create assessment
GET    /api/v1/assessments              — List assessments
PATCH  /api/v1/assessments/:id          — Update assessment
DELETE /api/v1/assessments/:id          — Soft-delete

GET    /api/v1/assessments/:id/line-items  — List line items for assessment
POST   /api/v1/assessments/:id/generate    — Generate line items for all units

POST   /api/v1/payments/create-intent   — Create Stripe PaymentIntent
GET    /api/v1/payments/history         — Payment history for current user
GET    /api/v1/payments/statement       — Statement for unit

GET    /api/v1/ledger                   — Ledger entries (filtered by unit, date range)
GET    /api/v1/ledger/balance/:unitId   — Current balance for unit

GET    /api/v1/delinquency              — Delinquent units list
POST   /api/v1/delinquency/:unitId/waive — Waive late fees

GET    /api/v1/finance/export/csv       — Export ledger as CSV
GET    /api/v1/finance/export/statement — Export statement as PDF

POST   /api/v1/stripe/connect/onboard   — Initiate Stripe Connect onboarding
GET    /api/v1/stripe/connect/status     — Check onboarding status
```

All routes: `withErrorHandler`, tenant-scoped, audit-logged, subscription-guarded for mutations.

---

## 7. Authorization + RLS Policy Family Mapping

| Role | assessments (r/w) | payments (r/w) | ledger (r) | delinquency (r/w) |
|---|---|---|---|---|
| owner | r only own unit / — | r own + w (pay) | r own unit | — |
| tenant | — | — | — | — |
| board_member | r / — | r / — | r | r / — |
| board_president | r / w | r / — | r | r / w |
| cam | r / w | r / — | r | r / w |
| site_manager | r / w | r / — | r | r / w |
| property_manager_admin | r / w | r / — | r | r / w |

---

## 8. UI/UX + Design-System Constraints

- Assessment management: table view with status badges (icon + text + color)
- Payment flow: Stripe Elements embedded form (PCI compliance)
- Ledger view: filterable table with date range, unit, entry type
- Delinquency dashboard: sortable list with overdue amounts, days overdue
- All monetary values displayed with 2 decimal places, US dollar format
- Touch targets: minimum 44x44px for payment buttons

---

## 9. Failure Modes And Edge Cases

- Duplicate webhook delivery → idempotency via `stripe_webhook_events` table
- Out-of-order webhooks → fetch fresh state from Stripe API (AGENTS.md rule)
- Partial Stripe outage during payment → show pending state, retry on webhook
- Assessment generation for 0 units → validation error
- Late fee calculation across DST boundaries → use `date-fns` with community timezone
- Refund posting after unit ownership transfer → ledger entry tied to original unit

---

## 10. Testing Plan

### Seed Strategy
- Extend multi-tenant fixtures with assessment + line item data per community
- Stripe test mode fixtures: use Stripe Dashboard test clocks for lifecycle testing

### Teardown Rules
- `ledger_entries` cleanup follows WS 65 pattern (may be append-only)
- `assessment_line_items` standard soft-delete cleanup
- `stripe_connected_accounts` standard cleanup

### Tenant Isolation Matrix
- communityA assessments not visible to communityB
- communityA ledger entries not visible to communityB
- Owner in communityA cannot see other units' payment history

### Concurrency Cases
- Two payments for same line item arriving simultaneously → only one succeeds
- Assessment generation while previous generation in progress → idempotent

### Environment Requirements
- `DATABASE_URL` — Required
- `STRIPE_SECRET_KEY` (test mode: `sk_test_*`) — Required for contract tests
- `STRIPE_WEBHOOK_SECRET` — Required for webhook verification tests

### Required Test Coverage
- Full assessment-to-payment-to-ledger lifecycle (integration, real DB)
- Webhook dedup and reorder handling (integration)
- Cross-tenant isolation for all new tables (integration)
- Stripe payment intents, refunds, dispute events (contract, nightly, real Stripe test mode)

---

## 11. Observability And Operational Metrics

- Payment success/failure rate per community
- Average time from invoice to payment
- Delinquency rate trending
- Webhook processing latency and error rate
- Stripe Connect onboarding completion rate

---

## 12. Definition Of Done + Evidence Required

- [ ] Assessment CRUD with all API endpoints
- [ ] Stripe Connect onboarding flow
- [ ] Payment processing via Stripe PaymentIntents
- [ ] Ledger posting for all payment events (uses WS 65 contract)
- [ ] Delinquency tracking with configurable thresholds
- [ ] Financial export (CSV + PDF statement)
- [ ] No-mock integration tests for full lifecycle
- [ ] Cross-tenant isolation tests for all new tables
- [ ] Stripe contract tests (nightly, real test mode)
- [ ] RLS policies for all new tables
- [ ] Audit logging for all mutations
- [ ] Feature flag (`hasFinance`) enforcement
- [ ] Evidence doc in `docs/audits/phase5-66-YYYY-MM-DD.md`
