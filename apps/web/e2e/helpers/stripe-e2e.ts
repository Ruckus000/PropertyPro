/**
 * Helpers for the signup → Stripe Checkout → trialing E2E (`signup-trialing.spec.ts`).
 *
 * This flow is the one GA-gate item that cannot run in CI: it needs live
 * **Stripe test-mode** secrets, a Supabase **service-role** key (to confirm the
 * signup email out-of-band — there is no inbox in CI), and a running Stripe
 * webhook forwarder (`stripe listen`) so `checkout.session.completed` provisions
 * the community. When those aren't configured the spec skips (see
 * `stripeE2eConfigured`), keeping the default suite green.
 *
 * ── First-run validation ──
 * Two seams here interact with external UIs/APIs that this repo can't exercise
 * in CI, so VERIFY them on the first real run and adjust if needed:
 *   1. `confirmSupabaseEmail` — Supabase admin `updateUserById(..., { email_confirm })`.
 *   2. `fillStripeEmbeddedCheckout` — Stripe controls the embedded-checkout iframe
 *      DOM; the field selectors are best-effort and may need tweaking.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/** Env this spec needs to actually run; missing/invalid values → skip. */
export const STRIPE_E2E_ENV = {
  optIn: process.env.E2E_STRIPE === '1',
  stripeSecret: process.env.STRIPE_SECRET_KEY,
  stripePublishable: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
} as const;

/** Guardrail: only ever run against a Stripe **test-mode** secret key. */
export function isStripeTestModeKey(key: string | undefined): key is string {
  return typeof key === 'string' && key.startsWith('sk_test_');
}

/** True only when every prerequisite for a real run is present (else the spec skips). */
export function stripeE2eConfigured(): boolean {
  return (
    STRIPE_E2E_ENV.optIn &&
    isStripeTestModeKey(STRIPE_E2E_ENV.stripeSecret) &&
    Boolean(STRIPE_E2E_ENV.stripePublishable) &&
    Boolean(STRIPE_E2E_ENV.supabaseUrl) &&
    Boolean(STRIPE_E2E_ENV.supabaseServiceRoleKey)
  );
}

export const STRIPE_E2E_SKIP_REASON =
  'signup→trialing E2E needs test-mode Stripe + Supabase service-role secrets. ' +
  'Set E2E_STRIPE=1, STRIPE_SECRET_KEY=sk_test_…, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, ' +
  'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and run ' +
  '`stripe listen --forward-to 127.0.0.1:3000/api/v1/webhooks/stripe`. ' +
  'See docs/audits/2026-07-11-stripe-cancel-smoke.md.';

/** Stripe's universally-accepted test card — never charged in test mode. */
export const STRIPE_TEST_CARD = {
  number: '4242424242424242',
  expiry: '12 / 34',
  cvc: '123',
  zip: '33139',
} as const;

export interface SignupInputs {
  email: string;
  password: string;
  primaryContactName: string;
  communityName: string;
  candidateSlug: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  planKey: 'essentials' | 'professional';
}

/**
 * Unique-per-run inputs so repeated runs don't collide on email/subdomain.
 * Pass a monotonic `runId` (e.g. `Date.now()`); randomness is fine in test code.
 */
