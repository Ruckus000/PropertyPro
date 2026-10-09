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
 * The founder is signed in through the email-first routes (the emailed link is
 * re-minted with the service-role key, since CI has no inbox), then walks the
 * real `/signup` trial step: "Start free trial" saves the answers and mounts
 * Embedded Checkout inline. See helpers/stripe-e2e.ts.
 */
import { expect, test } from '@playwright/test';
import {
  STRIPE_E2E_SKIP_REASON,
  assertSafeStripeE2eTarget,
  buildSignupInputs,
  fillStripeEmbeddedCheckout,
  reachEmbeddedCheckout,
  signInEmailFirst,
  signupDetailsBody,
  stripeE2eConfigured,
} from './helpers/stripe-e2e';

test.describe('Signup → Stripe Checkout → trialing (GA gate)', () => {
  test.skip(!stripeE2eConfigured(), STRIPE_E2E_SKIP_REASON);

  test('a founding admin can sign up, pay with the test card, and land trialing', async ({ page }) => {
    // Blast-radius guard: this test creates real auth users + communities, so
    // refuse to run against a known-production Supabase project (Stripe test
    // mode does NOT make a prod database safe). Fails fast before any write.
    assertSafeStripeE2eTarget();

    // Provisioning polls a Stripe webhook round-trip, and the assertions below
    // budget up to ~210s combined — set an explicit per-test timeout that
    // comfortably exceeds them (test.slow() would only give 90s).
    test.setTimeout(240_000);

    const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const inputs = buildSignupInputs(runId);

    // 1. Sign in as the founder, through the email-first routes.
    await signInEmailFirst(page, inputs);

    // 2. "Start free trial" on the trial step saves the answers and mounts
    //    embedded Stripe Checkout inline. Pay with the test card.
    await reachEmbeddedCheckout(page, inputs);
    await fillStripeEmbeddedCheckout(page);

    // 3. Stripe returns to the provisioning page; the webhook provisions the
    //    community and ProvisioningProgress shows the "live" screen.
    await expect(page).toHaveURL(/\/signup\/checkout\/return/, { timeout: 30_000 });
    await expect(page.getByText(/ is live\./)).toBeVisible({ timeout: 120_000 });

    // 4. Into the community.
    await page.getByRole('button', { name: 'Go to your dashboard' }).click();

    // 5. Trialing is live: the app shell shows the "Free trial active" banner
    //    (rendered only for subscriptionStatus === 'trialing'). This is the
    //    definitive success signal and is host-agnostic (works even if the
    //    redirect lands on the community's subdomain).
    await expect(page.getByText(/free trial active/i)).toBeVisible({ timeout: 60_000 });

    // 6. A paid email cannot start a second signup.
    //
    // Asserted here rather than in signup-failure-paths.spec.ts because it needs
    // an email that has genuinely completed payment, and this test has just
    // produced one — checking it there would mean paying twice. Without this
    // guard a customer who already has a community can walk the pricing page
    // again and be charged for a second one.
    const duplicate = await page.request.post('/api/v1/auth/signup/details', {
      data: {
        ...signupDetailsBody(inputs),
        communityName: `${inputs.communityName} Duplicate`,
        candidateSlug: `${inputs.candidateSlug}-dup`.slice(0, 40),
      },
    });
    expect(
      duplicate.status(),
      'a second signup with an already-paid email must be refused',
    ).toBe(400);
    expect(await duplicate.text()).toMatch(/already has a PropertyPro community/i);
  });
});
