# Signup Flow Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs found during the signup flow audit: retry-after-email-failure blocks user with "subdomain taken" (P0), dead-end checkout error pages (P2), missing `name` attributes on form inputs (P2).

**Architecture:** All changes are in the `apps/web/` frontend layer. The P0 fix generates a stable `signupRequestId` client-side so retries reuse the same ID. The P2 fixes add navigation links to error states on the checkout pages, and add standard HTML `name` attributes to every form input for password manager autofill.

**Tech Stack:** React 19, Next.js 15 (App Router), TypeScript

---

### Task 1: Fix retry-after-email-failure "subdomain taken" bug (P0)

**Files:**
- Modify: `apps/web/src/components/signup/signup-form.tsx:49` (signupRequestId initialization)

The root cause: when a signup POST fails (e.g. 503 email delivery error), the frontend never receives a `signupRequestId` back. On retry, a new UUID is generated server-side, which doesn't match the exclusion filter in the slug availability check, blocking the user's own subdomain.

The fix: generate a stable `signupRequestId` client-side on component mount so every POST (including retries) sends the same ID. The backend already accepts `input.signupRequestId` and uses `?? crypto.randomUUID()` as fallback (see `apps/web/src/lib/auth/signup.ts:139`).

- [ ] **Step 1: Modify signupRequestId initialization to generate client-side UUID**

In `apps/web/src/components/signup/signup-form.tsx`, change the `signupRequestId` state initialization from:

```tsx
const [signupRequestId, setSignupRequestId] = useState<string | undefined>(
  initialSignupRequestId,
);
```

to:

```tsx
const [signupRequestId] = useState<string>(
  () => initialSignupRequestId ?? crypto.randomUUID(),
);
```

This ensures:
- First mount: a UUID is generated immediately (or the URL param is used if present)
- Retries: the same UUID is sent, so the slug availability check excludes the user's own pending row
- The `setSignupRequestId` call on line 178 is no longer needed (the ID is stable from the start)

- [ ] **Step 2: Remove the now-unnecessary setSignupRequestId call on success**

In the same file, in the `handleSubmit` function, remove the `setSignupRequestId` call since the ID is now stable. Change lines 177-180 from:

```tsx
setSignupRequestId(payload.data.signupRequestId);
setSuccessResult(payload.data);
setSubdomainDirty(true);
```

to:

```tsx
setSuccessResult(payload.data);
setSubdomainDirty(true);
```

- [ ] **Step 3: Run the unit tests to verify nothing breaks**

Run: `cd /Users/jphilistin/Documents/Coding/PropertyPro && pnpm test -- --filter @propertypro/web`

Expected: All existing tests pass. The signup service tests mock the API layer and don't test the React component state, so they should be unaffected.

- [ ] **Step 4: Run typecheck to verify the type change is sound**

Run: `cd /Users/jphilistin/Documents/Coding/PropertyPro && pnpm typecheck`

Expected: Clean. The `signupRequestId` prop changes from `string | undefined` to `string`, which is compatible everywhere it's used (the POST body, the SubdomainChecker prop, the confirm-verification call).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/signup/signup-form.tsx
git commit -m "fix(signup): generate signupRequestId client-side to fix retry after email failure

Previously, signupRequestId was only set from the API success response. When
email delivery failed (503), the ID was never saved, causing retries to generate
a new UUID that couldn't exclude the user's own pending row from the slug
availability check — blocking them with 'subdomain already taken'.

Now, a stable UUID is generated on component mount so all POST attempts
(including retries) use the same signupRequestId.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Fix dead-end checkout error page (P2)

**Files:**
- Modify: `apps/web/src/app/(public)/signup/checkout/page.tsx:38-43` (error state in CheckoutInner)

The checkout page's error state (`Cannot start checkout from status "pending_verification"`) shows plain red text with no navigation. Users get stuck.

- [ ] **Step 1: Add navigation link to the checkout error state**

In `apps/web/src/app/(public)/signup/checkout/page.tsx`, replace the error rendering block (lines 38-44) from:

```tsx
if (error) {
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <p className="text-sm text-status-danger">{error}</p>
    </main>
  );
}
```

to:

```tsx
if (error) {
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-content">Unable to start checkout</h1>
      <p className="mt-2 text-sm text-status-danger">{error}</p>
      <a
        href="/signup"
        className="mt-6 inline-block rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive/90"
      >
        Return to signup
      </a>
    </main>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/jphilistin/Documents/Coding/PropertyPro && pnpm typecheck`

Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(public\)/signup/checkout/page.tsx
git commit -m "fix(signup): add navigation link to checkout error page

The checkout error state was a dead-end with just red text and no way to
navigate back. Now shows a heading, the error message, and a 'Return to signup'
link.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fix dead-end checkout return error pages (P2)

**Files:**
- Modify: `apps/web/src/app/(public)/signup/checkout/return/page.tsx:18-25,31-39` (two error states)

The checkout return page has two error states (missing session ID, and failed session retrieval) that show messages but no navigation links. The "Checkout not completed" state already has a "Return to signup" link — the error states should match.

- [ ] **Step 1: Add navigation links to both error states**

In `apps/web/src/app/(public)/signup/checkout/return/page.tsx`, replace the missing-session-ID block (lines 19-24) from:

```tsx
return (
  <main className="mx-auto max-w-lg px-6 py-16 text-center">
    <h1 className="text-xl font-semibold text-content">Invalid return URL</h1>
    <p className="mt-2 text-sm text-content-secondary">No session ID found in the URL.</p>
  </main>
);
```

