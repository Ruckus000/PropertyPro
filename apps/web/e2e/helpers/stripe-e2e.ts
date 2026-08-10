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
 * Also used by `signup-failure-paths.spec.ts` (declined card, abandonment,
 * duplicate signup), which shares the same guards and skip behaviour.
 *
 * ── First run: DONE, 2026-08-09 ──
 * Both externally-owned seams flagged here have now been exercised against a
 * real Stripe test account and a local Supabase stack:
 *   1. `confirmSupabaseEmail` — the admin `updateUserById(..., { email_confirm })`
 *      shape is correct as written; no change was needed.
 *   2. `fillStripeEmbeddedCheckout` — needed three fixes, all recorded at the
 *      function itself: the card form is not mounted until the accordion is
 *      expanded, the submit control must be found by test id (a name regex
 *      matches an invisible accordion header first), and a REQUIRED phone field
 *      silently blocks submission when the account collects one.
 * The end-to-end result: community `trialing` on the purchased plan, verified in
 * the database and not merely from the UI banner.
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

/**
 * Supabase project refs known to be PRODUCTION. This spec creates real auth
 * users + communities and mutates auth via the service-role key, so it must
 * NEVER point at any of these. `isStripeTestModeKey` only proves Stripe is in
 * test mode — it does nothing to protect the database/auth backend, which is
 * the actual blast radius. Extend this list, or add more via the
 * comma-separated `E2E_BLOCKED_SUPABASE_REFS` env, as new prod projects appear.
 */
export const KNOWN_PROD_SUPABASE_REFS: readonly string[] = ['vbqobyagjzvlfpfozvmx'];

function blockedSupabaseRefs(): string[] {
  const extra = (process.env.E2E_BLOCKED_SUPABASE_REFS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...KNOWN_PROD_SUPABASE_REFS, ...extra];
}

/** The first blocked (prod) Supabase ref the configured URL matches, or null. */
export function matchedProdSupabaseRef(url: string | undefined): string | null {
  if (!url) return null;
  return blockedSupabaseRefs().find((ref) => ref.length > 0 && url.includes(ref)) ?? null;
}

/**
 * Fail fast BEFORE any write if the configured Supabase target is a known
 * production project. Call this at the very top of the test so a misconfigured
 * run errors loudly instead of creating real signup/community/auth records.
 *
 * Scope: this checks the Supabase URL as seen by the Playwright RUNNER. The
 * actual signup write is performed by the `next dev` webServer, which loads its
 * own env — in the documented single-`.env.local` setup both share one target,
 * so this guard covers it. If you deliberately run the runner and an already-up
 * dev server against different projects, also point the server at a dev/test DB.
 */
