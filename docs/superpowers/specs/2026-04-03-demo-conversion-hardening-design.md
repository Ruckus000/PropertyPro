# Demo-to-Subscriber Conversion Hardening

**Date:** 2026-04-03
**Status:** Design approved, pending implementation plan
**Scope:** 5 fixes to the demo conversion pipeline — correctness, auth, detection, idempotency, onboarding bridge

## Context

A comprehensive E2E review of the demo-to-subscriber flow (self-service upgrade and admin-assisted conversion) revealed 5 structural issues that can leave paying customers without a usable admin account, block internal tooling, and prevent webhook recovery from partial failures.

The onboarding revamp (merged 2026-04-03) introduced a 2-step wizard and persistent dashboard checklist. The converted demo user path was validated against this new onboarding flow — the lazy wizard creation and checklist bootstrapping handle converted demos correctly, but the upstream conversion pipeline has gaps that must be fixed first.

### Files in scope

| File | Role |
|------|------|
| `apps/web/src/lib/services/demo-conversion.ts` | Core conversion service |
| `apps/web/src/app/api/v1/webhooks/stripe/route.ts` | Stripe webhook handler |
| `apps/web/src/app/api/v1/demo/[slug]/self-service-upgrade/route.ts` | Self-service checkout |
| `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts` | Web app admin conversion (to be deprecated) |
| `apps/admin/src/components/demo/ConvertDemoDialog.tsx` | Admin UI dialog |
| `apps/admin/src/app/api/admin/demos/` | Admin API (new route location) |
| `apps/web/src/lib/demo/detect-demo-info.ts` | Demo detection logic |
| `packages/shared/src/manager-presets.ts` | `getPresetPermissions()` |
| `packages/db/src/schema/stripe-webhook-events.ts` | Webhook idempotency table |

---

## Finding 1: Founding User Creation Fails — Permissions Constraint Violation

### Problem

`ensureFoundingUser()` inserts a `role='manager'` row without populating the `permissions` column. The `chk_manager_has_permissions` constraint (`(role = 'manager' AND permissions IS NOT NULL) OR (role != 'manager')`) rejects the insert. The community has already been flipped to `isDemo: false` in a prior independent operation, so the customer pays but gets no admin account.

There is no transaction wrapping `convertCommunity()` and `ensureFoundingUser()` — they are sequential independent operations with separate DB clients.

### Root cause

The `user_roles` insert at line ~267 of `demo-conversion.ts` does not call `getPresetPermissions(presetKey, communityType)` before inserting the manager row. Every other code path that creates manager roles (residents route, import-residents route, onboarding service) does this correctly.

### Fix

**A. Populate permissions on the manager role insert.**

`ensureFoundingUser()` needs `communityType` to call `getPresetPermissions('board_president', communityType)`. The function already receives `communityId` — either:
- Pass `communityType` as a parameter from `handleDemoConversion()` (which already has the community row), or
- Fetch it within `ensureFoundingUser()` (adds one query but keeps the function self-contained).

Recommendation: pass it as a parameter — `handleDemoConversion()` already queries the community.

**B. Strengthen `ensureFoundingUser()` idempotency for partial-failure recovery.**

The function already checks for an existing `board_president` role and returns early if found. But it doesn't handle the case where the Supabase auth user was created on a prior attempt but the DB `users` row or `user_roles` rows weren't inserted (partial failure between external API call and DB writes).

Fix: after the existing role check, also check if a `users` row exists for the email. If so, reuse that user ID instead of calling `admin.auth.admin.createUser()` again (which would fail with "user already exists"). The existing `onConflictDoNothing()` on role inserts already handles duplicate role rows.

The resulting flow:
1. Check for existing `board_president` role → if found, return (fully provisioned)
2. Check for existing user by email → if found, reuse ID (auth user exists from prior attempt)
3. If no user exists, create via Supabase admin API + insert `users` row
4. Insert role rows with `onConflictDoNothing()` (safe for concurrent execution)
5. Send magic link (non-fatal)

**No transaction required.** Each step is idempotent. Combined with Finding 4 (webhook retry fix), a failed conversion can be safely retried by Stripe and will complete from wherever it left off.

---

## Finding 2: Admin Conversion Route — Cross-App Auth Broken

### Problem

The admin app (`localhost:3001`) uses cookie name `sb-admin-auth-token`. The web app's `requireAuthenticatedUserId()` reads the default Supabase cookie. When the admin dialog POSTs cross-origin to `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts` with `credentials: 'include'`, the web app ignores the admin cookie → 401.

