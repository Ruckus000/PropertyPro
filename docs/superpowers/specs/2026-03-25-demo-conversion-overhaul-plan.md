# Demo Conversion Overhaul — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-03-25-demo-conversion-overhaul-design.md`
**Branch:** `claude/zen-hofstadter`
**Migrations:** 0121–0124 reserved
**Last journal index:** 120

## Phase 1: Foundation (Data Model + Price Migration)

### Step 1.1: Migration 0121 — `stripe_prices` table

**File:** `packages/db/migrations/0121_stripe_prices.sql`

Create `stripe_prices` table with CHECK constraints per spec Section 1A. Seed initial rows for all valid `(plan_id, community_type, billing_interval)` combinations from `SIGNUP_PLAN_OPTIONS`:

- `(essentials, condo_718, month)`
- `(essentials, hoa_720, month)`
- `(professional, condo_718, month)`
- `(professional, hoa_720, month)`
- `(operations_plus, apartment, month)`

Stripe price IDs seeded from current `STRIPE_PRICE_*` env var values (read once during migration authoring, hardcoded in SQL).

**Schema file:** Add `stripe_prices` to `packages/db/src/schema/stripe-prices.ts`. Export from `packages/db/src/schema/index.ts`.

**RLS config:** Add to `RLS_GLOBAL_TABLE_EXCLUSIONS` in `packages/db/src/schema/rls-config.ts` with reason: `'Billing configuration — global, not community-scoped. Managed by platform ops.'`. Bump nothing (tenant count stays 48).

**Journal:** Add entry at index 121.

**Verify:** `pnpm typecheck`, `pnpm guard:db-access`

### Step 1.2: `resolveStripePrice()` + migrate all checkout paths

**File:** `apps/web/src/lib/services/stripe-service.ts`

1. Add `resolveStripePrice(planId, communityType, interval)` function per spec.
2. Migrate `createEmbeddedCheckoutSession()` to call `resolveStripePrice()` instead of `getPriceId()`. It already receives `communityType` from `checkout.ts`.
3. Delete `getPriceId()`.

**File:** `apps/web/src/app/api/v1/subscribe/route.ts`

1. Load `communities.communityType` in the existing community query (line ~46).
2. Add plan validation: `SIGNUP_PLAN_OPTIONS[communityType]` check before price lookup.
3. Replace `getPriceId()` call with `resolveStripePrice(planId, communityType, 'month')`.

**File:** `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts`

1. Load `communities.communityType` in the existing demo join query.
2. Add plan validation: `SIGNUP_PLAN_OPTIONS[communityType]` check.
3. Replace price resolution with `resolveStripePrice()`.

**File:** `packages/shared/src/features/plan-features.ts`

Add the documentation comment block per spec about display prices being non-authoritative.

**Verify:** `pnpm typecheck`, ensure no remaining references to `getPriceId` or `STRIPE_PRICE_*` env vars in app code (env vars stay in `.env.local` until Phase 1 is deployed and validated, then removed).

### Step 1.3: Migration 0122 — `conversion_events` table

**File:** `packages/db/migrations/0122_conversion_events.sql`

Create table per spec Section 1B (9 event types — `self_service_upgrade_completed` removed per review).

**Schema file:** `packages/db/src/schema/conversion-events.ts`. Export from index.

**RLS config:** Add to `RLS_GLOBAL_TABLE_EXCLUSIONS` with reason: `'Analytics table — must survive demo soft-deletion and community conversion lifecycle. Not tenant-scoped because events span the demo→paid transition.'`

**Journal:** Add entry at index 122.

**Verify:** `pnpm typecheck`, `pnpm guard:db-access`

### Step 1.4: Migration 0123 — `trial_ends_at` + backfill

**File:** `packages/db/migrations/0123_trial_ends_at.sql`

