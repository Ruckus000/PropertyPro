# Post-Checkout Provisioning Screen

**Date:** 2026-04-02
**Status:** Draft
**Scope:** Replace the static "Payment successful" dead-end with a live provisioning progress screen that auto-logs the user into their new dashboard.

---

## Problem

After completing Stripe checkout, users land on a static page that says "Payment successful!" and tells them to check their email for a welcome link. This is a dead end — the user has to leave the app, open their email, and click a link just to access the portal they just paid for.

## Solution

Convert the checkout return page into a client component that:

1. Shows an animated provisioning progress screen with user-friendly step labels
2. Polls a new status API until provisioning completes
3. Auto-logs the user in via a one-time magic link token
4. Redirects to the PM dashboard

The welcome email still sends (informational, for future logins) but is no longer the primary entry point.

---

## Design System Alignment

All visual decisions follow `docs/design-system/` and `DESIGN.md`:

- **Surface:** `--surface-page-warm` background, `--surface-card` for the card
- **Card:** radius `md` (10px), padding `lg` (24px), elevation E0
- **Typography:** `display` (24px bold) for heading, `body` (16px) for step labels, `--text-secondary` for subtext
- **Spacing:** `stack-lg` (24px) between major sections, `stack-sm` (12px) between steps
- **Status indicators:** `--status-success-fg` (green) for completed steps, `--text-disabled` (gray-400) for pending
- **Motion:** `standard` duration (250ms) with `enter` easing for step transitions. Spinner uses CSS `@keyframes rotate` with `prefers-reduced-motion` fallback to a static pulsing dot
- **Error state:** `AlertBanner` pattern (danger variant) with left border, icon + message + action link
- **Focus/a11y:** All interactive elements use `:focus-visible` ring. `aria-live="polite"` on the progress region for screen readers. `role="status"` on the active step.

---

## Changes

### 1. Checkout Return Page (Frontend)

**File:** `apps/web/src/app/(public)/signup/checkout/return/page.tsx`

Convert from server component to a thin server wrapper + client component.

**Server wrapper:** Extracts `session_id` and `signupRequestId` from search params, passes them as props to the client component. Renders error UI if `signupRequestId` is missing.

**Client component:** `ProvisioningProgress`

**Layout:**
- Centered `max-w-lg` on `--surface-page-warm`
- Card container (`--surface-card`, radius md, padding lg, E0)
- Heading: "Setting up your community" (`display`, 24px bold)
- Subtext: "This usually takes just a few seconds." (`body`, `--text-secondary`)

**Progress steps (3 user-facing stages):**

| Internal provisioning steps | User label | Icon |
|---|---|---|
| `community_created`, `user_linked` | Creating your portal | Building/layers icon |
| `checklist_generated`, `categories_created`, `preferences_set` | Setting up compliance tools | Shield-check icon |
| `email_sent`, `completed` | Finalizing your account | Sparkles icon |

Each step renders:
- **Completed:** Check-circle icon (`--status-success-fg`) + label (`--text-primary`) + strikethrough-free
- **In-progress:** Animated spinner (16px) + label (`--text-primary`, `font-medium`)
- **Pending:** Circle-dashed icon (`--text-disabled`) + label (`--text-disabled`)

**Polling:**
- Calls `GET /api/v1/auth/provisioning-status?signupRequestId=X` every 2 seconds
- Max 15 attempts (30s timeout)
- On `completed`: receives `loginToken`, calls `supabase.auth.verifyOtp({ token_hash: loginToken, type: 'magiclink' })`, redirects to `/dashboard`
- On `failed` or timeout: shows `AlertBanner` (danger) — "Something went wrong setting up your portal. Our team has been notified — we'll email you when it's ready." with a link to `/auth/login`
- On verifyOtp failure: redirects to `/auth/login` with query param `?message=portal-ready` so login page can show a toast