### Root cause

Cookie name isolation between apps. The admin app explicitly sets `ADMIN_COOKIE_OPTIONS = { name: 'sb-admin-auth-token' }`. The web app uses default Supabase cookie config. No service-to-service auth fallback exists.

### Fix

**Move Stripe checkout session creation into the admin app.**

The admin app already has direct Supabase access and can query demo instances + communities. The only thing the web route does is create a Stripe checkout session — the admin app can do this directly.

New admin API route: `apps/admin/src/app/api/admin/demos/[slug]/convert/route.ts`
- Authenticates via admin session (uses `sb-admin-auth-token`)
- Verifies `pm_admin` role
- Validates plan availability for community type via `isPlanAvailableForCommunityType()`
- Creates Stripe checkout session with identical metadata shape to self-service flow
- Returns `{ checkoutUrl }` to the dialog

**Constraints:**
- `success_url` and `cancel_url` MUST target the web app origin (not admin origin). The founding user will interact with the web app post-payment.
- Checkout session metadata shape MUST be identical to what the webhook expects: `{ demoId, communityId, planId, slug, customerEmail, customerName }`. The webhook handler is the single processing path for both flows.
- Emit `conversion_initiated` event with `source: 'admin_app'` and `userId` of the admin who triggered it (audit trail).

**Cleanup:**
- Deprecate `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts` (remove or leave as dead code with a deprecation comment).
- Update `ConvertDemoDialog.tsx` to POST to the admin app's own API route instead of the web app.

---

## Finding 3: Demo Detection — Email Regex Fragility

### Problem

`detectDemoInfo()` in `detect-demo-info.ts` uses regex to parse `demo-board@[slug].getpropertypro.com` and `demo-resident@[slug].getpropertypro.com` to determine if the current user is a demo user and extract the slug. While this works today (all demo creation uses `@*.getpropertypro.com`), it's an indirect detection method when the DB has authoritative data.

### Root cause

The function was written as a pure function (no DB access) that infers demo status from email patterns. This creates a coupling between email naming conventions and feature behavior.

### Fix

**Convert to DB-backed detection.** Replace email parsing with a query against the `demo_instances` table.

New signature:
```typescript
async function detectDemoInfo(
  isDemo: boolean,
  userId: string,
  communityId: number,
): Promise<DemoDetectionResult | null>
```

Logic:
1. If `!isDemo`, return null (fast path — most users)
2. Query `demo_instances` where `seededCommunityId = communityId` and (`demoBoardUserId = userId` OR `demoResidentUserId = userId`)
3. If found, return `{ isDemoMode: true, currentRole, slug, status, ... }` derived from the demo instance record
4. If not found, return null

The `currentRole` is determined by which user ID matched (`demoBoardUserId` → 'board', `demoResidentUserId` → 'resident'). The slug comes directly from `demo_instances.slug`. Status is computed from `demoExpiresAt` / `trialEndsAt` as before.

**Call site updates (2 production, 1 test):**
- `apps/web/src/app/(authenticated)/layout.tsx` — main authenticated layout
- `apps/web/src/app/mobile/layout.tsx` — mobile layout
- `apps/web/__tests__/demo/detect-demo-info.test.ts` — rewrite tests for new signature

All callers currently pass `(isDemo, userEmail, trialEndsAt, demoExpiresAt, communityType)`. Update them to pass `(isDemo, userId, communityId)` instead. Both `userId` and `communityId` are available in auth context at every call site.

**Remove the email regex entirely.** No fallback, no dual-path detection. The DB is the single source of truth.

---

## Finding 4: Webhook Idempotency — Failed Events Permanently Stuck

### Problem

Two compounding issues prevent recovery from partial webhook failures:

1. The idempotency check queries `WHERE eventId = ?` without checking `processedAt IS NOT NULL`. A row inserted during a failed first attempt blocks all retries.
2. The webhook always returns HTTP 200 even on processing errors, so Stripe never retries.

Result: if processing fails halfway (e.g., community converted but founding user creation throws), the event is permanently stuck. Cannot be retried by Stripe or manually.

### Root cause

The idempotency fence was designed to prevent duplicate processing but doesn't distinguish "processed successfully" from "attempted but failed."

### Fix

**A. Update the idempotency check to allow retries of failed events.**

