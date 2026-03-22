# Test Coverage Analysis — PropertyPro

**Date:** 2026-03-22
**Scope:** Full codebase audit across all packages and apps

## Executive Summary

The codebase has **209 test files** with **~2,174 test cases** across unit, integration, and E2E layers. Backend services, API routes, and database logic are reasonably well-covered. However, there are significant gaps in **React component testing**, **custom hook testing**, and **E2E coverage** that should be addressed before Phase 3.

| Layer | Files | Tests | Coverage Rating |
|-------|-------|-------|----------------|
| API Routes | 94/139 tested | ~400+ | **Good** (67.6%) |
| Services | 15/34 tested | ~200+ | **Moderate** (44%) |
| Hooks | 2/20 tested | ~10 | **Critical** (10%) |
| React Components | ~10/228 tested | ~80 | **Critical** (<5%) |
| Page Routes | 0/83 tested | 0 | **None** (0%) |
| DB/Schema | Well covered | ~179 | **Strong** |
| Shared Package | Well covered | ~152 | **Strong** |
| UI Package | 7/8 tested | ~203 | **Strong** |
| E2E | 2 smoke tests | ~10 | **Minimal** |

---

## Priority 1 — Critical Gaps

### 1.1 Custom Hooks (2/20 tested)

Only `use-plan-gate` and `use-selected-community` have tests. The remaining 18 hooks contain significant data-fetching, mutation, and state logic that drives the entire UI layer.

**Highest-priority hooks to test:**

| Hook | Lines | Risk |
|------|-------|------|
| `use-pm-reports.ts` | 288 | PM reporting KPIs; bad data = wrong business decisions |
| `use-emergency-broadcasts.ts` | 211 | Safety-critical; SMS broadcast logic |
| `use-finance.ts` | 127 | Payment queries; financial accuracy |
| `useDocumentUpload.ts` | 130 | Core feature; S3 integration |
| `useComplianceMutations.ts` | 128 | Compliance document mutations; regulatory risk |
| `use-meetings.ts` | 166 | Meeting CRUD + calendar ops |
| `use-esign-templates.ts` | 133 | E-signature template management |
| `use-esign-submissions.ts` | 129 | E-sign submission lifecycle |
| `use-leases.ts` | 147 | Lease lifecycle management |
| `use-visitors.ts` | 155 | Visitor management |

**What to test:** Query key construction, mutation side effects (cache invalidation, optimistic updates), error handling, parameter validation.

**Template:** `apps/web/src/hooks/__tests__/use-plan-gate.test.ts` demonstrates the pattern with `renderHook()`.

### 1.2 React Components (< 5% coverage)

228 components across 40+ directories have virtually no test coverage. The largest and most complex untested components:

| Component | Lines | Domain |
|-----------|-------|--------|
| `assessment-manager.tsx` | 814 | Finance — assessment CRUD + generation |
| `import-residents-client.tsx` | 629 | Residents — CSV import wizard |
| `compliance-dashboard.tsx` | 535 | Compliance — regulatory dashboard |
| `new-submission-form.tsx` | 508 | E-Sign — document signing flow |
| `CommandPalette.tsx` | 486 | Navigation — keyboard-driven command palette |
| `account-settings-client.tsx` | 442 | Settings — user profile management |
| `BroadcastComposer.tsx` | 423 | Emergency — SMS broadcast composition |
| `signup-form.tsx` | 414 | Auth — new user registration |
| `payment-portal.tsx` | 408 | Finance — payment processing |
| `payment-dialog.tsx` | 373 | Finance — payment confirmation |
| `ViolationReportForm.tsx` | 354 | Violations — violation filing |
| `meeting-form.tsx` | 344 | Meetings — meeting scheduling |
| `signature-capture.tsx` | 337 | E-Sign — signature pad capture |

**What to test:** Rendering with various props/states, user interactions (click, type, submit), form validation, error/empty/loading states, accessibility (axe audits).

### 1.3 Page Route Components (0/83 tested)

No page.tsx files have any test coverage. These are the entry points users actually see.

**Highest-priority pages:**
- Dashboard pages (`/dashboard`, `/dashboard/apartment`)
- Document management pages
- Compliance pages
- Finance/payment pages
- E-sign pages
- Mobile pages (16 components, entire mobile experience)

---

## Priority 2 — High-Impact Gaps

### 2.1 Untested API Routes (45/139 missing)

**Emergency Broadcasts (5 routes)** — Safety-critical feature with zero route-level tests:
- `v1/emergency-broadcasts` (CRUD)
- `v1/emergency-broadcasts/[id]/cancel`
- `v1/emergency-broadcasts/[id]/send`
- `v1/emergency-broadcasts/templates`

**Internal/Cron Routes (6 routes)** — Automated financial processing with no tests:
- `v1/internal/late-fee-processor`
- `v1/internal/assessment-overdue`
- `v1/internal/assessment-due-reminders`
- `v1/internal/generate-assessments`
- `v1/internal/payment-reminders`
- `v1/internal/provision`

**E-Sign Template Routes (6 routes)** — Legal document management:
- `v1/esign/my-pending`
- `v1/esign/submissions/[id]/cancel`
- `v1/esign/submissions/[id]/download`
- `v1/esign/templates` (CRUD + clone)

