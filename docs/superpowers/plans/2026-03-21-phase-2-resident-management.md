# Phase 2: Resident Management & Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the missing resident management UI, fix the role model mismatch, add unit CRUD, create a CSV import interface, enable atomic create+invite, and add billing management UI.

**Architecture:** Resident management gets a dedicated dashboard page at `/dashboard/residents` with list, add, edit, and invite capabilities. The resident form is rewritten to use the v2 role model (`resident`/`manager`/`pm_admin` + `presetKey` + `isUnitOwner`). Unit CRUD gets a standalone API. CSV import gets a multi-step upload wizard. Billing gets a portal redirect page.

**Tech Stack:** Next.js 15, TanStack Query, Drizzle ORM, Zod, shadcn/ui components

**Audit References:** U-01, U-02, U-08, U-09, U-10, B-02, B-03, B-04, PM-02

---

### Task 1: Mount resident management page (U-09)

**Files:**
- Create: `apps/web/src/app/(authenticated)/dashboard/residents/page.tsx`
- Modify: `apps/web/src/components/layout/nav-config.ts` — add "Residents" nav item
- Reuse: `apps/web/src/components/residents/resident-list.tsx` (exists but unmounted)

- [ ] **Step 1:** Create the page server component at `/dashboard/residents/page.tsx`
  - Guard: `requireCommunityMembership` + `requirePermission(membership, 'residents', 'read')`
  - Render: `<ResidentList communityId={communityId} />`
- [ ] **Step 2:** Add "Residents" to `nav-config.ts` with icon and position (after "Documents")
  - Feature gate: always visible (residents exist in all community types)
  - Permission gate: `residents.read`
- [ ] **Step 3:** Test: log in as board_president → sidebar shows "Residents" → click → page loads
- [ ] **Step 4:** Commit

---

### Task 2: Fix resident form role model mismatch (U-08)

**Files:**
- Modify: `apps/web/src/components/residents/resident-form.tsx`
- Reference: `packages/shared/src/manager-presets.ts` (for preset keys)
- Reference: `apps/web/src/lib/utils/role-validator.ts`

**Approach:**
The form currently uses `COMMUNITY_ROLES` (legacy 7-role names). The API expects the v2 model:
- `role`: `resident` | `manager` | `pm_admin`
- `isUnitOwner`: boolean (only for `resident` role)
- `presetKey`: string (only for `manager` role)

The form needs a two-level selector:
1. Base role dropdown: "Resident (Owner)", "Resident (Tenant)", "Manager", "PM Admin"
2. If Manager selected: preset dropdown with "Board President", "Board Member", "CAM", "Site Manager"