Change the initial query from:
```sql
SELECT eventId FROM stripe_webhook_events WHERE eventId = ?
```
To:
```sql
SELECT eventId, processedAt FROM stripe_webhook_events WHERE eventId = ?
```

Logic:
- If no row exists → continue (first attempt)
- If row exists AND `processedAt IS NOT NULL` → return 200 (already processed, true duplicate)
- If row exists AND `processedAt IS NULL` → continue to processing (prior attempt failed, retry)

On retry, skip the INSERT step (row already exists) and go straight to the handler.

**B. Return 500 on processing errors.**

Change the catch block to return HTTP 500 instead of 200. Stripe retries on 5xx with exponential backoff (up to ~3 days). This is the standard Stripe integration pattern.

Only return 200 when:
- Processing succeeded (set `processedAt`, return 200)
- Event was already successfully processed (true duplicate, return 200)

**C. Concurrent retry safety.**

Two Stripe deliveries could both see `processedAt IS NULL` and start processing simultaneously. This is safe because:
- `convertCommunity()` is idempotent (`WHERE isDemo = true` returns 0 rows on second call)
- `ensureFoundingUser()` is idempotent after the Finding 1 fix (checks for existing role, reuses existing user, `onConflictDoNothing()` on inserts)

Concurrent execution is wasteful but not harmful. No additional locking needed.

---

## Finding 5: Converted User Onboarding Path

### Problem (as originally reported)

Demo conversion creates no `onboarding_wizard_state` or `onboarding_checklist_items`. Concern was that the founding user would bypass onboarding entirely.

### Verified behavior

The existing system handles this correctly through lazy initialization:

1. Founding user clicks magic link → logs in → middleware routes to dashboard
2. Dashboard checks wizard state → null → redirects to `/onboarding/{type}`
3. Wizard GET handler calls `getOrCreateWizardState()` → creates row with `status: 'in_progress'`
4. User completes 2-step wizard (profile + compliance preview)
5. Wizard POST handler sets `status: 'completed'` and calls `createChecklistItems()`
6. User lands on dashboard with persistent checklist

This works for both condo and apartment communities (separate dashboard pages with independent wizard checks).

### Residual issues (two small fixes)

**A. Set explicit `redirectTo` on magic link.**

`ensureFoundingUser()` generates the magic link via `admin.auth.admin.generateLink({ type: 'magiclink', email })` with no `redirectTo`. The user lands wherever Supabase's default site URL points. This works today but is implicit.

Fix: add `redirectTo: '/dashboard'` to the `generateLink()` options. One line, makes the intent explicit, resilient to Supabase config changes.

**B. Write an integration test for the converted user path.**

Test traces: conversion webhook → founding user created → user logs in → wizard redirect fires → wizard completion → checklist items created → dashboard renders checklist.

This validates the end-to-end path and catches regressions if the wizard redirect logic or checklist bootstrapping changes.

### What we're NOT doing

- No conversion-aware checklist branching. The generic checklist items ("Upload first document") are directionally correct even with sample data present — the founding user should replace demo content with real content.
- No sample data cleanup on conversion. Demo documents/announcements persist and can be manually replaced.
- No new status columns or tables. Conversion state is derivable from existing data: `isDemo` flag, `stripeSubscriptionId` presence, `board_president` role existence, `stripe_webhook_events.processedAt`.

---

## Summary of changes

| Finding | Fix | Files touched | Risk |
|---------|-----|---------------|------|
| 1. Permissions constraint | Populate permissions + strengthen idempotency | `demo-conversion.ts` | Low — follows established pattern |
| 2. Admin auth | Move checkout creation to admin app | `ConvertDemoDialog.tsx`, new admin route, deprecate web route | Medium — new route, but logic is identical |
| 3. Demo detection | Replace email regex with DB query | `detect-demo-info.ts`, call sites | Low — cleaner, removes fragile coupling |
| 4. Webhook idempotency | Check `processedAt`, return 500 on errors | `stripe/route.ts` | Medium — changes error handling contract |
| 5. Onboarding bridge | Explicit `redirectTo` + integration test | `demo-conversion.ts`, new test file | Low — one-line fix + test |

### What this spec does NOT cover

- Stripe checkout session creation is unchanged (metadata shape, price resolution, success/cancel URLs)
- The self-service upgrade form and page are unchanged
- The converted polling page is unchanged
- The onboarding wizard and checklist are unchanged
- No new database migrations required
- No new environment variables required
