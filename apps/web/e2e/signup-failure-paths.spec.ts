/**
 * GA-gate E2E — the signup → Checkout paths that must NOT provision.
 *
 * `signup-trialing.spec.ts` proves a paying customer gets a community. This
 * spec proves the converse, which is the half that actually costs money when it
 * is wrong: a customer who did not successfully pay must not end up with a
 * provisioned, trialing community, and a customer who already paid must not be
 * able to buy a second one by re-submitting the signup form.
 *
 * Behaviours below are MEASURED against Stripe test mode (2026-08-09), not
 * assumed — see the per-test notes.
 *
 * GUARDED exactly like the happy path: skips unless `E2E_STRIPE=1` and the
 * test-mode Stripe + Supabase service-role secrets are present, so the default
 * suite stays green. See `helpers/stripe-e2e.ts`.
 */
import { expect, test } from '@playwright/test';
import {
  STRIPE_DECLINED_CARD,
  STRIPE_E2E_SKIP_REASON,
  assertSafeStripeE2eTarget,
  buildSignupInputs,
  confirmSupabaseEmail,
  fillStripeEmbeddedCheckout,
  stripeE2eConfigured,
  submitSignupViaApi,
} from './helpers/stripe-e2e';

/** Drive signup → email confirmed → checkout page, the shared prefix. */
async function reachCheckout(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
): Promise<{ signupRequestId: string; inputs: ReturnType<typeof buildSignupInputs> }> {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const inputs = buildSignupInputs(runId);
  const signupRequestId = await submitSignupViaApi(request, inputs);
  await confirmSupabaseEmail(inputs.email);
  const confirm = await request.post('/api/v1/auth/confirm-verification', {
    data: { signupRequestId },
  });
  expect(confirm.ok(), 'confirm-verification failed').toBeTruthy();
  await page.goto(`/signup/checkout?signupRequestId=${signupRequestId}`, {
    waitUntil: 'domcontentloaded',
  });
  return { signupRequestId, inputs };
}

/** The app's own view of provisioning for a signup — `pending` until a job exists. */
async function provisioningStatus(
  request: import('@playwright/test').APIRequestContext,
  signupRequestId: string,
): Promise<string> {
  const res = await request.get(
    `/api/v1/auth/provisioning-status?signupRequestId=${signupRequestId}`,
  );
  if (!res.ok()) return `http_${res.status()}`;
  const body = (await res.json()) as { data?: { status?: string }; status?: string };
  return body?.data?.status ?? body?.status ?? 'unknown';
}

test.describe('Signup → Stripe Checkout — failure paths (GA gate)', () => {
  test.skip(!stripeE2eConfigured(), STRIPE_E2E_SKIP_REASON);

  test('a declined card provisions nothing', async ({ page, request }) => {
    assertSafeStripeE2eTarget();
    test.setTimeout(180_000);

    const { signupRequestId } = await reachCheckout(page, request);
    await fillStripeEmbeddedCheckout(page, { card: STRIPE_DECLINED_CARD });

    // MEASURED: Stripe emits `setup_intent.setup_failed` and NO
    // `checkout.session.completed`, so the session never completes, the browser
    // stays on the checkout page, and no provisioning job is ever created.
    //
    // Asserted as "still on checkout after a settle window" rather than
    // "reached an error page", because the decline is surfaced inside Stripe's
    // iframe and its copy is Stripe's to change. The property that matters to
    // us is that we never advance.
    await page.waitForTimeout(15_000);
    await expect(page).toHaveURL(/\/signup\/checkout(\?|$)/);
    await expect(page).not.toHaveURL(/\/signup\/checkout\/return/);

    expect(
      await provisioningStatus(request, signupRequestId),
      'a declined card must not create a provisioning job',
    ).toBe('pending');
  });

  test('an abandoned checkout provisions nothing', async ({ page, request }) => {
    assertSafeStripeE2eTarget();
    test.setTimeout(120_000);

    const { signupRequestId } = await reachCheckout(page, request);

    // Reach checkout, then leave without paying — the single most common real
    // outcome of a pricing page. The signup row stays at `checkout_started`,
    // which is deliberately the same state a LOST WEBHOOK leaves behind; the
    // reconciler tells them apart by asking Stripe whether the session actually
    // completed (`reconcileLostCheckoutSignups`), so an abandoned checkout must
    // never be "recovered" into a free community.
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(
      await provisioningStatus(request, signupRequestId),
      'abandoning checkout must not create a provisioning job',
    ).toBe('pending');
  });

  test('a duplicate signup BEFORE payment is allowed to resubmit', async ({ request }) => {
    assertSafeStripeE2eTarget();

    // Deliberately the permissive half of the duplicate rule, asserted so a
    // future tightening of the post-payment guard cannot quietly break typo
    // correction. `lib/auth/signup.ts` upserts on email with
    // `setWhere: notInArray(status, POST_PAYMENT_SIGNUP_STATUSES)`, so a signup
    // that has NOT paid is simply re-upserted.
    //
    // The refusal half — re-signing up with an email that already PAID — is
    // asserted at the end of `signup-trialing.spec.ts`, where a genuinely
    // completed signup exists to test against without paying twice.
    const first = buildSignupInputs(`${Date.now()}-dup`);
    await submitSignupViaApi(request, first);

    const second = { ...buildSignupInputs(`${Date.now()}-dup2`), email: first.email };
    await submitSignupViaApi(request, second);
  });
});