- [ ] **Step 1:** Write test: resident form submits correct v2 role payload
- [ ] **Step 2:** Rewrite `ResidentForm` role selection to use v2 model
  - Replace single `role` dropdown with base role selector
  - Add conditional preset selector for manager role
  - Filter available presets by community type (apartments don't have board roles)
- [ ] **Step 3:** Add unit selector dropdown (fetched from `/api/v1/units` or passed as prop)
- [ ] **Step 4:** Test: open form → select "Manager" → "Board President" preset appears → submit → API returns 201
- [ ] **Step 5:** Commit

---

### Task 3: Atomic "create and invite" (U-02)

**Files:**
- Modify: `apps/web/src/app/api/v1/residents/route.ts` — add `sendInvitation` option
- Modify: `apps/web/src/components/residents/resident-form.tsx` — add "Send invitation email" checkbox

**Approach:**
Add an optional `sendInvitation: boolean` flag to the resident creation schema. When true, the POST handler also creates an invitation row and sends the email — all in one request. If the invitation send fails, the resident is still created (fire-and-forget on the email, log the error).

- [ ] **Step 1:** Add `sendInvitation` to the create resident Zod schema (optional, defaults `true`)
- [ ] **Step 2:** After creating the user_roles row, if `sendInvitation` is true, call the invitation creation logic inline
- [ ] **Step 3:** Add checkbox to `ResidentForm`: "Send invitation email" (checked by default)
- [ ] **Step 4:** Test: create resident with invitation → verify invitation email is sent (check server logs)
- [ ] **Step 5:** Commit

---

### Task 4: Unit CRUD API (U-10)

**Files:**
- Create: `apps/web/src/app/api/v1/units/route.ts` — GET (list) + POST (create)
- Create: `apps/web/src/app/api/v1/units/[id]/route.ts` — GET + PATCH + DELETE
- Create: `apps/web/src/app/(authenticated)/dashboard/units/page.tsx` — unit management page
- Test: `apps/web/__tests__/api/units.test.ts`

- [ ] **Step 1:** Write failing tests for GET /api/v1/units (list) and POST /api/v1/units (create)
- [ ] **Step 2:** Implement GET handler: `createScopedClient(communityId).query(units)` with sort/search/pagination
- [ ] **Step 3:** Implement POST handler: validate unit data, insert, log audit event
- [ ] **Step 4:** Implement PATCH (update unit details) and DELETE (soft delete) on `[id]` route
- [ ] **Step 5:** Create `/dashboard/units` page with unit list table and "Add Unit" form
- [ ] **Step 6:** Add "Units" to nav-config (visible for admin roles)
- [ ] **Step 7:** Test: create unit → edit → delete → verify
- [ ] **Step 8:** Commit

---

### Task 5: CSV import wizard UI (U-01)

**Files:**
- Create: `apps/web/src/app/(authenticated)/dashboard/import/page.tsx`
- Create: `apps/web/src/components/residents/import-wizard.tsx` — multi-step wizard component
- Create: `apps/web/src/components/residents/column-mapper.tsx` — column mapping UI
- Reuse: `apps/web/src/app/api/v1/import-residents/route.ts` (API exists)
- Reuse: `apps/web/src/lib/utils/csv-validator.ts`

**Approach:**
3-step wizard:
1. **Upload** — file input, parse CSV client-side with `papaparse`, show row count
2. **Map columns** — auto-detect known column names (from Buildium/AppFolio/generic patterns), let user adjust
3. **Preview & import** — dry-run via API (`dryRun: true`), show validation results (green/yellow/red), then submit for real

- [ ] **Step 1:** Install `papaparse` (`pnpm add papaparse @types/papaparse --filter @propertypro/web`)
- [ ] **Step 2:** Create `ImportWizard` component with 3-step state machine
- [ ] **Step 3:** Create `ColumnMapper` component for drag-and-drop column mapping
- [ ] **Step 4:** Add dry-run preview step that calls `POST /api/v1/import-residents` with `dryRun: true`
- [ ] **Step 5:** Add final import step with progress bar
- [ ] **Step 6:** Create `/dashboard/import` page mounting the wizard
- [ ] **Step 7:** Add "Import" button to the residents page that links to `/dashboard/import`
- [ ] **Step 8:** Test with sample CSV files (Buildium format, AppFolio format, generic)
- [ ] **Step 9:** Commit

---

### Task 6: Billing management (B-02, B-03, B-04)

**Files:**
- Create: `apps/web/src/app/(authenticated)/settings/billing/page.tsx`
- Modify: `apps/web/src/components/layout/nav-config.ts` — add "Billing" to settings section
- Reuse: `apps/web/src/app/(authenticated)/billing/portal/route.ts` (Stripe portal redirect exists)

**Approach:**
Create a billing settings page that shows:
1. Current plan name and price
2. Subscription status badge
3. "Manage Billing" button → redirects to Stripe Customer Portal (existing route at `/billing/portal`)
4. Recent invoice history (if available from Stripe)

- [ ] **Step 1:** Create the billing page reading `subscriptionPlan` and `subscriptionStatus` from the community
- [ ] **Step 2:** Map plan keys to display names and prices (reuse `SIGNUP_PLAN_OPTIONS` from signup-schema)
- [ ] **Step 3:** Add "Manage Billing" button linking to `/billing/portal`
- [ ] **Step 4:** Add "Billing" to nav-config under settings section (permission: `settings:read` + `pm_admin` or `cam` role)
- [ ] **Step 5:** Test: navigate to billing page → see plan info → click manage → redirect to Stripe portal
- [ ] **Step 6:** Commit

---

### Task 7: PM "Add Community" (PM-02)

**Files:**
- Create: `apps/web/src/app/(authenticated)/pm/dashboard/add/page.tsx` — or modal
- Modify: `apps/web/src/components/pm/PmDashboardClient.tsx` — add "Add Community" button

**Approach:**
The simplest approach is a button that links to `/signup?type=<defaultType>` pre-filled with the PM admin's email. After the new community is provisioned (with the `pm_admin` fix from Task 2), it will automatically appear in their portfolio.

A more integrated approach would be an inline wizard in the PM dashboard, but that's significantly more work and duplicates the signup flow. Start simple.

- [ ] **Step 1:** Add "Add Community" button to `PmDashboardClient` header area
- [ ] **Step 2:** Button links to `/signup` pre-filled with the PM's email
- [ ] **Step 3:** Test: click button → signup page loads → complete flow → new community appears in portfolio
- [ ] **Step 4:** Commit

---

## Verification Checklist

- [ ] "Residents" appears in the sidebar and the page loads with the resident list
- [ ] Creating a resident sends an invitation email in the same request
- [ ] The resident form uses v2 roles with preset selection for managers
- [ ] Units can be created, edited, and deleted after onboarding
- [ ] CSV import wizard successfully imports a Buildium-format CSV
- [ ] Billing page shows current plan and links to Stripe portal
- [ ] PM admin can start adding a new community from the portfolio dashboard
