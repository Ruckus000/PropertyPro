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

**Process:**
1. Look up demo instance by slug (validate exists, not expired, community not soft-deleted).
2. Decrypt `authTokenSecret` from `demo_instances`. **Must replicate the full anti-enumeration pattern from `demo-login/route.ts` (lines 162–183):** if the instance is not found or decryption fails, use a dummy secret and continue to token validation (which will fail), rather than returning an early 404. This prevents timing-based enumeration of valid slugs.
3. Generate token via `generateDemoToken()` with the demo's `tokenTtlSeconds`.
4. Determine target user ID (`demoBoardUserId` or `demoResidentUserId`).
5. Generate Supabase magic link for that user via `admin.auth.admin.generateLink()`.
6. Verify OTP server-side to establish session cookies.
7. Redirect to `/dashboard?communityId=X` (board) or `/mobile?communityId=X` (resident).

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

`POST /api/v1/demo/[slug]/convert`

**Auth:** Platform admin (admin app session only). No alternative auth path — conversion is an admin-only operation.

**Request body:** `{ planId: 'essentials' | 'professional' | 'operations_plus' }`

**Process:**
1. Validate demo exists, `is_demo = true`, not expired.
2. Resolve Stripe price ID via `getPriceId(planId)`.
3. Create Stripe checkout session:
   - `mode: 'subscription'`
   - `metadata: { demoId, communityId, planId, slug }`
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
- Ban demo auth users via Supabase admin API (`updateUserById({ ban_duration: 'none', banned: true })`).
- Log audit event: `demo.converted` with metadata `{ planId, stripeSubscriptionId }`.

**Preserved:** slug, branding (`theme`), community name, `community_settings`, any documents/announcements.

### Conversion Success Page

`apps/web/src/app/demo/[slug]/converted/page.tsx`

Shows: "Welcome! Your community is now live." with next steps:
- Set up your admin account (link to onboarding)
- Invite your first residents
- Configure community settings

> **Note:** This page is best-effort — if the user's browser tab closes before the Stripe redirect completes, the community is still converted (webhook is the source of truth). The admin app's "Converted" badge provides a fallback entry point. No special recovery flow needed.

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

`GET /api/v1/internal/expire-demos`

**Auth:** `requireCronSecret` from `@/lib/api/cron-auth` with `DEMO_EXPIRY_CRON_SECRET` env var, following the pattern in `/api/v1/internal/payment-reminders/route.ts`.

**Process:**
1. Query: `SELECT id, seeded_community_id, demo_resident_user_id, demo_board_user_id FROM demo_instances JOIN communities ON communities.id = demo_instances.seeded_community_id WHERE communities.is_demo = true AND communities.demo_expires_at < now() AND communities.deleted_at IS NULL`
2. For each expired demo:
   - Soft-delete community: `UPDATE communities SET deleted_at = now() WHERE id = :id`
   - Soft-delete demo instance: `UPDATE demo_instances SET deleted_at = now() WHERE id = :id`
   - Ban demo auth users via Supabase admin API
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
| `apps/web/src/app/api/v1/demo/[slug]/enter/route.ts` | Demo entry (token generation + login) |
| `apps/web/src/app/api/v1/demo/[slug]/convert/route.ts` | Demo-to-customer conversion |
| `apps/web/src/app/api/v1/internal/expire-demos/route.ts` | Cron: expire stale demos |

### Modified Files

| File | Change |
|------|--------|
| `apps/web/src/app/api/v1/webhooks/stripe/route.ts` | Handle conversion checkout completion |
| `apps/web/src/app/api/v1/auth/demo-login/route.ts` | Add expiry check before token validation |
| `apps/web/src/middleware.ts` | Add `/demo/[slug]` and `/api/v1/internal/expire-demos` to public/token-auth paths |
| `packages/db/src/schema/demo-instances.ts` | Add `tokenTtlSeconds`, `deletedAt` columns; type `theme` JSONB |
| `apps/admin/src/app/demo/[id]/preview/TabbedPreviewClient.tsx` | Copy landing page URL |
| `apps/admin/src/app/demo/[id]/preview/page.tsx` | Pass landing page URL to client |
| `vercel.json` | Add cron schedule |

### Existing Infrastructure Reused

- `generateDemoToken` / `validateDemoToken` — already supports custom TTL
- `decryptDemoTokenSecret` / `encryptDemoTokenSecret` — unchanged
- `stripe-service.ts` (`getPriceId`, `createEmbeddedCheckoutSession` pattern) — referenced for checkout
- `demo-login/route.ts` — session creation logic reused by `/demo/[slug]/enter`
- Plan features config from B-01 (`PLAN_FEATURES`, `PLAN_IDS`) — used for conversion plan selection

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

## Testing Strategy

- **Unit tests:** Token generation with custom TTL, expiry logic, conversion state transitions
- **Integration tests:** Full conversion flow (mock Stripe), cron expiry batch processing
- **Manual testing:** Admin copies landing page URL → prospect visits → role select → logged in
