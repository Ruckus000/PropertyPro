# Phase 0: Fix Signup Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two P0 blockers that prevent any new customer from signing up — the missing `email_verified` status transition and the missing navigation from verification back to checkout.

**Architecture:** When Supabase confirms a user's email and redirects back to `/signup?verified=1&signupRequestId=<id>`, the signup page must: (1) transition the `pending_signups` row from `pending_verification` to `email_verified`, and (2) show a "Proceed to Checkout" button instead of the full signup form. The status transition happens via a new API route `PATCH /api/v1/auth/signup` that validates the Supabase session's `email_confirmed_at` before writing.

**Tech Stack:** Next.js 15 App Router, Supabase Auth, Drizzle ORM, Zod, React

**Audit References:** O-01, O-02 from `docs/platform-data-flow-audit.md`

---

### Task 1: Create the `email_verified` status transition API

**Files:**
- Modify: `apps/web/src/app/api/v1/auth/signup/route.ts`
- Modify: `apps/web/src/lib/auth/signup.ts`
- Test: `apps/web/__tests__/auth/signup-verification.test.ts`

- [ ] **Step 1: Write the failing test for the status transition**

```typescript
// apps/web/__tests__/auth/signup-verification.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test: PATCH /api/v1/auth/signup transitions pending_verification → email_verified
describe('PATCH /api/v1/auth/signup — email verification', () => {
  it('should return 400 if signupRequestId is missing', async () => {
    const res = await fetch('/api/v1/auth/signup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('should return 401 if user is not authenticated', async () => {
    const res = await fetch('/api/v1/auth/signup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signupRequestId: 'test-id' }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/__tests__/auth/signup-verification.test.ts`
Expected: FAIL — PATCH handler does not exist on the signup route

- [ ] **Step 3: Add `confirmEmailVerification` function to signup service**

Add to `apps/web/src/lib/auth/signup.ts`.

**First**, add imports at the top of the file (alongside existing error imports):
```typescript
import { NotFoundError, ForbiddenError } from '@/lib/api/errors';
```

**Then** add the function:

```typescript
/**
 * Confirms that a Supabase auth user's email has been verified,
 * and transitions the pending_signups row from pending_verification → email_verified.
 *
 * Called when the user returns to /signup?verified=1 after clicking the email link.
 */
export async function confirmEmailVerification(
  signupRequestId: string,
  authUserId: string,
): Promise<{ status: 'email_verified' | 'already_verified'; checkoutEligible: boolean }> {
  const db = createUnscopedClient();

  const rows = await db
    .select()
    .from(pendingSignups)
    .where(eq(pendingSignups.signupRequestId, signupRequestId))
    .limit(1);

  const signup = rows[0];
  if (!signup) {
    throw new NotFoundError('Signup request not found');
  }

  // Check expiry — don't transition expired signups
  if (signup.expiresAt && new Date(signup.expiresAt) < new Date()) {
    throw new ValidationError('This signup request has expired. Please start a new signup.');
  }

  // Already past verification — idempotent success
  if (signup.status !== 'pending_verification') {
    return {
      status: 'already_verified',
      checkoutEligible: ['email_verified', 'checkout_started'].includes(signup.status),
    };
  }

  // Verify the auth user matches
  if (signup.authUserId && signup.authUserId !== authUserId) {
    throw new ForbiddenError('Auth user mismatch');
  }

  await db
    .update(pendingSignups)
    .set({
      status: 'email_verified',
      authUserId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pendingSignups.signupRequestId, signupRequestId),
        eq(pendingSignups.status, 'pending_verification'),
      ),
    );

  return { status: 'email_verified', checkoutEligible: true };
}
```

- [ ] **Step 4: Add PATCH handler to the signup route**

Add to `apps/web/src/app/api/v1/auth/signup/route.ts`:

```typescript
import { z } from 'zod';
import { confirmEmailVerification } from '@/lib/auth/signup';
import { createServerClient } from '@propertypro/db/supabase/server';

const confirmVerificationSchema = z.object({
  signupRequestId: z.string().min(1),
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parsed = confirmVerificationSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('signupRequestId is required');
  }

  // Verify the user is authenticated and email is confirmed
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (!user.email_confirmed_at) {
    return NextResponse.json(
      { error: 'Email has not been verified yet' },
      { status: 403 },
    );
  }

  const result = await confirmEmailVerification(
    parsed.data.signupRequestId,
    user.id,
  );

  return NextResponse.json({ data: result });
});
```

> **Note:** No `TOKEN_AUTH_ROUTES` change is needed. The user has a valid Supabase session after email verification (with `email_confirmed_at` set), so the PATCH request passes through the normal authenticated middleware path.

- [ ] **Step 5: Run tests to verify the handler works**

Run: `pnpm exec vitest run apps/web/__tests__/auth/signup-verification.test.ts`
Expected: Tests should now pass for the 400 case; 401 case depends on test environment auth mocking.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/auth/signup.ts apps/web/src/app/api/v1/auth/signup/route.ts apps/web/__tests__/auth/signup-verification.test.ts
git commit -m "feat: add PATCH /api/v1/auth/signup for email_verified status transition

Fixes O-01 from platform audit: the pending_signups status was never
transitioned from pending_verification to email_verified, blocking all
new signups from reaching Stripe checkout."
```

---

### Task 2: Update the SignupForm to handle post-verification UX

**Files:**
- Modify: `apps/web/src/components/signup/signup-form.tsx`
- Modify: `apps/web/src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Add post-verification state to SignupForm**

