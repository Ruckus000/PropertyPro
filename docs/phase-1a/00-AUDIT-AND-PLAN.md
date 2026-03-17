# Phase 1A: Payments & Dues Collection — Audit & Implementation Plan

**Date:** March 16, 2026
**Branch:** `phase-1a/payments-dues-collection`
**Status:** Audit Complete, Plan Ready for Review

---

## Part 1: Infrastructure Audit Summary

### What Already Exists (Green)

The backend for Phase 1A is **substantially complete**. This dramatically reduces the effort from the roadmap's 4-week estimate.

| Layer | Status | Details |
|---|---|---|
| **Database Schema** | Complete | 5 core tables migrated with RLS, indexes, constraints (migrations 0037-0041) |
| **API Routes** | Complete | 17+ endpoints: assessments CRUD, payments, ledger, delinquency, Stripe Connect, exports |
| **Service Layer** | Complete | `finance-service.ts` (1119 lines), `stripe-service.ts`, `payment-alert-scheduler.ts` |
| **Stripe SDK** | Installed | `stripe@20.3.1`, `@stripe/stripe-js@8.7.0`, `@stripe/react-stripe-js@5.6.0` |
| **Webhook Handler** | Complete | Idempotent, signature-verified, handles payment_intent.succeeded/charge.refunded/charge.dispute.created |
| **Email Templates** | Partial | Payment failed, subscription canceled, expiry warning exist. **Missing:** assessment payment confirmation |
| **Test Coverage** | Good | Webhook tests, contract tests, integration tests for finance flow |
| **Audit Logging** | Complete | All mutations logged to compliance_audit_log |
| **RLS Policies** | Complete | tenant_admin_write on assessments/line items/connect accounts; tenant_crud on ledger; tenant_append_only on webhook events |
| **Shared Types** | Complete | LedgerEntryType, LedgerSourceType, LedgerMetadata in packages/shared |

### What's Missing (Red)