1. `ALTER TABLE communities ADD COLUMN trial_ends_at timestamptz;`
2. `ALTER TABLE communities ADD CONSTRAINT chk_demo_trial_ordering ...` per spec.
3. Backfill: `UPDATE communities SET trial_ends_at = demo_expires_at - interval '7 days' WHERE is_demo = true AND deleted_at IS NULL AND demo_expires_at IS NOT NULL;`
4. Create INSERT trigger `enforce_demo_timestamps` per spec.
5. Backfill `grace_started` events into `conversion_events` for demos already in grace.

**Schema file:** Add `trialEndsAt` column to `packages/db/src/schema/communities.ts`.

**Journal:** Add entry at index 123.

**File:** `apps/web/src/lib/services/demo-conversion.ts`

Update `convertCommunity()` to also clear `trial_ends_at` alongside `demo_expires_at`.

**File:** `apps/admin/src/app/api/admin/demos/route.ts`

Change demo creation to set `trial_ends_at = now + 14 days` and `demo_expires_at = now + 21 days` (was 30 days). Pass both timestamps to `seedCommunity()`.

**Verify:** `pnpm typecheck`, `pnpm test` (existing demo tests may need updated expiry assertions)

### Step 1.5: `computeDemoStatus()` + event emission in existing routes

**File:** `packages/shared/src/demo/lifecycle.ts` (new)

Export `DemoLifecycleStatus` type and `computeDemoStatus()` function per spec.

**File:** `apps/admin/src/app/api/admin/demos/route.ts` (POST handler)

After successful demo instance creation, emit `demo_created` event (awaited best-effort).

**File:** `apps/web/src/app/api/v1/demo/[slug]/enter/route.ts`

After successful session creation, emit `demo_entered` event with `metadata: { role }` and `user_id: targetUserId`.

**File:** `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts`

After Stripe checkout session creation, emit `conversion_initiated` event.

**File:** `apps/web/src/lib/services/demo-conversion.ts`

1. Change `handleDemoConversion` signature to accept `stripeEventId` and `eventCreatedEpoch`.
2. After `convertCommunity()`: emit `checkout_completed`.
3. Add `demoId` param to `ensureFoundingUser()`. After roles created: emit `founding_user_created`.

**File:** `apps/web/src/app/api/v1/webhooks/stripe/route.ts`

1. Update `handleCheckoutSessionCompleted` to pass `event.id` and `event.created` to `handleDemoConversion()`.
2. Add `checkout.session.expired` handler per spec.

**Verify:** `pnpm typecheck`, `pnpm test`

### Step 1.6: Readiness endpoint

**File:** `apps/web/src/app/api/v1/internal/readiness/route.ts` (new)

Implement per spec Section 3F. Auth via `requireCronSecret`. Three checks: stripe_prices, database, supabase_auth.

**Env:** Add `READINESS_CHECK_SECRET` to `.env.local` and `.env.example`.

**Verify:** `pnpm typecheck`, manual test via curl

---

## Phase 2: Self-Service Upgrade Path

### Step 2.1: `DemoTrialBanner` component

**File:** `apps/web/src/components/demo/DemoTrialBanner.tsx` (new, replaces `DemoBanner`)

Implement per spec Section 2A. Three states: active trial (role switcher + progress bar + upgrade CTA), grace period (warning + subscribe CTA), converted/expired (not rendered).

**File:** `apps/web/src/components/layout/app-shell.tsx`

Update to pass `status`, `trialEndsAt`, `demoExpiresAt`, `communityType` to the banner. Replace `DemoBanner` import with `DemoTrialBanner`.

**Verify:** `pnpm typecheck`, visual check in dev server (login as demo user, verify banner renders)

### Step 2.2: Demo upgrade page

**File:** `apps/web/src/app/demo/[slug]/upgrade/page.tsx` (new)

Server component, auth via `@supabase/ssr` server client per spec Section 2B. Plan cards from `SIGNUP_PLAN_OPTIONS[communityType]`. Form submits to self-service endpoint.

