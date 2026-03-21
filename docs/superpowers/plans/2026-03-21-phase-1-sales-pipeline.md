# Phase 1: Unblock the Sales Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable plan-based feature gating, fix provisioning role assignment, add demo-to-customer conversion, and create durable demo share links.

**Architecture:** Feature gating adds a `PLAN_FEATURES` matrix that maps `SignupPlanId → CommunityFeatures` overrides, checked by a new `requirePlanFeature()` guard alongside the existing community-type guard. Provisioning is patched to assign `pm_admin` when the signup's `planKey` indicates a PM-level plan. Demo conversion adds a new admin API that flips `is_demo`, links to Stripe checkout, and preserves branding. Durable links use a configurable TTL on HMAC tokens.

**Tech Stack:** Next.js 15, Drizzle ORM, Stripe, `@propertypro/shared` feature system, `apps/admin/` operator console

**Audit References:** B-01, C-04, C-01, C-02, C-03, D-01, D-02

---

### Task 1: Plan-based feature gating (B-01)

**Files:**
- Create: `packages/shared/src/features/plan-features.ts` — `PLAN_FEATURES` matrix mapping `SignupPlanId → Partial<CommunityFeatures>`
- Modify: `packages/shared/src/features/get-features.ts` — `getFeaturesForCommunity(type, planKey?)` to merge plan overrides
- Create: `apps/web/src/lib/middleware/plan-guard.ts` — `requirePlanFeature(membership, featureKey)` guard
- Modify: `packages/db/src/schema/communities.ts` — ensure `subscriptionPlan` is reliably populated
- Modify: `apps/web/src/app/(authenticated)/layout.tsx` — pass `planKey` into the features resolution
- Test: `packages/shared/__tests__/features/plan-features.test.ts`

**Approach:**
1. Define `PLAN_FEATURES` constant mapping each `SignupPlanId` to feature overrides:
   - `compliance_basic`: `{ hasMobileApp: false, hasEsign: false, hasFinance: false, hasViolations: false }`
   - `compliance_plus_mobile`: `{ hasEsign: false, hasFinance: false }`
   - `full_platform`: `{}` (all features enabled by community type)
   - `apartment_operations`: `{}` (all features enabled by community type)
2. `getFeaturesForCommunity(type, planKey?)` returns `{ ...COMMUNITY_FEATURES[type], ...PLAN_FEATURES[planKey] }`
3. `requirePlanFeature()` throws `ForbiddenError` with a user-friendly "upgrade your plan" message
4. Nav config already uses `features[item.featureKey]` — this will automatically hide gated nav items
5. API routes that check features (via `requireFinanceEnabled`, `requireEsignEnabled`, etc.) already call `getFeaturesForCommunity` — they'll inherit plan restrictions once `planKey` is passed through

- [ ] **Step 1:** Write unit tests for `PLAN_FEATURES` matrix and merged feature resolution
- [ ] **Step 2:** Run tests — expect failure
- [ ] **Step 3:** Implement `plan-features.ts` with the matrix
- [ ] **Step 4:** Modify `getFeaturesForCommunity` to accept optional `planKey` parameter
- [ ] **Step 5:** Run tests — expect pass
- [ ] **Step 6:** Add `planKey` to the authenticated layout's feature resolution (read from `communities.subscriptionPlan`)
- [ ] **Step 7:** Add `requirePlanFeature()` guard
- [ ] **Step 8:** Test end-to-end: log in as a user in a community with `compliance_basic` plan, verify e-sign nav item is hidden
- [ ] **Step 9:** Commit

---

### Task 2: Fix provisioning role assignment (C-04, O-03, PM-03)

**Files:**
- Modify: `apps/web/src/lib/services/provisioning-service.ts` — `stepUserLinked()` function
- Test: `apps/web/__tests__/services/provisioning-service.test.ts`

**Approach:**
The `stepUserLinked()` function currently inserts a `user_roles` row with:
- `role: 'manager'` + `presetKey: 'board_president'` (condo/HOA)
- `role: 'manager'` + `presetKey: 'site_manager'` (apartment)

This should be changed to assign `pm_admin` role for the founding user, since they are the subscription owner and need access to the PM portfolio dashboard. The `presetKey` is not used for `pm_admin` (it gets blanket permissions).

