# Demo Lifecycle Cluster — Design Spec

**Date:** 2026-03-22
**Branch:** `phase-4-remaining`
**Audit codes:** C-01, C-02, C-03, D-01, D-02, D-04

## Overview

Three tightly coupled features that complete the demo lifecycle: durable share links with a public landing page, demo-to-customer conversion via Stripe, and automated demo expiry enforcement.

## 1. Public Demo Landing Page (D-01 / D-02)

### Problem

Demo share links use HMAC tokens with a 1-hour TTL. Prospects can't bookmark or revisit demos. Admins must regenerate links repeatedly during multi-week sales cycles. There's no prospect-facing entry point — only raw token URLs.

### Solution

A public page at `/demo/[slug]` on the web app that serves as the stable, shareable demo entry point.

### Route

`apps/web/src/app/demo/[slug]/page.tsx` — public, no auth required.

### Behavior

1. Server component fetches `demo_instances` by slug, joins `communities` for branding. Query MUST check `communities.deleted_at IS NULL` alongside `demo_instances` lookup.
2. If demo not found OR community soft-deleted → 404.
3. If `communities.demo_expires_at < now()` → render "Demo expired" page with contact info.
4. Renders branded landing page:
   - Community logo (from `theme.logoPath` in Supabase Storage, guarded against missing keys)
   - Community name and type badge
   - Primary/secondary colors from `theme` (with fallback defaults if absent)

   > **Note:** `demo_instances.theme` is untyped `jsonb`. The implementation must add a `$type<DemoTheme>()` annotation to the schema column with `{ logoPath?: string; primaryColor?: string; secondaryColor?: string; fontFamily?: string }` and gracefully handle missing fields.
   - Two CTA buttons: "View as Board Member" / "View as Resident"
5. Clicking a button triggers a server action or POST to `/api/v1/demo/[slug]/enter`.

### Demo Entry Endpoint

`POST /api/v1/demo/[slug]/enter`

**Request body:** `{ role: 'board' | 'resident' }`

**Rate limiting:** Apply a per-slug rate limit (e.g., 10 requests/minute) to prevent abuse of Supabase magic link generation, which is an expensive operation.

**Process:**
1. Look up demo instance by slug, join `communities` for `is_demo`, `demo_expires_at`, `deleted_at`. If not found, community soft-deleted, or expired → return 404 (constant-time; see anti-enumeration note below).
2. **Anti-enumeration:** Must replicate the pattern from `demo-login/route.ts` (lines 162–183). If the instance is not found, proceed with a dummy user ID through the remaining steps so the response timing is constant. Do NOT return an early 404 before step 4.
3. Determine target user ID (`demoBoardUserId` or `demoResidentUserId`) based on `role`.
4. Call the shared `createDemoSession()` helper (extracted from `demo-login/route.ts`) which:
   - Generates Supabase magic link for the target user via `admin.auth.admin.generateLink()`
   - Verifies OTP server-side to establish session cookies
   - Returns session cookies to attach to the response
5. Redirect to `/dashboard?communityId=X` (board) or `/mobile?communityId=X` (resident).

> **Note:** No HMAC token is generated in this flow. Unlike the old demo-login route (where a token traveled across an HTTP redirect), the enter endpoint has direct access to the demo instance and user IDs in-process. Token generation is unnecessary here — go straight to magic link creation.

### Schema Changes

Add to `demo_instances`:
```sql
ALTER TABLE demo_instances
  ADD COLUMN token_ttl_seconds integer NOT NULL DEFAULT 604800; -- 7 days
```

### Admin App Changes

- **Copy link button** in `TabbedPreviewClient.tsx`: copy `https://propertyprofl.com/demo/[slug]` instead of the raw token URL.
- **Edit drawer**: add TTL configuration field (dropdown: 1 hour, 1 day, 7 days, 30 days, custom).
- Keep existing tab-specific token URLs for admin's own iframe previews (those still use 1-hour tokens for security within the admin panel).

## 2. Demo-to-Customer Conversion (C-01 / C-02 / C-03)

### Problem