**Verify:** `pnpm typecheck`, visual check

### Step 2.3: Self-service upgrade endpoint

**File:** `apps/web/src/app/api/v1/demo/[slug]/self-service-upgrade/route.ts` (new)

POST handler per spec Section 2C. Auth via Supabase SSR client, validate demo user, plan validation, `resolveStripePrice()`, Stripe checkout creation, event emission.

**Verify:** `pnpm typecheck`

### Step 2.4: `assertNotDemoGrace()` guard

**File:** `apps/web/src/lib/middleware/demo-grace-guard.ts` (new)

Implement `assertNotDemoGrace(communityId)` per spec Section 2E. Uses `createUnscopedClient()`.

### Step 2.5: Wire grace guard into all mutating routes

Add `await assertNotDemoGrace(communityId)` call to every mutating route after community ID resolution. Full route inventory (51 routes, grouped by resolution pattern):

**Body-derived (`parseCommunityIdFromBody` or similar):**
- `/api/v1/access-requests` POST
- `/api/v1/accounting/connect` POST
- `/api/v1/accounting/disconnect` DELETE
- `/api/v1/accounting/mapping` PUT
- `/api/v1/amenities` POST
- `/api/v1/amenities/[id]` PATCH
- `/api/v1/amenities/[id]/reserve` POST
- `/api/v1/announcements` POST
- `/api/v1/arc` POST
- `/api/v1/arc/[id]/review` PATCH
- `/api/v1/arc/[id]/decide` POST
- `/api/v1/arc/[id]/withdraw` POST
- `/api/v1/assessments` POST
- `/api/v1/assessments/[id]` PATCH, DELETE
- `/api/v1/calendar/google/connect` POST
- `/api/v1/calendar/google/disconnect` DELETE
- `/api/v1/calendar/google/sync` POST
- `/api/v1/delinquency/[unitId]/waive` POST
- `/api/v1/esign/submissions` POST
- `/api/v1/esign/submissions/[id]/cancel` POST
- `/api/v1/esign/submissions/[id]/remind` POST
- `/api/v1/esign/templates` POST
- `/api/v1/esign/templates/[id]` PATCH, DELETE
- `/api/v1/esign/templates/[id]/clone` POST
- `/api/v1/forum/threads` POST
- `/api/v1/forum/threads/[id]` PATCH, DELETE
- `/api/v1/forum/threads/[id]/reply` POST

**Header/context-derived (`resolveEffectiveCommunityId` or membership):**
- `/api/v1/access-requests/[id]/approve` POST
- `/api/v1/access-requests/[id]/deny` POST
- `/api/v1/community/contact` PATCH
- `/api/v1/contracts` POST, PATCH
- `/api/v1/documents` POST, DELETE
- `/api/v1/emergency-broadcasts` POST
- `/api/v1/emergency-broadcasts/[id]/send` POST
- `/api/v1/emergency-broadcasts/[id]/cancel` POST
- `/api/v1/faqs` POST
- `/api/v1/faqs/[id]` PATCH, DELETE
- `/api/v1/faqs/reorder` PATCH
- `/api/v1/import-residents` POST
- `/api/v1/invitations` POST, PATCH
- `/api/v1/leases` POST, PATCH, DELETE
- `/api/v1/maintenance-requests` POST