to:

```tsx
return (
  <main className="mx-auto max-w-lg px-6 py-16 text-center">
    <h1 className="text-xl font-semibold text-content">Invalid return URL</h1>
    <p className="mt-2 text-sm text-content-secondary">No session ID found in the URL.</p>
    <a
      href="/signup"
      className="mt-6 inline-block rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive/90"
    >
      Return to signup
    </a>
  </main>
);
```

Then replace the failed-retrieval block (lines 33-39) from:

```tsx
return (
  <main className="mx-auto max-w-lg px-6 py-16 text-center">
    <h1 className="text-xl font-semibold text-content">Something went wrong</h1>
    <p className="mt-2 text-sm text-content-secondary">
      We could not retrieve your checkout session. Please contact support.
    </p>
  </main>
);
```

to:

```tsx
return (
  <main className="mx-auto max-w-lg px-6 py-16 text-center">
    <h1 className="text-xl font-semibold text-content">Something went wrong</h1>
    <p className="mt-2 text-sm text-content-secondary">
      We could not retrieve your checkout session. Please contact support.
    </p>
    <a
      href="/signup"
      className="mt-6 inline-block rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive/90"
    >
      Return to signup
    </a>
  </main>
);
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/jphilistin/Documents/Coding/PropertyPro && pnpm typecheck`

Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(public\)/signup/checkout/return/page.tsx
git commit -m "fix(signup): add navigation links to checkout return error pages

The 'Invalid return URL' and 'Something went wrong' states were dead-ends with
no way to navigate back. Now both include a 'Return to signup' link, matching
the existing pattern in the 'Checkout not completed' state.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add `name` attributes to signup form inputs (P2)

**Files:**
- Modify: `apps/web/src/components/signup/signup-form.tsx:258-339` (all input elements)

Most form inputs lack `name` attributes, which breaks browser autofill and password manager detection. The `candidateSlug` input in `subdomain-checker.tsx` already has `name="candidateSlug"` and the checkbox doesn't need one. The `email` input already has `autoComplete="email"` and the `password` input has `autoComplete="new-password"`, but they still need `name` attributes.

- [ ] **Step 1: Add `name` attributes to all text inputs**

In `apps/web/src/components/signup/signup-form.tsx`, add `name` attributes to each input. The exact changes:

For the Primary Contact Name input (line 258-264), add `name="primaryContactName"`:
```tsx
<input
  type="text"
  name="primaryContactName"
  autoComplete="name"
  value={primaryContactName}
  onChange={(event) => setPrimaryContactName(event.target.value)}
  className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
  required
/>
```

For the Email input (line 269-276), add `name="email"`:
```tsx
<input
  type="email"
  name="email"
  autoComplete="email"
  value={email}
  onChange={(event) => setEmail(event.target.value)}
  className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
  required
/>
```

For the Password input (line 282-290), add `name="password"`:
```tsx
<input
  type="password"
  name="password"
  autoComplete="new-password"
  value={password}
  onChange={(event) => setPassword(event.target.value)}
  className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
  placeholder="At least 8 chars, mixed case, number, symbol"
  required
/>
```

For the Community Name input (line 296-302), add `name="communityName"`:
```tsx
<input
  type="text"
  name="communityName"
  value={communityName}
  onChange={(event) => handleCommunityNameChange(event.target.value)}
  className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
  required
/>
```

For the Address input (line 307-312), add `name="address"` and `autoComplete="street-address"`:
```tsx
<input
  type="text"
  name="address"
  autoComplete="street-address"
  value={address}
  onChange={(event) => setAddress(event.target.value)}
  className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
  required
/>
```

For the County input (line 320-326), add `name="county"`:
```tsx
<input
  type="text"
  name="county"
  value={county}
  onChange={(event) => setCounty(event.target.value)}
  className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
  required
/>
```

For the Unit Count input (line 331-339), add `name="unitCount"`:
```tsx
<input
  type="number"
  name="unitCount"
  min={1}
  step={1}
  value={unitCount}
  onChange={(event) => setUnitCount(event.target.value)}
  className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
  required
/>
```

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/jphilistin/Documents/Coding/PropertyPro && pnpm typecheck`

Expected: Clean. `name` is a standard HTML attribute on `<input>`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/signup/signup-form.tsx
git commit -m "fix(signup): add name and autoComplete attributes to form inputs

Most signup form inputs lacked name attributes, preventing browser autofill and
password manager detection. Added name to all inputs and autoComplete hints to
name/address fields for better UX.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Visual verification

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server and navigate to /signup**

Run: `preview_start("web")` then navigate to `/signup`

- [ ] **Step 2: Fill the form and submit with the same email twice to verify the retry fix**

Fill the form, submit once. If email delivery fails, submit again with the same data. The subdomain should NOT show "already taken" — it should either succeed or show the email cooldown message. If email delivery succeeds, this is validated.

- [ ] **Step 3: Verify checkout error pages have navigation links**

Navigate to `/signup/checkout?signupRequestId=nonexistent` and verify the error page now shows a "Return to signup" link.

Navigate to `/signup/checkout/return?session_id=fake` and verify the error page now shows a "Return to signup" link.

- [ ] **Step 4: Verify form inputs have name attributes**

On `/signup`, inspect the form inputs in the DOM. Each should have a `name` attribute: `primaryContactName`, `email`, `password`, `communityName`, `address`, `county`, `unitCount`, `candidateSlug`.
