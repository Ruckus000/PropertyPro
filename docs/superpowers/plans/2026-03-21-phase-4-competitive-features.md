# Phase 4: Competitive Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add competitive differentiators: self-service resident signup, expanded data export, branding bulk-copy, mobile deep linking, and CSRF protection.

**Architecture:** These are independent features that can be implemented in any order. Each adds a new capability without modifying existing flows.

**Tech Stack:** Next.js 15, Supabase Auth, Drizzle ORM, archiver (ZIP), TanStack Query

**Audit References:** U-06, E-06, PM-07, E-08, M-06

---

### Task 1: Self-service resident signup with admin approval (U-06)

**Files:**
- Create: `apps/web/src/app/(public)/join/[slug]/page.tsx` — public registration page
- Create: `apps/web/src/app/api/v1/join/route.ts` — POST handler for join requests
- Create: `packages/db/src/schema/join-requests.ts` — join_requests table
- Create: `apps/web/src/app/(authenticated)/dashboard/join-requests/page.tsx` — admin approval page
- Migration: `packages/db/migrations/NNNN_add_join_requests.sql`

**Approach:**
1. Public page at `join.propertyprofl.com/<slug>` or `<slug>.propertyprofl.com/join`
2. Collects: name, email, unit number (selected from community's units), phone (optional)
3. Creates a `join_requests` row (status: `pending`)
4. Admin sees pending requests in dashboard → approve (creates user + role + invitation) or reject
5. Approved users receive the standard invitation email

- [ ] **Step 1:** Create `join_requests` schema and migration
- [ ] **Step 2:** Create public join page with form
- [ ] **Step 3:** Create POST API with validation (unit must exist, email not already a member)
- [ ] **Step 4:** Create admin approval page with approve/reject actions
- [ ] **Step 5:** Wire approval to atomic create+invite flow from Phase 2 Task 3
- [ ] **Step 6:** Add notification to admins when new join request arrives
- [ ] **Step 7:** Test full flow: resident submits → admin approves → resident receives invitation
- [ ] **Step 8:** Commit

---

### Task 2: Expanded data export (E-06)

**Files:**
- Modify: `apps/web/src/app/api/v1/export/route.ts` — add missing data types
- Modify: `apps/web/src/app/(authenticated)/settings/export/page.tsx` — add format/scope options

**Approach:**
The existing export generates a ZIP with 4 CSVs. Expand to include:
- `meetings.csv` — meeting records with dates, types, statuses
- `compliance.csv` — checklist items with deadlines and statuses
- `leases.csv` — lease records (apartment communities)
- `financial_summary.csv` — assessment and payment data
- `violations.csv` — violation records

- [ ] **Step 1:** Add `meetings.csv` generation to export handler
- [ ] **Step 2:** Add `compliance.csv` generation
- [ ] **Step 3:** Add `leases.csv` generation (gated on `hasLeaseTracking`)
- [ ] **Step 4:** Add financial and violations CSVs
- [ ] **Step 5:** Update export page UI with checkboxes for which data types to include
- [ ] **Step 6:** Test: export with all types checked → verify ZIP contents
- [ ] **Step 7:** Commit

---

### Task 3: Branding bulk-copy across communities (PM-07)

**Files:**
- Create: `apps/web/src/app/api/v1/pm/bulk/branding/route.ts`
- Modify: `apps/web/src/components/pm/BrandingCopyDialog.tsx` — wire to bulk API

**Approach:**
1. POST accepts `{ sourceCommunityId, targetCommunityIds[], fields[] }` where fields can include colors, fonts, logo, email footer
2. Validates all target communities are in the PM's portfolio
3. Copies selected branding fields from source to each target
4. Returns per-community success/failure

- [ ] **Step 1:** Create bulk branding API route
- [ ] **Step 2:** Wire `BrandingCopyDialog` to call the API
- [ ] **Step 3:** Test: copy branding from community A to communities B+C → verify
- [ ] **Step 4:** Commit

---

### Task 4: Mobile deep linking (E-08)

**Files:**
- Modify: `packages/email/src/templates/` — update email templates to detect mobile context
- Create: `apps/web/src/lib/utils/deep-link.ts` — helper to generate mobile-aware URLs

**Approach:**
Email links currently point to desktop paths (`/dashboard/announcements/123`). Add a helper that generates mobile-first links (`/mobile/announcements/123`) when the recipient is a resident (non-admin role). The email templates already have access to the recipient's role from the template data.

- [ ] **Step 1:** Create `generateDeepLink(path, recipientRole)` helper
- [ ] **Step 2:** Update announcement notification template to use deep links
- [ ] **Step 3:** Update meeting notice template
- [ ] **Step 4:** Test: resident receives email → link goes to `/mobile/...`
- [ ] **Step 5:** Commit

---

### Task 5: CSRF protection (M-06)

**Files:**
- Modify: `apps/web/src/middleware.ts` — add Origin/Referer validation for state-changing requests

**Approach:**
For POST/PATCH/DELETE requests to `/api/v1/*`, verify that the `Origin` header matches an allowed origin (reuse `isAllowedOrigin` from `security-headers.ts`). Exempt webhook routes and token-authenticated routes.

- [ ] **Step 1:** Add Origin check to middleware for mutation requests
- [ ] **Step 2:** Exempt TOKEN_AUTH_ROUTES (webhooks, invitations, etc.)
- [ ] **Step 3:** Return 403 with `CSRF_VIOLATION` error code on mismatch
- [ ] **Step 4:** Test: legitimate request → passes; cross-origin POST → blocked
- [ ] **Step 5:** Commit

---

## Verification Checklist

- [ ] Residents can self-register via public join page, admin approves
- [ ] Data export includes meetings, compliance, leases, financial data
- [ ] PM admin can copy branding from one community to many
- [ ] Resident email links go to mobile paths
- [ ] Cross-origin POST to API returns 403