**Step mapping logic:**
```
function mapProvisioningStep(step: string): number {
  // Returns 0, 1, or 2 for the 3 user-facing stages
  if (['community_created', 'user_linked'].includes(step)) return 0;
  if (['checklist_generated', 'categories_created', 'preferences_set'].includes(step)) return 1;
  if (['email_sent', 'completed'].includes(step)) return 2;
  return 0; // initiated or unknown = still on first stage
}
```

### 2. Provisioning Status API

**New file:** `apps/web/src/app/api/v1/auth/provisioning-status/route.ts`

**Method:** `GET`

**Auth:** None required (pre-login). Secured by unguessable `signupRequestId` UUID.

**Query params:** `signupRequestId` (required, validated as non-empty string)

**Logic:**
1. Look up `provisioning_jobs` by `signupRequestId` using unscoped client (this is a cross-tenant admin table)
2. If no job found: return `404`
3. If job status is `completed`:
   - Look up the `pending_signups` row to get the user's `email`
   - Generate magic link: `supabase.auth.admin.generateLink({ type: 'magiclink', email })`
   - Extract `token_hash` from the generated link properties (hashed_token field)
   - Return `{ status: 'completed', step: 'completed', loginToken: hashedToken }`
4. If job status is `failed`: return `{ status: 'failed', step: job.lastSuccessfulStatus }`
5. Otherwise: return `{ status: 'provisioning', step: job.lastSuccessfulStatus ?? 'initiated' }`

**Rate limiting:** Existing middleware rate limiting applies. Additionally, the endpoint returns the same `loginToken` on repeated calls for the same completed job (Supabase generates a new link each call, but the token is short-lived and one-time-use — only the first verifyOtp succeeds, subsequent calls are no-ops).

**Response shape:**
```typescript
type ProvisioningStatusResponse = {
  status: 'provisioning' | 'completed' | 'failed';
  step: string;
  loginToken?: string; // only when status === 'completed'
};
```

### 3. signupRequestId in Return URL

**File:** `apps/web/src/lib/actions/checkout.ts`

In `createCheckoutSession()`, append `signupRequestId` to the `return_url`:

**Current:** `${baseUrl}/signup/checkout/return?session_id={CHECKOUT_SESSION_ID}`
**New:** `${baseUrl}/signup/checkout/return?session_id={CHECKOUT_SESSION_ID}&signupRequestId=${signupRequestId}`

This gives the client component immediate access to `signupRequestId` without an extra server call.

---

## What Does NOT Change

- **Provisioning service** (`provisioning-service.ts`): No modifications. State machine, step order, and welcome email delivery remain as-is.
- **Stripe webhook handler** (`webhooks/stripe/route.ts`): No modifications. Signature verification and event processing unchanged.
- **Welcome email template**: Still sends during `email_sent` step. Becomes informational for future logins.
- **Database schema**: No new tables or columns. `provisioning_jobs` already has all needed fields (`signupRequestId`, `status`, `lastSuccessfulStatus`, `communityId`).
- **Existing signup flow pages**: Signup form, email verification, and checkout pages untouched.

---

## Error Handling Matrix

| Scenario | User sees | Recovery |
|---|---|---|
| Provisioning in progress | Animated progress steps | Auto-advances as steps complete |
| Provisioning completes | Brief "Finalizing" then redirect | Auto-login + dashboard |
| Provisioning fails | AlertBanner (danger) | "We'll email you when it's ready" + login link |
| Polling timeout (30s) | AlertBanner (danger) | Same as failure — provisioning may still complete in background, welcome email is backup |
| verifyOtp fails | Redirect to `/auth/login` | Toast: "Your portal is ready — please sign in" |
| signupRequestId missing | Static error page | Link back to `/signup` |
| Job not found (404) | Static error page | Link back to `/signup` |

---

## Accessibility

- Progress region wrapped in `aria-live="polite"` so screen readers announce step changes
- Active step has `role="status"`
- Spinner has `aria-label="Loading"` and is `aria-hidden` for reduced-motion users who see the pulsing dot
- Error AlertBanner uses `role="alert"` for immediate screen reader announcement
- All links and buttons maintain `:focus-visible` ring
- Respects `prefers-reduced-motion`: spinner replaced with subtle opacity pulse