**Also needs guard (not in original subagent list — check during implementation):**
- `/api/v1/meetings/[id]` PATCH, DELETE
- `/api/v1/meetings` POST
- `/api/v1/move-checklists` POST
- `/api/v1/move-checklists/[id]/steps/[stepKey]` PATCH
- `/api/v1/notification-preferences` PUT
- `/api/v1/packages` POST
- `/api/v1/packages/[id]/pickup` POST
- `/api/v1/payments/create-intent` POST
- `/api/v1/payments/fee-policy` PATCH
- `/api/v1/pm/branding` PATCH
- `/api/v1/pm/bulk/announcements` POST
- `/api/v1/pm/bulk/documents` POST
- `/api/v1/polls` POST
- `/api/v1/polls/[id]/vote` POST
- `/api/v1/reservations` POST
- `/api/v1/reservations/[id]` PATCH, DELETE
- `/api/v1/residents` POST, PATCH, DELETE
- `/api/v1/residents/invite` POST
- `/api/v1/units` POST
- `/api/v1/upload` POST
- `/api/v1/vendors` POST
- `/api/v1/vendors/[id]` PATCH, DELETE
- `/api/v1/violations` POST
- `/api/v1/violations/[id]/dismiss` POST
- `/api/v1/violations/[id]/fine` POST
- `/api/v1/violations/[id]/hearing-notice` POST
- `/api/v1/violations/[id]/notice` POST
- `/api/v1/violations/[id]/resolve` POST
- `/api/v1/violations/evidence` POST
- `/api/v1/visitors` POST
- `/api/v1/visitors/[id]/checkin` POST
- `/api/v1/visitors/[id]/checkout` POST
- `/api/v1/visitors/[id]/revoke` POST
- `/api/v1/visitors/denied` POST
- `/api/v1/work-orders` POST
- `/api/v1/work-orders/[id]` PATCH
- `/api/v1/work-orders/[id]/complete` POST

**Explicit exceptions (do NOT add guard):**
- `POST /api/v1/demo/[slug]/self-service-upgrade`
- `POST /api/v1/demo/[slug]/enter`
- `POST /api/v1/admin/demo/[slug]/convert`
- `POST /api/v1/subscribe`
- All `/api/v1/webhooks/*`
- All `/api/v1/internal/*`
- All `/api/v1/auth/*`
- `POST /api/v1/account/delete`, `DELETE /api/v1/account/delete` (account-level, no community)
- `POST /api/v1/account/profile` (account-level)
- `POST /api/v1/onboarding/*` (pre-community)
- `POST /api/v1/esign/sign/[submissionExternalId]/[slug]` (unauthenticated public signer)
- `POST /api/v1/esign/consent` (user consent, not community write)
- `POST /api/v1/phone/verify/*` (account-level)
- `POST /api/v1/stripe/connect/*` (payment setup, not content write)
- `PUT /api/v1/settings/support-access` (admin setting, not demo-relevant)
- `PUT /api/v1/notification-preferences` — **actually include this** if it resolves a community ID
- `PUT /api/v1/transparency/settings` — include if community-scoped

**Verify:** `pnpm typecheck`, `pnpm test`. Integration test: create demo, fast-forward past `trial_ends_at`, attempt upload/document/meeting mutations — all should 403. Verify exceptions still work.

---

## Phase 3: Post-Conversion UX + Observability

### Step 3.1: Enhanced converted page

**File:** `apps/web/src/app/demo/[slug]/converted/page.tsx` (rewrite)

Server component with client island for polling. Four states per spec Section 3A. Session binding validation. Personalized vs generic rendering.

**File:** `apps/web/src/app/demo/[slug]/converted/polling-client.tsx` (new)

Client component for State 2 (webhook pending). `useEffect` with 5s interval, 60s max, calls `router.refresh()`.

### Step 3.2: Landing page post-conversion redirect

**File:** `apps/web/src/app/demo/[slug]/page.tsx`

Add check: if `isDemo === false`, `redirect('/demo/${slug}/converted')`. Server-side 307.

### Step 3.3: Expiry cron — grace-aware

**File:** `apps/web/src/app/api/v1/internal/expire-demos/route.ts`

Add Step 1 (grace detection + event emission) before existing expiry logic per spec Section 3C. Add `demo_soft_deleted` event emission after each soft-delete.

### Step 3.4: ConvertDemoDialog a11y fixes

**File:** `apps/admin/src/components/demo/ConvertDemoDialog.tsx`