- [ ] **Step 1:** Write test: `stepUserLinked assigns pm_admin role for founding user`
- [ ] **Step 2:** Run test — expect failure
- [ ] **Step 3:** Modify `stepUserLinked` to insert `role: 'pm_admin'` instead of `role: 'manager'`
- [ ] **Step 4:** Run test — expect pass
- [ ] **Step 5:** Verify: log in as a newly provisioned user, navigate to `/pm/dashboard/communities` — should load the portfolio dashboard
- [ ] **Step 6:** Commit

---

### Task 3: Durable demo share links (D-01, D-02)

**Files:**
- Modify: `apps/admin/src/app/api/admin/demos/route.ts` — POST response to include long-lived share URLs
- Modify: `apps/admin/src/app/demo/[id]/preview/SplitPreviewClient.tsx` — "Copy link" to use durable URL
- Modify: `packages/shared/src/server.ts` — `generateDemoToken` to accept configurable TTL
- Create: `apps/web/src/app/(public)/demo/[slug]/page.tsx` — public prospect landing page
- Test: `packages/shared/__tests__/demo-token.test.ts`

**Approach:**
1. Add `ttlHours` parameter to `generateDemoToken()` (default: 168 hours = 7 days)
2. On demo creation, generate a 7-day `shareToken` and store it on `demo_instances.shareToken`
3. Create a public-facing page at `apps/web/src/app/(public)/demo/[slug]/page.tsx` that:
   - Looks up demo by slug
   - Validates the share token from query param
   - Renders a branded landing page with "View as Board Member" and "View as Resident" buttons
   - Each button links to `/api/v1/auth/demo-login?token=<freshly-generated-1hr-token>`
4. Update `SplitPreviewClient` "Copy link" to copy the public page URL with the 7-day share token

- [ ] **Step 1:** Add `ttlHours` parameter to `generateDemoToken` with test
- [ ] **Step 2:** Add `shareToken` column to `demo_instances` (migration)
- [ ] **Step 3:** Update demo creation POST to generate and store 7-day share token
- [ ] **Step 4:** Create public demo landing page at `/demo/[slug]`
- [ ] **Step 5:** Update "Copy link" in `SplitPreviewClient` to use the public URL
- [ ] **Step 6:** Test: create a demo, copy the share link, open in incognito — should see landing page
- [ ] **Step 7:** Commit

---

### Task 4: Demo-to-customer conversion flow (C-01, C-02, C-03)

**Files:**
- Create: `apps/admin/src/app/api/admin/demos/[id]/convert/route.ts` — conversion API
- Create: `apps/admin/src/components/demo/ConvertDemoDialog.tsx` — confirmation dialog
- Modify: `apps/admin/src/app/demo/page.tsx` — add "Convert" action
- Modify: `apps/web/src/lib/services/stripe-service.ts` — checkout for existing community
- Modify: `apps/web/src/app/api/v1/webhooks/stripe/route.ts` — handle conversion checkout

**Approach:**
Two conversion strategies:

**Strategy A (simpler, recommended):** In-place upgrade
1. Admin clicks "Convert to Customer" in the demo list
2. Dialog collects the prospect's email (who will be the billing owner)
3. `POST /api/admin/demos/:id/convert` does:
   - Creates a Supabase auth user for the prospect (or links existing)
   - Creates a `pending_signups` row with status `email_verified` (bypass verification since this is admin-initiated)
   - Flips `communities.is_demo = false` on the demo's community
   - Clears `demoExpiresAt`
   - Creates a Stripe Checkout session for the prospect's email
   - Returns the checkout URL
4. Admin sends the checkout URL to the prospect
5. Prospect completes payment → webhook fires → updates `subscriptionPlan`/`subscriptionStatus` on the existing community
6. Prospect can log in and see their community with all demo customizations preserved

- [ ] **Step 1:** Write the conversion API route with Zod schema validation
- [ ] **Step 2:** Add `createCheckoutForExistingCommunity()` to stripe-service
- [ ] **Step 3:** Handle the `checkout.session.completed` webhook for conversion checkouts (detect via metadata flag `isConversion: true`)
- [ ] **Step 4:** Create `ConvertDemoDialog` component
- [ ] **Step 5:** Add "Convert" action to demo list page
- [ ] **Step 6:** Test full flow: create demo → convert → complete checkout → verify community is no longer demo
- [ ] **Step 7:** Commit

---

## Verification Checklist

- [ ] A `compliance_basic` community cannot access e-sign, finance, or violations features
- [ ] A `full_platform` community has full access to all features for its type
- [ ] Newly provisioned founding users land on the PM portfolio dashboard
- [ ] Demo share links work for 7 days in incognito browsers
- [ ] Demo conversion preserves branding and community data while enabling Stripe billing