No way to convert a demo community to a paying customer. Provisioning always creates a fresh community, discarding any demo customizations (branding, slug, seeded data).

### Solution

A dedicated conversion endpoint that creates a Stripe checkout session tied to the existing demo community, and a webhook handler that upgrades the community in-place on successful payment.

### Conversion Endpoint

`POST /api/v1/admin/demo/[slug]/convert`

**Auth:** Platform admin (admin app session only). No alternative auth path — conversion is an admin-only operation.

**Request body:** `{ planId: 'essentials' | 'professional' | 'operations_plus', customerEmail: string, customerName: string }`

**Process:**
1. Validate demo exists, `is_demo = true`, not expired.
2. Resolve Stripe price ID via `getPriceId(planId)`.
3. Create Stripe checkout session:
   - `mode: 'subscription'`
   - `metadata: { demoId, communityId, planId, slug, customerEmail }`
   - `success_url: /demo/[slug]/converted?session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url: /demo/[slug]`
4. Return `{ checkoutUrl }`.

### Webhook Handler Extension

Extend `POST /api/v1/webhooks/stripe` (`checkout.session.completed`):

> **Critical:** The webhook handler MUST NOT use `withErrorHandler`. Stripe requires 200 on all responses. The existing handler already enforces this — do not change it.

**Rewrite the early guard:** The existing handler gates on `signupRequestId` and returns early if absent (line 65). This must be refactored to a conditional: check for `demoId` first (conversion path), then `signupRequestId` (new signup path), then warn-and-return if neither.

**Detection:** `session.metadata.demoId` is present → conversion flow (not new signup).

**Idempotency:** Use `WHERE is_demo = true AND id = :communityId RETURNING id` on the UPDATE. If no row is returned (already converted), skip all side effects. This matches the existing `RETURNING`-based idempotency pattern used for subscription cancellations (lines 156–173).

**In-place upgrade:**
```sql
UPDATE communities SET
  is_demo = false,
  subscription_plan = :planId,
  subscription_status = 'active',
  stripe_customer_id = :customerId,
  stripe_subscription_id = :subscriptionId,
  demo_expires_at = NULL
WHERE id = :communityId;
```

**Cleanup:**
- Ban demo auth users via Supabase admin API: `admin.auth.admin.updateUserById(userId, { ban_duration: '876600h' })`.
- Log audit event: `demo.converted` with metadata `{ planId, stripeSubscriptionId }`.

**Preserved:** slug, branding (`theme`), community name, `community_settings`, any documents/announcements.

### Founding User Account Creation

After conversion, the demo auth users are banned — there are zero active users on the community. The webhook must also create the founding admin user:

1. **Read `prospectName` and billing email** from the Stripe checkout session (`session.customer_details.email`).
2. **Create a new Supabase auth user** via `admin.auth.admin.createUser({ email, email_confirm: true })`.
3. **Create a `users` row** linked to the new auth user ID.
4. **Assign roles:** `board_president` + `property_manager_admin` (matching the provisioning service pattern for founding users, but fixing the PM-03 audit gap where `pm_admin` was missing).
5. **Send a welcome email** with a password-set link via `admin.auth.admin.generateLink({ type: 'magiclink', email })`.

The founding user's email comes from the Stripe session (the person who paid), ensuring the paying customer gets admin access. This is passed as `metadata.customerEmail` in the checkout session creation for reliability.

### Conversion Success Page

`apps/web/src/app/demo/[slug]/converted/page.tsx`

Shows: "Welcome! Your community is now live." with next steps:
- Check your email to set your password (link to the welcome email)
- Invite your first residents
- Configure community settings

> **Note:** This page is best-effort — if the user's browser tab closes before the Stripe redirect completes, the community is still converted (webhook is the source of truth). The welcome email serves as the primary entry point — the success page is a convenience, not a requirement. The admin app's "Converted" badge provides a fallback for the platform admin.

### Admin App Changes

- "Convert to Customer" button on demo detail page with plan selection dropdown.
- Button disabled if demo is expired.
- On click: calls conversion endpoint, opens Stripe checkout in new tab.
- After conversion: demo row in list shows "Converted" badge (green) instead of age badge.