export function assertSafeStripeE2eTarget(): void {
  const hit = matchedProdSupabaseRef(STRIPE_E2E_ENV.supabaseUrl);
  if (hit) {
    throw new Error(
      `Refusing to run the signup→trialing E2E: NEXT_PUBLIC_SUPABASE_URL points at a ` +
        `known PRODUCTION Supabase project (ref "${hit}"). This spec creates real auth ` +
        `users + communities — point NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ` +
        `DATABASE_URL at a dev/test project first. (Stripe test mode does NOT make a prod ` +
        `database safe.)`,
    );
  }
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

/**
 * The copy `/signup/checkout` renders when `createCheckoutSession` returns
 * `{ ok: false }` (see `apps/web/src/lib/actions/checkout.ts`). Matching it is
 * how the spec tells "Stripe Checkout has not mounted yet" apart from "Stripe
 * Checkout is never going to mount".
 */
const CHECKOUT_FAILURE_COPY = /unable to start checkout/i;

/**
 * Embedded-checkout iframe. Stripe owns this markup, so it is the string in
 * this file most likely to need updating — keep it in ONE place. If the mount
 * check and the fill used different selectors, the mount check could pass while
 * `frameLocator` then timed out, which is exactly the confusing failure
 * `assertCheckoutSessionStarted` exists to prevent.
 */
const CHECKOUT_IFRAME_SELECTOR =
  'iframe[title="Secure checkout"], iframe[name^="embedded-checkout"], iframe[src*="checkout.stripe.com"]';

/**
 * Waits for embedded Stripe Checkout to mount, and fails immediately — with the
 * cause named — if the app reports a session-creation failure instead.
 *
 * This is a diagnosis fix, not a relaxation: the assertion that checkout must
 * mount is unchanged, it just stops being expressed as a 180s wait for a field
 * that cannot appear.
 */
async function assertCheckoutSessionStarted(page: Page): Promise<void> {
  const failure = page.getByText(CHECKOUT_FAILURE_COPY);
  const iframe = page.locator(CHECKOUT_IFRAME_SELECTOR);

  // Capture the winner rather than re-querying the DOM after the poll: a second
  // read is a fresh observation, so it can disagree with the one the assertion
  // actually passed on.
  //
  // Held in an object, not a bare `let`. TypeScript narrows a `let` to its
  // initializer's literal type and does not track writes made inside the poll
  // callback, so `outcome === 'failed'` below narrowed to a comparison between
  // '"pending"' and '"failed"' — TS2367, "no overlap". The runtime behaviour was
  // always correct; the property form is what makes the checker agree.
  const state: { outcome: 'failed' | 'mounted' | 'pending' } = { outcome: 'pending' };

  await expect
    .poll(
      async () => {
        const [failed, mounted] = await Promise.all([failure.count(), iframe.count()]);
        state.outcome = failed ? 'failed' : mounted ? 'mounted' : 'pending';
        return state.outcome;
      },
      {
        timeout: 30_000,
        message:
          'Stripe embedded Checkout never mounted and the app reported no error — ' +
          'check that the dev server is up and /signup/checkout was reached with a valid signupRequestId.',
      },
    )
    .not.toBe('pending');

  if (state.outcome === 'failed') {
    throw new Error(
      'Stripe Checkout session creation FAILED — the app rendered "Unable to start checkout". ' +
        'The usual cause is that STRIPE_SECRET_KEY cannot see the ids in the `stripe_prices` ' +
        'table: either the key and the stored prices are in different Stripe modes (test vs ' +
        'live), or the table holds placeholder ids from a local seed (`price_placeholder_…`), ' +
        'which no Stripe account can resolve. Check the dev-server log for ' +
        '`checkout.session_creation_failed`.',
    );
  }
}

/** Stripe's universally-accepted test card — never charged in test mode. */
export const STRIPE_TEST_CARD = {
  number: '4242424242424242',
  expiry: '12 / 34',
  cvc: '123',
  zip: '33139',
  /** Only used when the Stripe account collects a phone number at checkout. */
  phone: '2015550123',
} as const;

/**
 * Stripe's generic-decline test card.
 *
 * MEASURED against a trialing subscription (2026-08-09): because the first
 * invoice is $0, Checkout sets the card up rather than charging it, so the
 * decline surfaces as `setup_intent.setup_failed` and NO
 * `checkout.session.completed` is emitted. A Stripe **customer** IS created —
 * so "a customer exists in Stripe" is not evidence that anyone paid.
 */
export const STRIPE_DECLINED_CARD = {
  ...STRIPE_TEST_CARD,
  number: '4000000000000002',
} as const;

/**
 * Structural, not `typeof STRIPE_TEST_CARD`: the `as const` on that object makes
 * every field a string LITERAL type, so the declined card's number is not
 * assignable to it.
 */
export interface StripeTestCard {
  readonly number: string;
  readonly expiry: string;
  readonly cvc: string;
  readonly zip: string;
  readonly phone: string;
}

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
 * ── Measured against the live test-mode UI, 2026-08-09 ──
 * The two things that made the original best-effort version time out:
 *
 *  1. **The card form is not mounted on load.** Checkout renders a payment-method
 *     accordion (Card / Cash App / Klarna) with every item COLLAPSED, and mounts
 *     an item's fields only once it is selected. A frame dump on arrival shows no
 *     card input at all — just the accordion radios and a phone field — so any
 *     wait for a card field waits forever, however generous the timeout. The
 *     accordion must be expanded first.
 *  2. **There is no nested PCI iframe here, and no usable label for every field.**
 *     Once expanded, the card inputs live DIRECTLY in the `embedded-checkout`
 *     frame, so `frameLocator` chaining is unnecessary. `#billingName` in
 *     particular carries no `aria-label`, so the old `getByLabel(/name on card/i)`
 *     matched nothing — and because it was guarded by `if (await count())` it
 *     failed SILENTLY, leaving the name blank instead of erroring.
 *
 * Fields are therefore addressed by their stable Stripe ids (`#cardNumber`,
 * `#cardExpiry`, `#cardCvc`, `#billingName`, `#billingPostalCode`). These are
 * still Stripe-owned markup and remain the most likely thing in this file to
 * need updating — `e2e/tmp-inspect-checkout` style frame dumping is how they
 * were obtained, and re-dumping is the fastest way to re-derive them.
 */
export async function fillStripeEmbeddedCheckout(
  page: Page,
  options: { card?: StripeTestCard } = {},
): Promise<void> {
  const card = options.card ?? STRIPE_TEST_CARD;
  await assertCheckoutSessionStarted(page);

  const checkout = page.frameLocator(CHECKOUT_IFRAME_SELECTOR).first();
  const cardNumber = checkout.locator('#cardNumber');

  // Expand the Card accordion item, and keep expanding until it STAYS expanded.
  //
  // A single click is not enough and the failure is timing-dependent, which is
  // worse than a hard one: Checkout keeps initialising after the accordion first
  // paints (Link lookup, wallet availability, express-checkout frames), and a
  // re-render during that window discards an early selection and collapses the
  // item again. The click then appears to have worked and the card form is
  // simply absent 30 seconds later. Polling both conditions together — click if
  // collapsed, stop when `#cardNumber` exists — converges regardless of where in
  // that sequence we land, and needs no arbitrary settle sleep.
  await expect
    .poll(
      async () => {
        if (await cardNumber.count()) return 'mounted';
        const radio = checkout.locator('#payment-method-accordion-item-title-card');
        if (await radio.count()) {
          // `force`: the hit target is the styled row, not the radio itself.
          await radio.click({ force: true }).catch(() => {
            /* mid-re-render detach — the next poll iteration retries */
          });
        }
        return 'collapsed';
      },
      {
        timeout: 60_000,
        message:
          'Stripe Checkout mounted but the card form never appeared. Either the ' +
          'payment-method accordion markup changed, or card is not an enabled ' +
          'payment method on this account — re-dump the frame contents.',
      },
    )
    .toBe('mounted');

  await expect(cardNumber).toBeVisible({ timeout: 15_000 });

  await cardNumber.fill(card.number);
  await checkout.locator('#cardExpiry').fill(card.expiry);
  await checkout.locator('#cardCvc').fill(card.cvc);

  // Conditionally collected, depending on the account's Checkout settings.
  // Unlike the fields above these may legitimately be absent, so a zero count
  // is tolerated — but they are addressed by id, so absence means absence
  // rather than a stale selector.
  const nameField = checkout.locator('#billingName');
  if (await nameField.count()) await nameField.fill('E2E Founding Admin');
  const zipField = checkout.locator('#billingPostalCode');
  if (await zipField.count()) await zipField.fill(card.zip);

  // Phone number, when the account has phone collection enabled.
  //
  // This one is worth its own note because of how it fails: an unfilled
  // REQUIRED phone leaves the form invalid, and Stripe's response to submitting
  // an invalid form is to do nothing at all — no error banner, no navigation,
  // no network call. The observed symptom was the test timing out on the return
  // URL with zero Stripe events forwarded, which reads like a broken webhook or
  // a dead redirect rather than an unfilled field three steps earlier. The only
  // visible tell was `aria-invalid="true"` on an empty `#phoneNumber`.
  const phoneField = checkout.locator('#phoneNumber');
  if (await phoneField.count()) await phoneField.fill(card.phone);

  // Submit by test id, NOT by accessible name.
  //
  // A name regex is what a form like this looks like it wants, and it is wrong
  // here: the accordion's own collapsed rows are `<button aria-label="Pay with
  // card">`, so a `/pay/i` alternative matches an INVISIBLE accordion header
  // before it ever reaches the real submit. The observed failure is 30s of
  // "element is not visible" retries against a button that was never the target
  // — a locator bug that reads exactly like an app hang.
  //
  // `hosted-payment-submit-button` is Stripe's own stable hook for this control
  // (measured: `type="submit"`, label "Start trial" while a trial applies).
  await checkout.getByTestId('hosted-payment-submit-button').click();
}