| Component | Status | Priority |
|---|---|---|
| **Stripe Connect Onboarding UI** | Not started | P0 |
| **Owner Payment Portal** (pay assessment, view balance, history) | Not started | P0 |
| **Assessment Management UI** (admin CRUD) | Not started | P0 |
| **Payment Dashboard** (admin: who paid, who hasn't, aging) | Not started | P0 |
| **Assessment Payment Confirmation Email** | Not started | P1 |
| **Late Fee Automation** (cron/trigger for calculating and applying late fees) | Not started | P1 |
| **Overdue Status Transition** (pending → overdue batch job) | Not started | P1 |
| **Assessment Due Reminder Emails** (not subscription reminders — dues reminders) | Not started | P1 |
| **ACH-Specific Payment Flow** | Not started | P2 |
| **Reconciliation Report UI** (Stripe payouts vs ledger) | Not started | P2 |
| **Payment Fee Configuration UI** (who absorbs Stripe fees) | Not started | P2 |

### Gaps & Risks Identified

| # | Finding | Severity | Owner |
|---|---|---|---|
| **G1** | Late fee calculation has no automation. `late_fee_cents` exists on line items but nothing triggers it. Need a cron job or webhook-driven process. | High | Backend |
| **G2** | `pending` → `overdue` status transition has no automation. Likely needs a daily cron job checking `due_date < today AND status = 'pending'`. | High | Backend |
| **G3** | Assessment payment confirmation email template doesn't exist. `PaymentFailedEmail` exists but no `AssessmentPaymentReceivedEmail`. | Medium | Backend + Email |
| **G4** | Assessment due date reminder emails (separate from subscription payment reminders) don't exist. Roadmap 1A.4 references `payment-alert-scheduler.ts` but that file only handles subscription billing reminders, not assessment dues. | Medium | Backend + Email |
| **G5** | ACH payment method not explicitly handled. `createPaymentIntentForLineItem()` creates a PaymentIntent but doesn't set `payment_method_types` to include `us_bank_account`. Default is card only. | Medium | Backend |
| **G6** | Stripe Connect onboarding uses Express accounts. Roadmap says "Standard" — need to verify which is correct for Florida trust fund compliance. | High | Legal/Compliance |
| **G7** | No recurring line item generation automation. `generateAssessmentLineItemsForCommunity()` exists but must be called manually via API. Need a monthly cron to auto-generate for recurring assessments. | High | Backend |
| **G8** | `exportStatementPdf()` uses raw PDF 1.4 generation (no library). Quality may be low for customer-facing statements. | Low | UX |
| **G9** | Accounting connectors (QuickBooks/Xero) use dummy adapters with deterministic test data. Not production-ready but listed as intentionally excluded from Phase 1A scope. | Info | N/A |
| **G10** | Stripe price IDs validated at runtime only. Missing startup validation that `STRIPE_PRICE_*` env vars are set. | Low | DevOps |

---

## Part 2: Implementation Plan

### Team Perspective Considerations

**Senior Engineer:**
- Backend is solid. Focus is UI + 3 missing cron jobs + 2 missing email templates.
- Finance service has good separation of concerns — UI can consume existing APIs directly via TanStack Query.
- Zero schema changes needed unless ACH payment method types require metadata.

**DevOps:**
- Need 3 new Vercel cron jobs (overdue status, late fee calculation, recurring line item generation).
- Current `vercel.json` only has 1 cron (payment-reminders). Vercel Hobby plan allows 2 crons; Pro allows unlimited.
- Stripe Connect onboarding requires callback URL configuration in Stripe Dashboard.
- Webhook endpoint already exists but needs finance event types registered in Stripe Dashboard.

**Chaos Engineering:**
- Payment idempotency is well-handled (unique constraint on stripe_event_id).
- Race condition between subscription.updated and subscription.deleted is guarded with atomic WHERE clause.
- Missing: What happens if line item generation cron runs twice? `generateAssessmentLineItemsForCommunity()` has skip logic for existing line items — safe.
- Missing: What if a payment webhook arrives before line item exists? `handlePaymentIntentSucceeded()` will fail to find the line item. Need graceful handling.
- Missing: What if Stripe Connect onboarding is abandoned mid-flow? Need UI to handle `onboarding_complete = false` state.

**UX/UI:**
- Zero payment UI exists. All pages need to be built from scratch.
- Must be mobile-responsive (roadmap: "critical — many will vote on phones" applies to payments too).
- Owner experience: Balance → Pay → Confirmation must be 3 clicks or fewer.
- Admin experience: Assessment creation wizard should use progressive disclosure (basic fields first, advanced optional).
- Design system components exist (Card, Badge, Button, Alert) but no finance-specific components (currency display, payment status badges, aging bars).
- Stripe Elements vs Stripe Checkout: Stripe Elements gives more control over UX; Stripe Checkout is faster to implement. Recommend: Stripe Payment Element (middle ground).

**QA:**
- End-to-end test: assessment creation → line item generation → owner payment → webhook → ledger update → admin dashboard.
- Stripe test mode covers card payments. ACH test mode requires specific test bank accounts.
- Multi-tenant isolation test: Association A's payments never visible to Association B.
- Edge cases: partial payments (not currently supported — full amount only), failed payments, refunds, late fees, special assessments.
- Accessibility: Payment forms must be WCAG 2.1 AA compliant.

---

### Work Breakdown: 6 Workstreams

#### WS-1: Backend Automation (Cron Jobs + Email) — ~3 days

| Task | Description | Files |
|---|---|---|
| **WS1.1** | Create overdue status transition cron | New: `apps/web/src/app/api/v1/internal/assessment-overdue/route.ts` |
| **WS1.2** | Create late fee calculation cron | New: `apps/web/src/app/api/v1/internal/late-fee-processor/route.ts` |
| **WS1.3** | Create recurring line item generation cron | New: `apps/web/src/app/api/v1/internal/generate-assessments/route.ts` |
| **WS1.4** | Create assessment payment confirmation email template | New: `packages/email/src/templates/assessment-payment-received.tsx` |
| **WS1.5** | Create assessment due reminder email template | New: `packages/email/src/templates/assessment-due-reminder.tsx` |
| **WS1.6** | Integrate reminder emails into cron or scheduler | Edit: `payment-alert-scheduler.ts` or new scheduler |
| **WS1.7** | Add ACH payment method type to PaymentIntent creation | Edit: `finance-service.ts` → `createPaymentIntentForLineItem()` |
| **WS1.8** | Register cron jobs in vercel.json | Edit: `apps/web/vercel.json` |
| **WS1.9** | Add cron auth secrets for new endpoints | Edit: `.env.example`, deployment docs |

**Deliverable:** All automated financial operations run without manual intervention.

#### WS-2: Stripe Connect Onboarding UI (Standard Accounts) — ~3 days

> **Decision D1 Impact:** Current code uses Express accounts. Must migrate to **Standard** accounts.
> Standard accounts use OAuth-based onboarding (not Account Links). Association gets full Stripe dashboard access.

| Task | Description | Files |
|---|---|---|
| **WS2.1** | Migrate `startConnectOnboarding()` from Express to Standard (OAuth flow) | Edit: `finance-service.ts` — replace `stripe.accounts.create({type:'express'})` with OAuth URL generation |
| **WS2.2** | Create Settings → Payments page (admin only) | New: `apps/web/src/app/(authenticated)/settings/payments/page.tsx` |
| **WS2.3** | Build Connect status component (not connected / pending / active) | New: `apps/web/src/components/finance/connect-status.tsx` |
| **WS2.4** | Build onboarding initiation flow (button → redirect to Stripe OAuth) | Integrated into WS2.2 |
| **WS2.5** | Build OAuth return handler (redirect back from Stripe with auth code) | New: `apps/web/src/app/(authenticated)/settings/payments/connected/page.tsx` |
| **WS2.6** | Handle incomplete onboarding state (resume flow) | Component logic in WS2.3 |
| **WS2.7** | Add "Payments" link to settings navigation | Edit: settings layout/nav component |
| **WS2.8** | Update `getConnectStatus()` for Standard account fields | Edit: `finance-service.ts` |

**Deliverable:** Board treasurer/CAM can connect their association's own Stripe Standard account via OAuth from Settings. Association retains full Stripe dashboard control.

#### WS-3: Owner Payment Portal — ~5 days

> **Decision D2 Impact:** Convenience fee passed to owners. UI must show fee breakdown (assessment amount + processing fee) before confirmation.
> **Decision D3 Impact:** ACH included. Stripe Payment Element handles card + ACH natively.
> **Decision D4 Impact:** Full payment only. Single "Pay" button per line item, no amount input field.
> **Decision D6 Impact:** Stripe Payment Element embedded in our page. Owner stays on-site.

| Task | Description | Files |
|---|---|---|
| **WS3.1** | Create Payments page layout and navigation entry | New: `apps/web/src/app/(authenticated)/payments/page.tsx` + layout |
| **WS3.2** | Build account balance summary component | New: `apps/web/src/components/finance/balance-summary.tsx` |
| **WS3.3** | Build upcoming assessments list (pending/overdue line items) | New: `apps/web/src/components/finance/upcoming-assessments.tsx` |
| **WS3.4** | Build payment history table with status badges | New: `apps/web/src/components/finance/payment-history.tsx` |
| **WS3.5** | Build convenience fee calculator utility | New: `apps/web/src/lib/utils/convenience-fee.ts` — calculates fee based on payment method (2.9%+$0.30 card, 0.8% ACH) |
| **WS3.6** | Build "Pay Assessment" flow with Stripe Payment Element | New: `apps/web/src/components/finance/payment-form.tsx` — shows amount + fee breakdown, embeds PaymentElement for card/ACH |
| **WS3.7** | Update `createPaymentIntentForLineItem()` to include convenience fee | Edit: `finance-service.ts` — add `application_fee_amount` for convenience fee, add `payment_method_types: ['card', 'us_bank_account']` |
| **WS3.8** | Build payment confirmation/success page | New: `apps/web/src/app/(authenticated)/payments/success/page.tsx` |
| **WS3.9** | Build account statement view (date range filtered) | New: `apps/web/src/components/finance/account-statement.tsx` |
| **WS3.10** | Add statement PDF download button | Integrated into WS3.9 (calls existing export/statement API) |
| **WS3.11** | Create TanStack Query hooks for all payment APIs | New: `apps/web/src/hooks/use-finance.ts` |
| **WS3.12** | Mobile-responsive layout for all payment components | CSS/responsive design within all components |

**Deliverable:** Unit owners can view their balance, see upcoming/overdue assessments, pay via card or ACH with transparent convenience fee, and download statements.

#### WS-4: Assessment Management UI (Admin) — ~3 days

| Task | Description | Files |
|---|---|---|
| **WS4.1** | Create Assessments admin page | New: `apps/web/src/app/(authenticated)/assessments/page.tsx` |
| **WS4.2** | Build assessment list with filters (active, frequency, date) | New: `apps/web/src/components/finance/assessment-list.tsx` |
| **WS4.3** | Build assessment creation form (wizard or modal) | New: `apps/web/src/components/finance/assessment-form.tsx` |
| **WS4.4** | Build assessment detail/edit view | New: `apps/web/src/app/(authenticated)/assessments/[id]/page.tsx` |
| **WS4.5** | Build line item generation UI (button + confirmation) | Integrated into WS4.4 |
| **WS4.6** | Build line item status table for an assessment | New: `apps/web/src/components/finance/line-item-table.tsx` |
| **WS4.7** | Support one-time special assessments | Form variant in WS4.3 |
| **WS4.8** | Add "Assessments" link to admin navigation | Edit: dashboard nav component |

**Deliverable:** Board/CAM can create recurring and one-time assessments, generate line items, and view per-unit payment status.

#### WS-5: Payment Dashboard (Admin) — ~3 days

| Task | Description | Files |
|---|---|---|
| **WS5.1** | Create Finance Dashboard page (admin) | New: `apps/web/src/app/(authenticated)/finance/page.tsx` |
| **WS5.2** | Build collection summary cards (total due, collected, outstanding) | New: `apps/web/src/components/finance/collection-summary.tsx` |
| **WS5.3** | Build "Who Paid / Who Hasn't" unit status grid | New: `apps/web/src/components/finance/unit-payment-grid.tsx` |
| **WS5.4** | Build aging report (30/60/90 day delinquencies) | New: `apps/web/src/components/finance/aging-report.tsx` |
| **WS5.5** | Build delinquent units table with waive action | New: `apps/web/src/components/finance/delinquent-units.tsx` |
| **WS5.6** | CSV export button (calls existing export/csv API) | Integrated into WS5.1 |
| **WS5.7** | Build ledger viewer with filters | New: `apps/web/src/components/finance/ledger-viewer.tsx` |
| **WS5.8** | Add "Finance" link to admin navigation | Edit: dashboard nav component |

**Deliverable:** Admin/CAM can see at a glance who has paid, who hasn't, aging of delinquencies, and export data for accountants.

#### WS-6: Integration Testing & Ship Gate — ~2 days

| Task | Description | Files |
|---|---|---|
| **WS6.1** | E2E test: assessment creation → line item generation → owner sees balance | New test file |
| **WS6.2** | E2E test: owner payment → Stripe webhook → ledger update → admin dashboard | New test file |
| **WS6.3** | E2E test: late fee application → overdue transition → delinquency report | New test file |
| **WS6.4** | Multi-tenant isolation test (Association A vs B) | New test file |
| **WS6.5** | Stripe test mode: card payment full cycle | New test file |
| **WS6.6** | Stripe test mode: ACH payment full cycle | New test file |
| **WS6.7** | Edge case: failed payment → retry → success | New test file |
| **WS6.8** | Edge case: refund flow | New test file |
| **WS6.9** | Seed demo data: Create sample assessments + line items for demo communities | Edit: `scripts/seed-demo.ts` |
| **WS6.10** | Verify: each association's funds go to their own Stripe account (trust fund compliance) | Manual verification + documented evidence |

**Deliverable:** All ship gate criteria from roadmap 1A.8 verified.

---

### Dependency Graph

```
WS-1 (Backend Automation)
  ↓
WS-2 (Stripe Connect UI) ←─── No dependency on WS-1 (can parallelize)
  ↓
WS-3 (Owner Payment Portal) ←── Depends on WS-2 (Connect must be set up before payments work)
  ↓                               Also benefits from WS-1 (overdue status, late fees visible)
WS-4 (Assessment Admin UI) ←──── No hard dependency on WS-3 (can parallelize)
  ↓
WS-5 (Payment Dashboard) ←────── Benefits from WS-3 + WS-4 data (but can start in parallel)
  ↓
WS-6 (Integration Testing) ←──── Depends on ALL above
```

**Recommended execution order:**
1. **Sprint 1 (Days 1-5):** WS-1 (backend automation) + WS-2 (Connect Standard migration + UI) in parallel
2. **Sprint 2 (Days 4-11):** WS-3 (owner portal + convenience fee) + WS-4 (assessment admin) in parallel
3. **Sprint 3 (Days 10-15):** WS-5 (payment dashboard) + WS-6 (integration testing)

**Total estimated calendar time: ~15 working days (3 weeks)**
*+2 days vs original estimate due to Standard account migration (D1) and convenience fee logic (D2)*

---

### Decisions — RESOLVED (March 16, 2026)

| # | Decision | Resolution | Implementation Impact |
|---|---|---|---|
| **D1** | Stripe Connect account type | **Standard** | Must migrate current Express implementation to Standard. Associations get full Stripe dashboard control. More complex onboarding but better for attorney comfort and Florida trust fund compliance. |
| **D2** | Payment processing fee model | **Pass to owners ("convenience fee")** | UI must show fee breakdown before payment confirmation. Need `calculateConvenienceFee()` utility. Industry standard (PayHOA, Condo Control). |
| **D3** | ACH support in v1? | **Yes — include ACH** | Add `payment_method_types: ['card', 'us_bank_account']` to PaymentIntent creation. Payment Element handles both natively. |
| **D4** | Partial payments? | **Full payment only** | No changes needed — current API already enforces full amount. UI shows single "Pay" button per line item with no amount input. |
| **D5** | Auto-generate line items or manual? | **Fully automated** | Build monthly cron (`/api/v1/internal/generate-assessments`). Skip logic already exists. Add admin email notification on generation. |
| **D6** | Payment Element vs Checkout Session | **Payment Element (embedded)** | Use `@stripe/react-stripe-js` PaymentElement component. Owner stays on our site. Supports card + ACH in one form. |

---

### Ship Gate Checklist (from Roadmap 1A.8)

- [ ] Stripe Connect onboarding works for new association signup
- [ ] Owner can pay assessment via card or ACH
- [ ] Admin can create assessments and view payment status
- [ ] Webhooks correctly update ledger
- [ ] Payment reminders send on schedule
- [ ] Zero trust fund commingling (verified via Stripe dashboard — each association's funds go to their own bank account)
- [ ] Drop $500 setup fee from pricing page — replace with free 60-day trial

### Additional Ship Gate Items (from audit)

- [ ] Late fee automation runs daily and correctly calculates fees per assessment rules
- [ ] Overdue status transition runs daily
- [ ] Recurring assessment line items auto-generated monthly
- [ ] Payment confirmation email sent to owner after successful payment
- [ ] Assessment due reminder email sent 7 days before due date
- [ ] Mobile-responsive on all payment pages
- [ ] Multi-tenant isolation verified (Association A payments invisible to Association B)
- [ ] Demo communities seeded with sample assessment data

---

## Part 3: File Inventory

### Existing Files (Do Not Recreate)

**Schema:**
- `packages/db/src/schema/assessments.ts`
- `packages/db/src/schema/assessment-line-items.ts`
- `packages/db/src/schema/ledger-entries.ts`
- `packages/db/src/schema/stripe-connected-accounts.ts`
- `packages/db/src/schema/finance-stripe-webhook-events.ts`

**Migrations:**
- `packages/db/migrations/0037_create_ledger_entries.sql`
- `packages/db/migrations/0038_ledger_entries_rls.sql`
- `packages/db/migrations/0039_ledger_entries_constraints.sql`
- `packages/db/migrations/0040_ledger_entries_indexes.sql`
- `packages/db/migrations/0041_finance_dues_core.sql`

**API Routes:**
- `apps/web/src/app/api/v1/assessments/route.ts` (GET/POST)
- `apps/web/src/app/api/v1/assessments/[id]/route.ts` (PATCH/DELETE)
- `apps/web/src/app/api/v1/assessments/[id]/generate/route.ts` (POST)
- `apps/web/src/app/api/v1/assessments/[id]/line-items/route.ts` (GET)
- `apps/web/src/app/api/v1/payments/create-intent/route.ts` (POST)
- `apps/web/src/app/api/v1/payments/history/route.ts` (GET)
- `apps/web/src/app/api/v1/payments/statement/route.ts` (GET)
- `apps/web/src/app/api/v1/ledger/route.ts` (GET)
- `apps/web/src/app/api/v1/ledger/balance/[unitId]/route.ts` (GET)
- `apps/web/src/app/api/v1/delinquency/route.ts` (GET)
- `apps/web/src/app/api/v1/delinquency/[unitId]/waive/route.ts` (POST)
- `apps/web/src/app/api/v1/finance/export/csv/route.ts` (GET)
- `apps/web/src/app/api/v1/finance/export/statement/route.ts` (GET)
- `apps/web/src/app/api/v1/stripe/connect/onboard/route.ts` (POST)
- `apps/web/src/app/api/v1/stripe/connect/status/route.ts` (GET)
- `apps/web/src/app/api/v1/webhooks/stripe/route.ts` (POST)
- `apps/web/src/app/api/v1/internal/payment-reminders/route.ts` (POST)

**Services:**
- `apps/web/src/lib/services/finance-service.ts`
- `apps/web/src/lib/services/stripe-service.ts`
- `apps/web/src/lib/services/payment-alert-scheduler.ts`
- `apps/web/src/lib/finance/common.ts`
- `apps/web/src/lib/finance/request.ts`
- `apps/web/src/lib/utils/finance-pdf.ts`

**Shared Types:**
- `packages/shared/src/ledger.ts`

**Tests:**
- `apps/web/__tests__/billing/stripe-webhook.test.ts`
- `apps/web/__tests__/finance/stripe-contract.test.ts`
- `apps/web/__tests__/finance/finance-service-webhook.test.ts`
- `apps/web/__tests__/finance/finance-mutation-routes.test.ts`
- `apps/web/__tests__/integration/finance-dues-ledger.integration.test.ts`

**Email Templates (existing, related):**
- `packages/email/src/templates/payment-failed.tsx`
- `packages/email/src/templates/subscription-canceled.tsx`
- `packages/email/src/templates/subscription-expiry-warning.tsx`

### New Files to Create

**Backend (WS-1):**
- `apps/web/src/app/api/v1/internal/assessment-overdue/route.ts`
- `apps/web/src/app/api/v1/internal/late-fee-processor/route.ts`
- `apps/web/src/app/api/v1/internal/generate-assessments/route.ts`
- `packages/email/src/templates/assessment-payment-received.tsx`
- `packages/email/src/templates/assessment-due-reminder.tsx`

**Stripe Connect UI (WS-2):**
- `apps/web/src/app/(authenticated)/settings/payments/page.tsx`
- `apps/web/src/app/(authenticated)/settings/payments/connected/page.tsx`
- `apps/web/src/components/finance/connect-status.tsx`

**Owner Payment Portal (WS-3):**
- `apps/web/src/app/(authenticated)/payments/page.tsx`
- `apps/web/src/app/(authenticated)/payments/layout.tsx`
- `apps/web/src/app/(authenticated)/payments/success/page.tsx`
- `apps/web/src/components/finance/balance-summary.tsx`
- `apps/web/src/components/finance/upcoming-assessments.tsx`
- `apps/web/src/components/finance/payment-history.tsx`
- `apps/web/src/components/finance/payment-form.tsx`
- `apps/web/src/components/finance/account-statement.tsx`
- `apps/web/src/hooks/use-finance.ts`

**Assessment Admin (WS-4):**
- `apps/web/src/app/(authenticated)/assessments/page.tsx`
- `apps/web/src/app/(authenticated)/assessments/[id]/page.tsx`
- `apps/web/src/components/finance/assessment-list.tsx`
- `apps/web/src/components/finance/assessment-form.tsx`
- `apps/web/src/components/finance/line-item-table.tsx`

**Payment Dashboard (WS-5):**
- `apps/web/src/app/(authenticated)/finance/page.tsx`
- `apps/web/src/components/finance/collection-summary.tsx`
- `apps/web/src/components/finance/unit-payment-grid.tsx`
- `apps/web/src/components/finance/aging-report.tsx`
- `apps/web/src/components/finance/delinquent-units.tsx`
- `apps/web/src/components/finance/ledger-viewer.tsx`

**Integration Tests (WS-6):**
- `apps/web/__tests__/integration/phase-1a-e2e.test.ts`

### Files to Modify

- `apps/web/vercel.json` — Add 3 new cron jobs
- `apps/web/src/lib/services/finance-service.ts` — Add ACH payment method types
- `.env.example` — Add new cron secrets
- `scripts/seed-demo.ts` — Add assessment/payment seed data
- Settings navigation component — Add "Payments" link
- Dashboard navigation component — Add "Assessments" and "Finance" links
- `packages/email/src/index.ts` — Export new email templates

---

## Part 4: Risk Mitigations

| Risk | Mitigation |
|---|---|
| Stripe Connect rejected for HOA use case | Pre-verify with Stripe support before building UI. File a support ticket describing the use case. |
| Florida trust fund law (§718.111(14)) non-compliance | Each community gets its own Connect account (already designed this way). Get attorney sign-off on Express vs Standard. |
| Double-generation of line items | `generateAssessmentLineItemsForCommunity()` already skips existing line items for same unit+dueDate. Safe for cron. |
| Payment webhook arrives before line item exists | Add graceful handling: log event, don't crash, allow manual reconciliation. |
| Abandoned Stripe Connect onboarding | UI handles `onboarding_complete = false` with "Resume Setup" button. |
| Rate limiting on payment endpoints | Existing middleware handles rate limiting. Payment intent creation should be further limited (1 per user per 10 seconds). |
| Overdue cron runs on already-paid item | Check `status = 'pending'` AND `due_date < today` — paid items have `status = 'paid'` and won't be affected. |

---

*Document Version: 1.0*
*Generated: March 16, 2026*
*Next Action: Review decisions D1-D6, then begin implementation*