## 3. Demo Expiry Enforcement (D-04)

### Problem

`demo_expires_at` is stored in the communities table but never checked. Demos live forever.

### Solution

A daily cron job that soft-deletes expired demos, plus runtime checks on the landing page and demo-login route.

### Cron Endpoint

`POST /api/v1/internal/expire-demos`

**Auth:** `requireCronSecret` from `@/lib/api/cron-auth` with `DEMO_EXPIRY_CRON_SECRET` env var, following the pattern in `/api/v1/internal/payment-reminders/route.ts`.

**Wrap in `withErrorHandler`** — this is the established pattern for all internal cron routes (unlike the Stripe webhook, which must NOT use it).

**Process:**
1. Query: `SELECT id, seeded_community_id, demo_resident_user_id, demo_board_user_id FROM demo_instances JOIN communities ON communities.id = demo_instances.seeded_community_id WHERE communities.is_demo = true AND communities.demo_expires_at < now() AND communities.deleted_at IS NULL`
2. For each expired demo:
   - Soft-delete community: `UPDATE communities SET deleted_at = now() WHERE id = :id`
   - Soft-delete demo instance: `UPDATE demo_instances SET deleted_at = now() WHERE id = :id`
   - Ban demo auth users: `admin.auth.admin.updateUserById(userId, { ban_duration: '876600h' })`
   - Log audit event: `demo.expired`
3. Return `{ expired: count }`.

### Vercel Cron Config

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/v1/internal/expire-demos",
      "schedule": "0 3 * * *"
    }
  ]
}
```

### Runtime Checks

**Landing page** (`/demo/[slug]`): Check `demo_expires_at` in the server component. If expired, render an "expired" state with PropertyPro contact info instead of the role picker.

**Demo-login route** (`/api/v1/auth/demo-login`): Add expiry check before token validation. If community `demo_expires_at < now()`, return error redirect.

### Default Expiry

30 days from creation. The admin app's demo creation wizard sets `demo_expires_at = now() + 30 days`. The edit drawer allows extending or shortening the expiry.

### Admin Visibility

- Demo list: red "Expired" badge for demos past expiry
- Demo detail: expiry date shown prominently with "Extend" button
- No auto-hard-delete — admin can extend expiry or manually delete

## Migration Plan

One migration file: `0113_demo_lifecycle.sql` (journal idx 112 is current tail).

```sql
-- Add token TTL to demo_instances
ALTER TABLE demo_instances
  ADD COLUMN token_ttl_seconds integer NOT NULL DEFAULT 604800;

-- Add soft-delete to demo_instances (schema convention: all tenant-scoped tables)
ALTER TABLE demo_instances
  ADD COLUMN deleted_at timestamptz;

-- Ensure demo_expires_at is populated for existing demos
UPDATE communities c
SET demo_expires_at = di.created_at + interval '30 days'
FROM demo_instances di
WHERE di.seeded_community_id = c.id
  AND c.is_demo = true
  AND c.demo_expires_at IS NULL;