When `verificationReturn={true}` and `signupRequestId` is present, the form should:
1. Call `PATCH /api/v1/auth/signup` to transition the status
2. Show a success state with "Proceed to Checkout" button
3. Hide the full form fields

In `apps/web/src/components/signup/signup-form.tsx`, add a new state and effect:

```typescript
const [verificationConfirmed, setVerificationConfirmed] = useState(false);
const [verificationError, setVerificationError] = useState<string | null>(null);

// On mount, if this is a verification return, confirm the status transition
useEffect(() => {
  if (!verificationReturn || !signupRequestId) return;

  (async () => {
    try {
      const res = await fetch('/api/v1/auth/signup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupRequestId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setVerificationError(body.error?.message ?? 'Verification failed. Please try signing up again.');
        return;
      }

      const { data } = await res.json();
      if (data.checkoutEligible) {
        setVerificationConfirmed(true);
      }
    } catch {
      setVerificationError('Unable to confirm verification. Please try again.');
    }
  })();
}, [verificationReturn, signupRequestId]);
```

- [ ] **Step 2: Replace the info banner with a checkout-ready state**

Replace the existing `verificationReturn` banner in the JSX with:

```tsx
{verificationConfirmed ? (
  <div className="space-y-6 text-center">
    <div className="rounded-md border border-status-success-border bg-status-success/10 px-6 py-8">
      <svg className="mx-auto h-12 w-12 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h2 className="mt-4 text-xl font-semibold text-content">Email Verified</h2>
      <p className="mt-2 text-sm text-content-secondary">
        Your email has been confirmed. Continue to set up billing for your community.
      </p>
    </div>
    <a
      href={`/signup/checkout?signupRequestId=${signupRequestId}`}
      className="inline-flex items-center justify-center rounded-md bg-interactive-primary px-8 py-3 text-base font-medium text-white shadow-e1 hover:bg-interactive-primary-hover transition-colors"
    >
      Proceed to Checkout
    </a>
  </div>
) : verificationError ? (
  <div className="rounded-md border border-status-danger-border bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
    {verificationError}
  </div>
) : verificationReturn ? (
  <div className="flex items-center justify-center py-8">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-interactive-primary border-t-transparent" />
    <span className="ml-3 text-sm text-content-secondary">Confirming verification...</span>
  </div>
) : null}
```

- [ ] **Step 3: Hide the form when verification is confirmed**

Wrap the existing form fields in a conditional so they don't render when `verificationConfirmed` is true:

```tsx
{!verificationConfirmed && (
  <form onSubmit={handleSubmit} className="space-y-6 rounded-md border ...">
    {/* existing form fields */}
  </form>
)}
```

- [ ] **Step 4: Test manually via preview**

1. Start dev server: `preview_start("web")`
2. Navigate to `/signup?verified=1&signupRequestId=<valid-id>`
3. Verify: the page shows a loading spinner, then either the "Email Verified" success state with "Proceed to Checkout" button, or an error message
4. If successful, click "Proceed to Checkout" and verify it navigates to `/signup/checkout?signupRequestId=<id>`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/signup/signup-form.tsx
git commit -m "feat: add post-verification UX with checkout navigation

Fixes O-02 from platform audit: after email verification, users now see
a success state with 'Proceed to Checkout' button instead of the full
signup form with no navigation path."
```

---

### Task 3: Handle edge case — verification return without session

**Files:**
- Modify: `apps/web/src/components/signup/signup-form.tsx`

The user may click the verification link in a different browser or private window where they don't have a Supabase session. In this case, the PATCH call returns 401. The form should handle this gracefully.

- [ ] **Step 1: Add fallback for 401 responses**

In the verification effect's error handling, detect 401 and show a login prompt:

```typescript
if (res.status === 401) {
  // User verified email but doesn't have a session in this browser.
  // They need to log in first, then we'll redirect back.
  setVerificationError(null);
  setVerificationConfirmed(false);
  // Show a special "log in to continue" state
  setNeedsLogin(true);
  return;
}
```

Add a `needsLogin` state:

```typescript
const [needsLogin, setNeedsLogin] = useState(false);
```

And render:

```tsx
{needsLogin ? (
  <div className="space-y-4 text-center">
    <p className="text-sm text-content-secondary">
      Your email has been verified. Please log in to continue to checkout.
    </p>
    <a
      href={`/auth/login?returnTo=${encodeURIComponent(`/signup?verified=1&signupRequestId=${signupRequestId}`)}`}
      className="inline-flex items-center justify-center rounded-md bg-interactive-primary px-6 py-2 text-sm font-medium text-white"
    >
      Log in to Continue
    </a>
  </div>
) : null}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/signup/signup-form.tsx
git commit -m "feat: handle cross-browser email verification with login redirect

When a user verifies their email in a different browser, they see
a 'Log in to Continue' prompt that redirects back to the verification
page after authentication."
```

---

## Verification Checklist

After all tasks are complete, verify the full flow:

1. Navigate to `/signup` → fill form → submit → see "Check your email" message
2. (In dev, the email won't send unless Resend domain is verified — check the server logs for the verification link URL)
3. Click verification link → redirected to `/signup?verified=1&signupRequestId=<id>`
4. Page shows "Confirming verification..." spinner → then "Email Verified" success
5. Click "Proceed to Checkout" → navigates to `/signup/checkout?signupRequestId=<id>`
6. Checkout page loads Stripe EmbeddedCheckout (requires `STRIPE_PRICE_*` env vars)
