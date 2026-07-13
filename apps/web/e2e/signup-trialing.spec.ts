/**
 * GA-gate E2E — signup → Stripe Checkout → trialing.
 *
 * Closes the one Public GA go/no-go item that can't run in CI (see
 * docs/audits/2026-07-12-ga-go-no-go.md). It exercises the real browser flow
 * through Stripe **Embedded Checkout** with the test card and asserts the
 * community lands in `trialing`.
 *
 * GUARDED: skips unless `E2E_STRIPE=1` and test-mode Stripe + Supabase
 * service-role secrets are set, so the default CI suite stays green. To run:
 *
 *   1. In apps/web/.env.local: STRIPE_SECRET_KEY=sk_test_…,
 *      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…, NEXT_PUBLIC_SUPABASE_URL,
 *      SUPABASE_SERVICE_ROLE_KEY, and the checkout return URL config.
 *   2. Forward webhooks so provisioning fires:
 *      stripe listen --forward-to 127.0.0.1:3000/api/v1/webhooks/stripe
 *   3. E2E_STRIPE=1 pnpm --filter @propertypro/web exec playwright test \
 *        -c playwright.config.ts e2e/signup-trialing.spec.ts
 *
 * Deterministic prerequisite (signup + email confirm) runs via API + Supabase
 * admin; only the Stripe checkout hop is driven in the browser. The Stripe
 * iframe selectors and the Supabase admin call are the two seams to validate on
 * first run (see helpers/stripe-e2e.ts).
 */
import { expect, test } from '@playwright/test';
import {
  STRIPE_E2E_SKIP_REASON,
  buildSignupInputs,
  confirmSupabaseEmail,
  fillStripeEmbeddedCheckout,
  stripeE2eConfigured,
  submitSignupViaApi,
} from './helpers/stripe-e2e';

test.describe('Signup → Stripe Checkout → trialing (GA gate)', () => {
  test.skip(!stripeE2eConfigured(), STRIPE_E2E_SKIP_REASON);

  test('a founding admin can sign up, pay with the test card, and land trialing', async ({
    page,
    request,
  }) => {
    // Provisioning polls a Stripe webhook round-trip, and the assertions below
    // budget up to ~150s combined — set an explicit per-test timeout that
    // comfortably exceeds them (test.slow() would only give 90s).
    test.setTimeout(180_000);

    const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const inputs = buildSignupInputs(runId);

    // 1. Create the signup request. The route also creates the Supabase auth
    //    user (server-side admin generateLink) and links it to the pending row.
    const signupRequestId = await submitSignupViaApi(request, inputs);

    // 2. Confirm the email out-of-band — there is no inbox in CI, and
    //    confirm-verification gates on the auth user's email_confirmed_at.
    await confirmSupabaseEmail(inputs.email);

    // 3. Advance the pending signup to email_verified (what the /signup/verify
    //    poll does once Supabase reports the email confirmed).
    const confirm = await request.post('/api/v1/auth/confirm-verification', {
      data: { signupRequestId },
    });
    expect(
      confirm.ok(),
      `confirm-verification failed: ${confirm.status()} ${await confirm.text().catch(() => '')}`,
    ).toBeTruthy();

    // 4. Open embedded Stripe Checkout and pay with the test card.
    await page.goto(`/signup/checkout?signupRequestId=${signupRequestId}`, {
      waitUntil: 'domcontentloaded',
    });
    await fillStripeEmbeddedCheckout(page);

    // 5. Stripe returns to the provisioning page; the webhook provisions a
    //    trialing community and ProvisioningProgress auto-logs-in + redirects.
    await expect(page).toHaveURL(/\/signup\/checkout\/return/, { timeout: 30_000 });

    // 6. Trialing is live: the app shell shows the "Free trial active" banner
    //    (rendered only for subscriptionStatus === 'trialing'). This is the
    //    definitive success signal and is host-agnostic (works even if the
    //    redirect lands on the community's subdomain).
    await expect(page.getByText(/free trial active/i)).toBeVisible({ timeout: 120_000 });
  });
});
