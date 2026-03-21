# Phase 3: Polish & Edge Cases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix UX friction points across account settings, signup resilience, invitation management, PM dashboard continuity, and middleware performance.

**Architecture:** Small, focused changes across multiple surfaces. Each task is independent and can be implemented in any order.

**Tech Stack:** Next.js 15, Supabase Auth, Tailwind CSS, TanStack Query

**Audit References (covered):** E-02, O-04, O-05, O-07, O-08, O-09, U-04, PM-06, PM-09, M-05

**Deferred to future work (P2/P3, lower priority):**
- E-01 (password reset 5s timeout), PM-04/PM-05 (bulk doc metadata), M-01/M-02/M-09 (middleware perf), M-07/M-08 (XSS/cookie domain), M-10 (duplicate of E-01), PM-10 (bulk query perf), D-03/D-04 (demo expiry), B-05/B-06 (pricing DRY), O-06 (onboarding tracking), U-03/U-05/U-07 (user lifecycle), PM-01 (pm subdomain), M-03/M-04 (header cleanup), E-03/E-04/E-05/E-07 (notifications, idempotency, mobile middleware)

---

### Task 1: Account settings page (E-02)

**Files:**
- Create: `apps/web/src/app/(authenticated)/settings/account/page.tsx`
- Create: `apps/web/src/components/settings/account-settings-form.tsx`
- Modify: `apps/web/src/components/layout/nav-config.ts` — add account settings link

- [ ] **Step 1:** Create page with sections: Profile (name), Email (display only), Password (change via Supabase)
- [ ] **Step 2:** Wire password change to `supabase.auth.updateUser({ password })`
- [ ] **Step 3:** Add to nav-config under settings
- [ ] **Step 4:** Test: change password → log out → log in with new password
- [ ] **Step 5:** Commit

---

### Task 2: Strengthen invitation password validation (O-08)

**Files:**
- Modify: `apps/web/src/app/api/v1/invitations/route.ts` — PATCH handler schema
- Modify: `apps/web/src/components/auth/set-password-form.tsx` — client-side validation

- [ ] **Step 1:** Update `acceptInvitationSchema.password` to match `signupSchema` complexity: `z.string().min(8).max(72).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^a-zA-Z0-9]/)`
- [ ] **Step 2:** Add matching client-side validation hints to `SetPasswordForm`
- [ ] **Step 3:** Test: try weak password → see validation error → use strong password → success
- [ ] **Step 4:** Commit

---

### Task 3: Onboarding wizard data pre-population (O-05)

**Files:**
- Modify: `apps/web/src/app/api/v1/onboarding/condo/route.ts` — GET handler
- Modify: `apps/web/src/app/api/v1/onboarding/apartment/route.ts` — GET handler

- [ ] **Step 1:** In GET handler, when creating a new wizard state, pre-populate step 1 (Profile) with `communities.name`, `communities.address`, `communities.timezone`
- [ ] **Step 2:** Test: after provisioning, navigate to onboarding → profile step is pre-filled
- [ ] **Step 3:** Commit

---

### Task 4: Fix condo wizard maxStepIndex bug (O-09)

**Files:**
- Modify: `apps/web/src/lib/queries/wizard-state.ts`

- [ ] **Step 1:** Change `maxStepIndex` for condo wizard from `2` to `3`
- [ ] **Step 2:** Test: complete steps 0-2 → wizard allows navigation to step 3 (Units)
- [ ] **Step 3:** Commit

---

### Task 5: Stuck signup recovery (O-04)

**Files:**
- Create: `apps/admin/src/app/api/admin/signups/route.ts` — list pending signups
- Create: `apps/admin/src/app/signups/page.tsx` — admin page for stuck signups
- Modify: `apps/admin/src/components/Sidebar.tsx` — add "Signups" nav item

- [ ] **Step 1:** Create GET endpoint listing `pending_signups` with status filtering
- [ ] **Step 2:** Create admin page showing stuck signups (status != completed/expired) with retry/expire actions
- [ ] **Step 3:** Add retry action: calls existing `/api/v1/internal/provision` endpoint
- [ ] **Step 4:** Add expire action: sets status to `expired`
- [ ] **Step 5:** Test: view stuck signups → retry or expire
- [ ] **Step 6:** Commit

---

### Task 6: Invitation management (U-04)

**Files:**
- Create: `apps/web/src/app/api/v1/invitations/[id]/route.ts` — GET single, DELETE (revoke)
- Modify: `apps/web/src/app/api/v1/invitations/route.ts` — add GET for listing
- Modify: `apps/web/src/components/residents/resident-list.tsx` — add invitation status and resend button

- [ ] **Step 1:** Add GET handler to list pending invitations for the community
- [ ] **Step 2:** Add "Resend" action: creates a new invitation for the same user (invalidates the old one)
- [ ] **Step 3:** Show invitation status on resident list: "Invited (pending)" / "Active" / "Expired"
- [ ] **Step 4:** Test: create invitation → see pending status → resend → new invitation created
- [ ] **Step 5:** Commit

---

### Task 7: PM dashboard "Back to Portfolio" (PM-06)

**Files:**
- Modify: `apps/web/src/app/(authenticated)/layout.tsx` — detect PM context and show breadcrumb
- Or modify: `apps/web/src/components/layout/app-shell.tsx` — add portfolio link when user is `pm_admin`

- [ ] **Step 1:** When user has `pm_admin` role, show a "Portfolio" breadcrumb/link in the header
- [ ] **Step 2:** Test: navigate from PM dashboard → community → breadcrumb → back to portfolio
- [ ] **Step 3:** Commit

---

### Task 8: Community settings UI (PM-09)

**Files:**
- Create: `apps/web/src/app/(authenticated)/settings/community/page.tsx`
- Create: `apps/web/src/components/settings/community-settings-form.tsx`

- [ ] **Step 1:** Create page with toggles for each write-level setting (announcements, meetings, documents, etc.)
- [ ] **Step 2:** Save via PATCH to community settings API
- [ ] **Step 3:** Gate to admin roles only
- [ ] **Step 4:** Test: toggle settings → verify RLS enforcement changes
- [ ] **Step 5:** Commit

---

### Task 9: Verify-email page polling (M-05)

**Files:**
- Modify: `apps/web/src/app/auth/verify-email/page.tsx`

- [ ] **Step 1:** Add 5-second interval polling that calls `supabase.auth.getUser()` to check `email_confirmed_at`
- [ ] **Step 2:** When confirmed, auto-redirect to `returnTo` URL
- [ ] **Step 3:** Show visual indicator that the page is checking
- [ ] **Step 4:** Commit

---

### Task 10: Hardcoded timezone fix (O-07)

**Files:**
- Modify: `apps/web/src/lib/services/provisioning-service.ts` — `stepCommunityCreated`

- [ ] **Step 1:** Default to `America/New_York` but accept timezone from `pending_signups.payload` if present
- [ ] **Step 2:** (Future) add timezone picker to signup form
- [ ] **Step 3:** Commit

---

## Verification Checklist

- [ ] Account settings page loads with password change functionality
- [ ] Invitation passwords require the same complexity as signup
- [ ] Onboarding wizards pre-fill community profile data
- [ ] Condo wizard correctly shows all 4 steps
- [ ] Stuck signups are visible in admin panel with retry/expire actions
- [ ] Invitation status shows on resident list with resend capability
- [ ] PM admins can navigate back to portfolio from any community