```

Also update `packages/db/src/schema/demo-instances.ts` to add:
- `deletedAt: timestamp('deleted_at', { withTimezone: true })` column
- `tokenTtlSeconds: integer('token_ttl_seconds').notNull().default(604800)` column
- `$type<DemoTheme>()` annotation on the `theme` column

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `apps/web/src/app/demo/[slug]/page.tsx` | Public demo landing page |
| `apps/web/src/app/demo/[slug]/converted/page.tsx` | Post-conversion success page |
| `apps/web/src/app/api/v1/demo/[slug]/enter/route.ts` | Demo entry (session creation + login) |
| `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts` | Demo-to-customer conversion (admin-only) |
| `apps/web/src/app/api/v1/internal/expire-demos/route.ts` | Cron: expire stale demos (uses `withErrorHandler`) |
| `apps/web/src/lib/services/demo-session.ts` | Shared helper: magic link → OTP verify → session cookies |

### Modified Files

| File | Change |
|------|--------|
| `apps/web/src/app/api/v1/webhooks/stripe/route.ts` | Handle conversion checkout completion + founding user creation |
| `apps/web/src/app/api/v1/auth/demo-login/route.ts` | Add expiry check; extract session creation logic to shared helper |
| `apps/web/src/middleware.ts` | Add TOKEN_AUTH_ROUTES entries (see Middleware Changes below) |
| `packages/db/src/schema/demo-instances.ts` | Add `tokenTtlSeconds`, `deletedAt` columns; type `theme` JSONB |
| `packages/db/migrations/meta/_journal.json` | Add entry at idx 113 for `0113_demo_lifecycle` |
| `apps/admin/src/app/demo/[id]/preview/TabbedPreviewClient.tsx` | Copy landing page URL instead of token URL |
| `apps/admin/src/app/demo/[id]/preview/page.tsx` | Pass landing page URL to client |
| `apps/admin/src/app/demo/[id]/page.tsx` (or detail component) | Add "Convert to Customer" button; disable "Delete" for converted demos (`is_demo = false`) |
| `apps/admin/src/app/api/admin/demos/route.ts` | Set `demo_expires_at = now() + 30 days` on demo creation |
| `apps/web/vercel.json` | Add cron schedule (note: file is at `apps/web/vercel.json`, NOT repo root) |
| `scripts/verify-scoped-db-access.ts` | Add new routes to `WEB_UNSAFE_IMPORT_ALLOWLIST` (see DB Access Guard below) |
| `.env.example` | Add `DEMO_EXPIRY_CRON_SECRET=change-me` |

### Middleware Changes

Add to `TOKEN_AUTH_ROUTES` in `apps/web/src/middleware.ts`:
- `{ path: '/api/v1/demo/', method: 'POST' }` — **enter endpoint only** (public, no session). This prefix matches `/api/v1/demo/[slug]/enter`.
- `{ path: '/api/v1/internal/expire-demos', method: 'POST' }` — cron, Bearer-authenticated via `requireCronSecret`

> **Critical:** The `/convert` endpoint must NOT be exempted from session middleware. It requires an authenticated admin session. Since TOKEN_AUTH_ROUTES uses `startsWith` matching, the `/api/v1/demo/` prefix WILL match `/api/v1/demo/[slug]/convert`. To prevent this, add an explicit exclusion: the middleware match logic must check that the path does NOT end with `/convert` when matching the `/api/v1/demo/` prefix. Alternatively, restructure the route: move convert to `/api/v1/admin/demo/[slug]/convert` under a different prefix that requires session auth. **Recommended approach: move `/convert` to `/api/v1/admin/demo/[slug]/convert`** — this is cleaner since it's an admin-only operation and doesn't need to share a path prefix with the public enter endpoint.

The `/demo/[slug]` landing page (Next.js page route, not API) does NOT live under `/api/v1/`, so it already passes through middleware without auth.

### DB Access Guard

`demo_instances` has RLS enabled with service_role-only access (no public policies). New routes that query it directly need `createUnscopedClient` or Supabase admin client, and MUST be added to `WEB_UNSAFE_IMPORT_ALLOWLIST` in `scripts/verify-scoped-db-access.ts`:

- `apps/web/src/app/demo/[slug]/page.tsx` (landing page reads demo_instances)
- `apps/web/src/app/api/v1/demo/[slug]/enter/route.ts` (reads demo_instances for session creation)
- `apps/web/src/app/api/v1/admin/demo/[slug]/convert/route.ts` (reads demo_instances for validation)
- `apps/web/src/app/api/v1/internal/expire-demos/route.ts` (reads + writes demo_instances)
- `apps/web/src/lib/services/demo-session.ts` (shared helper, reads demo_instances)

Without these entries, `pnpm guard:db-access` will fail in CI.

### Existing Infrastructure Reused

- `decryptDemoTokenSecret` / `encryptDemoTokenSecret` — unchanged, used only by the existing `demo-login/route.ts` HMAC token validation path (NOT by the new enter endpoint, which bypasses token generation entirely)
- `stripe-service.ts` (`getPriceId`, `createEmbeddedCheckoutSession` pattern) — referenced for checkout
- `demo-login/route.ts` — session creation logic (magic link generation + OTP verification + cookie replay) must be **extracted to a shared helper** (e.g., `lib/services/demo-session.ts`) and called from both `demo-login` and the new `/demo/[slug]/enter` route. Do not duplicate the ~80 lines of session code.
- Plan features config from B-01 (`PLAN_FEATURES`, `PLAN_IDS`) — used for conversion plan selection
- `requireCronSecret` from `@/lib/api/cron-auth` — used by expire-demos cron (follows `payment-reminders` pattern exactly)

## Performance Considerations

**Landing page caching:** The `/demo/[slug]` page is a server component making a DB query on every visit. Add `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` to avoid unnecessary DB hits from repeated visits or bot crawls. Alternatively, use Next.js ISR with a 60-second revalidation window.

**DB indexing:** No new index is needed for the cron query. The `communities.is_demo` column has low cardinality (few demos relative to total communities), and the cron runs daily on a small dataset. If demo volume grows significantly, consider a partial index: `CREATE INDEX idx_communities_demo_expiry ON communities (demo_expires_at) WHERE is_demo = true AND deleted_at IS NULL`.

**Cron concurrency:** The cron soft-deletes rows one at a time. If two cron invocations overlap (Vercel retry), the `WHERE deleted_at IS NULL` guard on the query prevents double-processing. No explicit lock needed.

## Known Technical Debt

**`seededCommunityId` FK uses `onDelete: 'set null'`:** If a community is hard-deleted (not soft-deleted), the `demo_instances.seeded_community_id` becomes `null`, orphaning the demo instance row. The cron's JOIN on `seeded_community_id = communities.id` would miss these orphans. This is pre-existing and out of scope for this spec, but implementers should be aware. The admin app's hard-delete flow should cascade to demo_instances, or the cron should also check for `seeded_community_id IS NULL` orphans.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid slug | 404 page |
| Expired demo (landing page) | "Demo expired" page with contact info |
| Expired demo (demo-login) | Redirect to `/auth/login?error=demo_expired` |
| Expired demo (conversion) | 400: "Cannot convert expired demo" |
| Already converted (conversion) | 400: "Community is not a demo" |
| Stripe checkout fails | User returns to cancel URL, no state change |
| Webhook idempotency | `UPDATE ... WHERE is_demo = true RETURNING id`; skip side effects if no row returned |
| Founding user creation fails | Community is converted but user not created; webhook retry will skip UPDATE (idempotent), re-attempt user creation |
| Rate limit exceeded (enter) | 429 with `Retry-After` header |
| Invalid role in enter body | 400: Zod validation error |
| Hard-deleted community (orphan demo) | Landing page 404 (`seeded_community_id IS NULL` → no join match) |

## Testing Strategy

**Unit tests:**
- Shared `createDemoSession()` helper: valid user, invalid user, expired demo
- Conversion state transitions: `is_demo=true` → `is_demo=false`
- Cron expiry query: only selects demos where `demo_expires_at < now()` AND `deleted_at IS NULL`

**Integration tests (mock Stripe):**
- Full conversion flow: checkout → webhook → community upgraded → founding user created → welcome email sent
- Webhook idempotency: same event delivered twice → second is a no-op
- Partial failure: conversion UPDATE succeeds but user banning fails → community is converted (idempotent retry will skip UPDATE, re-attempt ban)
- Cron batch: 3 expired demos + 1 non-expired → only 3 soft-deleted

**Edge case tests:**
- Concurrent enter requests for the same demo (two prospects click simultaneously) — both should succeed with independent sessions
- Conversion of an already-converted community (webhook retry after `is_demo` flipped) — no-op via `RETURNING`
- Cron runs while a demo is mid-conversion (checkout started, not completed) — cron should NOT expire it (demo_expires_at may still be in the future during checkout)
- Landing page for a demo whose community was hard-deleted (`seeded_community_id = null`) — should 404
- Enter endpoint with invalid role value — Zod validation rejects

**Manual testing:**
- Admin copies landing page URL → prospect visits → role select → logged in
- Admin converts demo → Stripe checkout → community live → founding user receives email
- Demo expires → cron runs → landing page shows expired state → demo-login rejects token