**Move Checklists (4 routes)** — Entire feature untested at route level.

**PM Dashboard (4 routes)** — Bulk operations and reporting:
- `v1/pm/bulk/announcements`
- `v1/pm/bulk/documents`
- `v1/pm/dashboard/summary`
- `v1/pm/reports/[reportType]`

**Other Notable Gaps:**
- `v1/maintenance-requests` (2 routes)
- `v1/faqs` (3 routes)
- `v1/payments/fee-policy`, `v1/payments/update-intent`
- `v1/violations/[id]/dismiss`, `/hearing-notice`, `/notice`
- `v1/auth/confirm-verification`
- `v1/account/profile`

### 2.2 Untested Services (19/34 missing)

| Service | Risk |
|---------|------|
| `stripe-service.ts` | **High** — billing/payment processing |
| `finance-service.ts` | **High** — financial calculations |
| `calendar-sync-service.ts` | **Medium** — Google Calendar sync |
| `assessment-automation-service.ts` | **High** — automated fee/assessment processing |
| `onboarding-service.ts` | **Medium** — new community setup |
| `announcement-delivery.ts` | **Medium** — email/push delivery |
| `work-orders-service.ts` | **Medium** — maintenance workflow |
| `polls-service.ts` | **Medium** — voting/poll logic |
| `faq-service.ts` | **Low** — FAQ CRUD |
| `package-visitor-service.ts` | **Low** — package/visitor tracking |
| `accounting-connectors-service.ts` | **Medium** — QuickBooks/Xero integration |
| `contract-renewal-alerts.ts` | **Medium** — vendor contract alerting |
| `payment-alert-scheduler.ts` | **Medium** — payment reminder scheduling |
| `calendar-data-service.ts` | **Low** — calendar data aggregation |
| `photo-processor.ts` | **Low** — image processing |

### 2.3 Untested Utility/Lib Files (~30 files)

Key gaps in `apps/web/src/lib/`:
- `api/auth.ts`, `api/cron-auth.ts` — authentication helpers
- `dashboard/dashboard-selectors.ts`, `dashboard/load-dashboard-data.ts` — dashboard data logic
- `esign/esign-route-helpers.ts`, `esign/prebuilt-templates.ts` — e-sign utilities
- `finance/common.ts`, `finance/request.ts` — finance utilities
- `validation/zod-schemas.ts` — shared validation schemas
- `utils/sanitize-filename.ts`, `utils/finance-pdf.ts` — utility functions
- `markdown.ts`, `utils.ts` — root-level utilities

---

## Priority 3 — Structural Improvements

### 3.1 E2E Test Coverage

Currently only 2 Playwright smoke tests exist (`marketing-smoke.spec.ts`, `phase1-roadmap-smoke.spec.ts`). Critical user flows lack E2E coverage:

- **Authentication flow:** signup → email verification → login → dashboard
- **Document lifecycle:** upload → categorize → compliance scoring update
- **Meeting flow:** create meeting → attach agenda → send notice → compliance check
- **Payment flow:** view balance → initiate payment → confirmation
- **E-sign flow:** create template → send for signature → sign → download
- **Onboarding flow:** signup → community setup → invite residents

### 3.2 Integration Test Expansion

The 19 existing integration tests are strong but focused on Phase 1-2 features. Missing integration tests for:

- **Assessment automation lifecycle** — generate → overdue → late fee → reminder
- **Emergency broadcast delivery** — compose → send → Twilio webhook → status update
- **E-sign template lifecycle** — create → clone → send submission → sign → complete
- **PM bulk operations** — bulk announce/document across communities
- **Move checklist lifecycle** — create → step progression → completion

### 3.3 Test Infrastructure Improvements

1. **Coverage reporting:** No coverage tool is configured. Add `vitest --coverage` with Istanbul or V8 provider to get quantitative metrics.
2. **Component test utilities:** Create shared render helpers with common providers (QueryClient, theme, auth context) to reduce boilerplate.
3. **Mock standardization:** Some tests mock at different levels. Establish conventions for what gets mocked vs. tested through.
4. **Snapshot testing:** Consider snapshot tests for complex components as a regression safety net (not a substitute for behavioral tests).

---

## Recommended Action Plan

### Phase 1 — Quick Wins (1-2 weeks)
- [ ] Add vitest coverage reporting configuration
- [ ] Write tests for all 18 untested hooks (using `renderHook` pattern)
- [ ] Test the 6 internal/cron API routes (financial automation — high risk)
- [ ] Test emergency broadcast routes (safety-critical)

### Phase 2 — Core Component Coverage (2-3 weeks)
- [ ] Create shared component test utilities (providers, render helpers)
- [ ] Test top 10 largest untested components (listed above)
- [ ] Test the 19 untested services (prioritize stripe, finance, assessment)
- [ ] Add tests for remaining 45 untested API routes

### Phase 3 — E2E & Integration (2-3 weeks)
- [ ] Add Playwright E2E tests for 6 critical user flows
- [ ] Expand integration tests for Phase 2 features
- [ ] Add accessibility (axe) audits for all page routes

### Phase 4 — Ongoing Quality Gates
- [ ] Set minimum coverage thresholds in CI (e.g., 70% line coverage)
- [ ] Add coverage diff reporting to PRs
- [ ] Require tests for new components/hooks/services in PR review
