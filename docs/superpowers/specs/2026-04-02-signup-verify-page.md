# Post-Signup Email Verification Page

**Date:** 2026-04-02
**Status:** Draft
**Mockup:** `docs/superpowers/specs/2026-04-02-signup-verify-mockup.html`

## Problem

After a successful signup (202 from `/api/v1/auth/signup`), the user stays on `/signup` with a green banner and the full form still visible. This is confusing — users don't know what to do next, and the form being visible implies they should keep interacting with it.

## Solution

Navigate to a new `/signup/verify` page after successful signup. This page clearly communicates the single next action: check your email and click the verification link.

## Route

**Path:** `/signup/verify?signupRequestId=<uuid>`

- Lives under `apps/web/src/app/(auth)/signup/verify/page.tsx`
- Server component wrapper + client component inner (needs `useSearchParams`)
- No authentication required (public route)
- The `signupRequestId` is the only query param — email is NOT in the URL

## Page Content

**Layout:** Centered card, `max-w-lg`, matching the existing signup page's `surface-page` background and card border treatment.

**Elements (top to bottom):**

1. **Page heading** — "Start Your PropertyPro Signup" (same as signup page for continuity) with subtitle "Billing checkout opens after email verification."
2. **Card** containing:
   - **Mail icon** — Heroicons `envelope` in a `blue-50` circle (64px), centered
   - **"Check your email"** heading — `text-xl font-semibold`
   - **Body text** — "We sent a verification link to **l\*\*\*\*@gmail.com**. Click the link to verify your email, then you'll continue to checkout."
   - **Resend button** — Secondary style (`border border-edge-strong`, ghost background). Includes a refresh icon. After click: disables for 120 seconds with countdown label "Resend in 1:45". Uses tabular-nums for stable width.
   - **Resent confirmation** — Inline text below the button: green checkmark + "Verification email resent". Fades in, auto-hides after 4 seconds.
   - **Spam hint** — Below a subtle `border-top` divider: "Don't see it? Check your spam or promotions folder." in `text-content-tertiary`, 13px.
3. **Footer link** — "Wrong email? Go back and update it" linking to `/signup`

## Email Masking

The page fetches the masked email from the server to avoid exposing the full address in the URL or client state.

**New API endpoint:** `GET /api/v1/auth/signup-status?signupRequestId=<uuid>`

Returns:
```json
{
  "data": {
    "maskedEmail": "l••••@gmail.com",
    "status": "pending_verification",
    "canResend": true,
    "cooldownRemainingSeconds": 0
  }
}
```

**Masking logic:** First character + `••••` + `@domain`. Applied server-side in the route handler.

This endpoint also powers the resend cooldown — `canResend` is `false` when a verification email was sent within the last 2 minutes. `cooldownRemainingSeconds` tells the client exactly how long to disable the button (handles page refreshes mid-cooldown).

## Resend Flow

A dedicated `POST /api/v1/auth/resend-verification` endpoint that only requires `signupRequestId`. The verify page doesn't have the full signup form data, so re-submitting to the signup endpoint isn't viable. The resend endpoint looks up the pending signup row, checks the 2-minute cooldown, and re-sends via the existing `createOrLinkAuthAccount` + `sendSignupVerificationEmail` pipeline.

### `POST /api/v1/auth/resend-verification`

**Request:**
```json
{ "signupRequestId": "<uuid>" }
```

**Response (200):**
```json
{
  "data": {
    "sent": true,
    "cooldownSeconds": 120
  }
}
```

**Response (429 — cooldown active):**
```json
{
  "error": {
    "message": "Verification email was sent recently. Please wait before requesting another.",
    "cooldownRemainingSeconds": 87
  }
}
```

**Response (404 — not found or expired):**
```json
{
  "error": {
    "message": "Signup request not found or has expired."
  }
}
```

## Signup Form Change

In `signup-form.tsx`, after a successful API response (202):

```tsx
// Current: shows green banner, stays on page
setSuccessResult(payload.data);

// New: navigate to verify page
router.push(`/signup/verify?signupRequestId=${encodeURIComponent(payload.data.signupRequestId)}`);
```

Import `useRouter` from `next/navigation`. Remove the `successResult` state and the green banner rendering — the verify page replaces that UX entirely.

## Verification Return Flow (unchanged)

The existing flow is unaffected:

1. User clicks email link → Supabase confirms → redirects to `/signup?signupRequestId=<id>&verified=1`
2. Signup page detects `verified=1`, calls `confirmVerification()`, shows "Email verified" + "Proceed to Checkout" button
3. User clicks through to `/signup/checkout`

This flow does NOT route through `/signup/verify` — it goes directly to the signup page with the verification params, which already handles the confirmed state.

## Component Structure

```
apps/web/src/app/(auth)/signup/verify/
  page.tsx              — Server component (renders VerifyEmailContent)

apps/web/src/components/signup/
  verify-email-content.tsx  — Client component (useSearchParams, fetch, countdown)
```

## States

| State | Display |
|-------|---------|
| Loading | Card with skeleton for email, disabled resend button |
| Loaded | Full card with masked email, active resend button |
| Resend clicked | Green confirmation, button disabled with countdown |
| Cooldown active (on load) | Button disabled with remaining countdown |
| Invalid/expired signupRequestId | Error message + "Start a new signup" link |
| Network error on resend | Red inline error below button, button re-enabled |

## Accessibility

- Page title: "Check Your Email — PropertyPro"
- Mail icon: `aria-hidden="true"`
- Resend button: announces state change via `aria-live="polite"` region
- Countdown: uses `aria-label` on the button to announce remaining time for screen readers
- Focus: lands on the card heading on page load (not the resend button — prevent accidental clicks)
- All interactive elements meet 44px touch target on mobile

## Mobile

- Card padding reduces from 32px to 24px below 480px
- Resend button goes full-width below 480px with 44px height
- Page padding: 32px top instead of 48px

## Files to Create

1. `apps/web/src/app/(auth)/signup/verify/page.tsx` — Server component wrapper
2. `apps/web/src/components/signup/verify-email-content.tsx` — Client component
3. `apps/web/src/app/api/v1/auth/signup-status/route.ts` — Masked email + status endpoint
4. `apps/web/src/app/api/v1/auth/resend-verification/route.ts` — Resend verification endpoint

## Files to Modify

1. `apps/web/src/components/signup/signup-form.tsx` — Add `router.push()` on success, remove `successResult` state/banner
2. `apps/web/src/middleware.ts` — Ensure `/signup/verify` is in the public (unauthenticated) path list