export function buildSignupInputs(runId: string): SignupInputs {
  return {
    email: `e2e-trialing+${runId}@propertypro-e2e.test`,
    password: 'E2eTrial!ng-9f3k2Q',
    primaryContactName: 'E2E Founding Admin',
    communityName: `E2E Trial Community ${runId}`,
    candidateSlug: `e2e-trial-${runId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40),
    communityType: 'condo_718',
    planKey: 'essentials',
  };
}

/**
 * POST /api/v1/auth/signup — creates the pending-signup row AND the Supabase
 * auth user (server-side via the admin `generateLink` API; see
 * `apps/web/src/lib/auth/signup.ts`). Returns the `signupRequestId`.
 */
export async function submitSignupViaApi(
  request: APIRequestContext,
  inputs: SignupInputs,
): Promise<string> {
  const res = await request.post('/api/v1/auth/signup', {
    data: {
      primaryContactName: inputs.primaryContactName,
      email: inputs.email,
      password: inputs.password,
      communityName: inputs.communityName,
      addressLine1: '100 Ocean Drive',
      city: 'Miami',
      state: 'FL',
      zipCode: '33139',
      county: 'Miami-Dade',
      unitCount: 40,
      communityType: inputs.communityType,
      planKey: inputs.planKey,
      candidateSlug: inputs.candidateSlug,
      termsAccepted: true,
    },
  });
  expect(
    res.ok(),
    `signup POST failed: ${res.status()} ${await res.text().catch(() => '')}`,
  ).toBeTruthy();
  const body = (await res.json()) as
    | { signupRequestId?: string; data?: { signupRequestId?: string } }
    | undefined;
  // Route envelope may be flat or `{ data: … }` depending on runRoute wrapping.
  const signupRequestId = body?.data?.signupRequestId ?? body?.signupRequestId;
  expect(signupRequestId, 'signup response missing signupRequestId').toBeTruthy();
  return signupRequestId as string;
}

/**
 * Confirm the signup email out-of-band via the Supabase admin API. CI has no
 * inbox, and `/api/v1/auth/confirm-verification` gates on the auth user's
 * `email_confirmed_at` — so we set it directly with the service-role key.
 *
 * FIRST-RUN: verify the admin `updateUserById(..., { email_confirm: true })`
 * shape against the installed `@supabase/supabase-js` version.
 */
export async function confirmSupabaseEmail(email: string): Promise<void> {
  const admin = createClient(
    STRIPE_E2E_ENV.supabaseUrl as string,
    STRIPE_E2E_ENV.supabaseServiceRoleKey as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Supabase admin has no getUserByEmail; page through listUsers until found.
  const target = email.toLowerCase();
  let userId: string | undefined;
  for (let pageNum = 1; pageNum <= 20 && !userId; pageNum++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pageNum, perPage: 200 });
    if (error) throw new Error(`Supabase listUsers failed: ${error.message}`);
    const users = (data?.users ?? []) as Array<{ id: string; email?: string | null }>;
    userId = users.find((u) => u.email?.toLowerCase() === target)?.id;
    if (users.length < 200) break; // last page
  }
  if (!userId) throw new Error(`No Supabase auth user found for ${email}`);

  const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
  if (error) throw new Error(`Supabase email confirm failed: ${error.message}`);
}

/**
 * Fill and submit the Stripe **Embedded Checkout** form on `/signup/checkout`.
 *
 * Stripe renders this inside an iframe on our page and owns its DOM — the
 * selectors below target the current embedded-checkout markup and may need
 * adjustment when Stripe changes it. Card fields may live in nested PCI iframes;
 * `frameLocator` chaining handles one level, and `getByLabel` is resilient to
 * minor label changes.
 */
export async function fillStripeEmbeddedCheckout(page: Page): Promise<void> {
  const checkout = page
    .frameLocator(
      'iframe[title="Secure checkout"], iframe[name^="embedded-checkout"], iframe[src*="checkout.stripe.com"]',
    )
    .first();

  await checkout.getByLabel(/card number/i).fill(STRIPE_TEST_CARD.number);
  await checkout.getByLabel(/expiration|expiry|MM \/ YY/i).fill(STRIPE_TEST_CARD.expiry);
  await checkout.getByLabel(/CVC|CVV|security code/i).fill(STRIPE_TEST_CARD.cvc);

  // These two are conditionally collected depending on Stripe Checkout config.
  const nameField = checkout.getByLabel(/name on card|cardholder name/i);
  if (await nameField.count()) await nameField.fill('E2E Founding Admin');
  const zipField = checkout.getByLabel(/zip|postal code/i);
  if (await zipField.count()) await zipField.fill(STRIPE_TEST_CARD.zip);

  await checkout
    .getByRole('button', { name: /subscribe|start trial|pay|confirm|complete/i })
    .first()
    .click();
}