Migrate to Radix `Dialog` from `apps/web/src/components/ui/dialog.tsx`. Add `aria-labelledby`. Replace raw Tailwind with semantic tokens.

### Step 3.5: Subscribe route enhancements

**File:** `apps/web/src/app/api/v1/subscribe/route.ts`

Emit `self_service_upgrade_started` event after checkout session creation (for non-demo communities upgrading). This was specified in Section 1 fixes to the subscribe route.

**Verify:** Full flow test: create demo → enter as board → wait for grace → attempt mutation (403) → click upgrade → complete checkout → verify converted page with personalized content → verify landing page redirects.

---

## Migration Summary

| Migration | Index | Content |
|-----------|-------|---------|
| `0121_stripe_prices.sql` | 121 | `stripe_prices` table + seed data |
| `0122_conversion_events.sql` | 122 | `conversion_events` table + indexes |
| `0123_trial_ends_at.sql` | 123 | `trial_ends_at` column + constraint + trigger + backfill + grace event backfill |

## Files Created (New)

| File | Phase |
|------|-------|
| `packages/db/src/schema/stripe-prices.ts` | 1 |
| `packages/db/src/schema/conversion-events.ts` | 1 |
| `packages/shared/src/demo/lifecycle.ts` | 1 |
| `apps/web/src/app/api/v1/internal/readiness/route.ts` | 1 |
| `apps/web/src/components/demo/DemoTrialBanner.tsx` | 2 |
| `apps/web/src/app/demo/[slug]/upgrade/page.tsx` | 2 |
| `apps/web/src/app/api/v1/demo/[slug]/self-service-upgrade/route.ts` | 2 |
| `apps/web/src/lib/middleware/demo-grace-guard.ts` | 2 |
| `apps/web/src/app/demo/[slug]/converted/polling-client.tsx` | 3 |

## Files Modified

| File | Phase | Change |
|------|-------|--------|
| `packages/db/src/schema/index.ts` | 1 | Export new schemas |
| `packages/db/src/schema/rls-config.ts` | 1 | Add 2 global exclusions |
| `packages/db/src/schema/communities.ts` | 1 | Add `trialEndsAt` column |
| `packages/db/migrations/meta/_journal.json` | 1 | Add entries 121-123 |
| `apps/web/src/lib/services/stripe-service.ts` | 1 | Add `resolveStripePrice()`, delete `getPriceId()` |
| `apps/web/src/app/api/v1/subscribe/route.ts` | 1 | Plan validation + price migration |
| `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts` | 1 | Plan validation + price migration + event emission |
| `apps/web/src/lib/services/demo-conversion.ts` | 1 | Signature change + event emission |
| `apps/web/src/app/api/v1/webhooks/stripe/route.ts` | 1 | Forward event metadata + expired handler |
| `apps/web/src/app/api/v1/demo/[slug]/enter/route.ts` | 1 | Event emission |
| `apps/admin/src/app/api/admin/demos/route.ts` | 1 | 14+7 timestamps + event emission |
| `packages/shared/src/features/plan-features.ts` | 1 | Documentation comment |
| `apps/web/src/components/layout/app-shell.tsx` | 2 | Pass trial props to banner |
| `~80 mutating route files` | 2 | Add `assertNotDemoGrace()` call |
| `apps/web/src/app/demo/[slug]/converted/page.tsx` | 3 | Rewrite with 4 states |
| `apps/web/src/app/demo/[slug]/page.tsx` | 3 | Post-conversion redirect |
| `apps/web/src/app/api/v1/internal/expire-demos/route.ts` | 3 | Grace detection + events |
| `apps/admin/src/components/demo/ConvertDemoDialog.tsx` | 3 | A11y migration |

## Verification Commands

```bash
pnpm typecheck                    # After every step
pnpm lint                         # Includes DB access guard
pnpm test                         # Unit tests
pnpm guard:db-access              # After schema changes
pnpm --filter @propertypro/db db:migrate  # After migrations
```
