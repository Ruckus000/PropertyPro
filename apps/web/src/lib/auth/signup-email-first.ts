/**
 * Email-first signup (design "Front porch").
 *
 * The form signup in `signup.ts` asks for everything — including a password —
 * before the email is verified, and writes a `pending_signups` row up front.
 * This flow asks for the email ONLY, and the row is written after the emailed
 * link has signed the user in:
 *
 *   1. `startEmailFirstSignup(email)` — create or find the Supabase auth user,
 *      email a first-party link. No `pending_signups` row: every community
 *      column there is NOT NULL, and a placeholder slug would collide on
 *      `pending_signups_candidate_slug_active_unique` the moment the row
 *      became `email_verified`. The auth user is the email-holding record.
 *   2. `/auth/verify-signup` verifies the token and KEEPS the session.
 *   3. `submitSignupDetails(user, answers)` — the session (with a confirmed
 *      email) proves ownership, so the row is written straight to
 *      `email_verified` and the existing checkout → webhook → provisioning path
 *      runs unchanged.
 *
 * ponytail: no migration. The pending row is written once it is complete,
 * instead of relaxing NOT NULLs to hold a half-finished one.
 */
import { randomBytes } from 'node:crypto';
import { createElement } from 'react';
// AUTHZ: Auth flow — pre-tenant signup state keyed by the caller's own verified session email; no community exists yet.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { pendingSignups } from '@propertypro/db';
import { eq, notInArray } from '@propertypro/db/filters';
import { sendEmail, SignupVerificationEmail } from '@propertypro/email';
import { CURRENT_TERMS_VERSION } from '@propertypro/shared';
import { ForbiddenError, SignupEmailDeliveryError, ValidationError } from '@/lib/api/errors';
import { isNamedUniqueViolation } from '@/lib/db/postgres-error';
import { checkDistributedRateLimit } from '@/lib/middleware/distributed-rate-limiter';
import { getRateLimiter } from '@/lib/middleware/rate-limiter';
import { closeCheckoutSession } from '@/lib/services/stripe-service';
import { getBaseUrl } from '@/lib/utils/url';
import {
  POST_PAYMENT_SIGNUP_STATUSES,
  checkSignupSubdomainAvailability,
  enforceMinSignupResponseTime,
  generateSignupAuthLink,
} from './signup';
import { SIGNUP_EXPIRY_MS } from './signup-expiry';
import { signupDetailsSchema, signupStartSchema } from './signup-schema';

export const START_SIGNUP_MESSAGE = 'Check your email for a link to continue.';

/**
 * Floor on the start response. Higher than the form flow's 250ms because the
 * already-registered branch makes a second GoTrue call; an unpadded response
 * would tell a caller whether an address has an account.
 */
const MIN_START_RESPONSE_MS = 800;

/** Per-address cap on link emails, on top of the auth tier's 10/min per IP. */
const START_EMAILS_PER_WINDOW = 3;
const START_WINDOW_MS = 15 * 60 * 1000;

/**
 * The account is passwordless; GoTrue's `signup` link still requires one. It is
 * random, never stored or shown, and the user can set a real one through the
 * existing reset flow. The fixed suffix satisfies every PASSWORD_POLICY class
 * (lower/upper/digit/special) whatever the random part happens to contain.
 */
function unusablePassword(): string {
  return `${randomBytes(32).toString('base64url')}aA1!`;
}

async function consumeStartBudget(email: string): Promise<boolean> {
  const key = `rl:signup-start:email:${email}`;
  const verdict =
    (await checkDistributedRateLimit(key, START_EMAILS_PER_WINDOW, START_WINDOW_MS)) ??
    getRateLimiter().check(key, START_EMAILS_PER_WINDOW, START_WINDOW_MS);
  return verdict.allowed;
}

/**
 * Step 1. Always answers `{ message }` — the same body for a new address, an
 * existing account, and a throttled address — so the endpoint cannot be used to
 * learn who has an account. The email itself is what differs, and only the
 * address owner reads it.
 */
export async function startEmailFirstSignup(rawInput: unknown): Promise<{ message: string }> {
  const startMs = Date.now();
  const parsed = signupStartSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError('Invalid signup payload', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const email = parsed.data.email.trim().toLowerCase();

  if (!(await consumeStartBudget(email))) {
    console.info(JSON.stringify({ event: 'signup.start.throttled' }));
    await enforceMinSignupResponseTime(startMs, MIN_START_RESPONSE_MS);
    return { message: START_SIGNUP_MESSAGE };
  }

  const redirectTo = new URL('/signup', getBaseUrl());
  redirectTo.searchParams.set('verified', '1');

  const auth = await generateSignupAuthLink({
    email,
    password: unusablePassword(),
    redirectTo: redirectTo.toString(),
  });

  try {
    await sendEmail({
      to: email,
      subject: 'Your link to continue your PropertyPro signup',
      category: 'transactional',
      react: createElement(SignupVerificationEmail, {
        branding: { communityName: 'PropertyPro Florida' },
        verificationLink: auth.verificationLink,
      }),
    });
  } catch (emailError) {
    console.error(JSON.stringify({
      event: 'signup.start.email_failed',
      authUserId: auth.authUserId,
      error: emailError instanceof Error ? emailError.message : String(emailError),
    }));
    throw new SignupEmailDeliveryError();
  }

  console.info(JSON.stringify({ event: 'signup.start.sent', authUserId: auth.authUserId }));
  await enforceMinSignupResponseTime(startMs, MIN_START_RESPONSE_MS);
  return { message: START_SIGNUP_MESSAGE };
}

export interface SignupSessionUser {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

export interface SignupDetailsResult {
  signupRequestId: string;
  subdomain: string;
}

const ALREADY_SIGNED_UP_MESSAGE =
  'This email already has a PropertyPro community. Sign in to continue.';

/**
 * Step 3. The caller is the signed-in owner of `user.email`, which is stronger
 * proof than the bearer `signupRequestId` the form flow relies on, so an
 * existing pre-payment row for this address is theirs to overwrite.
 */
export async function submitSignupDetails(
  user: SignupSessionUser,
  rawInput: unknown,
): Promise<SignupDetailsResult> {
  if (!user.email || !user.email_confirmed_at) {
    throw new ForbiddenError('Confirm your email before continuing.');
  }
  const parsed = signupDetailsSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError('Invalid signup payload', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const input = parsed.data;
  const email = user.email.trim().toLowerCase();
  const now = new Date();
  const db = createUnscopedClient();

  const [existing] = await db
    .select({
      signupRequestId: pendingSignups.signupRequestId,
      status: pendingSignups.status,
      expiresAt: pendingSignups.expiresAt,
      payload: pendingSignups.payload,
    })
    .from(pendingSignups)
    .where(eq(pendingSignups.emailNormalized, email))
    .limit(1);

  if (existing && (POST_PAYMENT_SIGNUP_STATUSES as readonly string[]).includes(existing.status)) {
    throw new ValidationError(ALREADY_SIGNED_UP_MESSAGE, { field: 'email' });
  }

  // An expired row's id may have been disclosed while it was live; reusing it
  // would hand that earlier holder the new signup. Mint a fresh one instead.
  const isLive =
    existing
    && existing.status !== 'expired'
    && (existing.expiresAt == null || existing.expiresAt > now);
  const signupRequestId = isLive ? existing.signupRequestId : crypto.randomUUID();

  // Editing answers after Checkout opened: close that session first, or it can
  // still be paid at the old plan while provisioning reads the new one.
  const openSessionId =
    isLive && existing.status === 'checkout_started'
      ? existing.payload?.stripeCheckoutSessionId
      : undefined;
  if (typeof openSessionId === 'string' && openSessionId) {
    if ((await closeCheckoutSession(openSessionId)) === 'complete') {
      throw new ValidationError(ALREADY_SIGNED_UP_MESSAGE, { field: 'email' });
    }
  }

  const subdomain = await checkSignupSubdomainAvailability(input.candidateSlug, {
    excludeSignupRequestId: signupRequestId,
    signupRequestId,
  });
  if (!subdomain.available) {
    throw new ValidationError(subdomain.message, {
      field: 'candidateSlug',
      reason: subdomain.reason,
    });
  }

  const columns = {
    signupRequestId,
    authUserId: user.id,
    primaryContactName: input.primaryContactName,
    email,
    communityName: input.communityName,
    address: input.address,
    addressLine1: input.addressLine1,
    city: input.city || null,
    state: input.state || null,
    zipCode: input.zipCode || null,
    county: input.county,
    unitCount: input.unitCount,
    communityType: input.communityType,
    planKey: input.planKey,
    candidateSlug: subdomain.normalizedSubdomain,
    // Stamped at the moment of acceptance; see the column docblock.
    termsAcceptedAt: now,
    termsVersion: CURRENT_TERMS_VERSION,
    status: 'email_verified',
    // Rebuilt whole, which also drops a closed `stripeCheckoutSessionId` so
    // `createCheckoutSession` opens a fresh one at the new plan.
    payload: {
      signupRequestId,
      flow: 'email_first',
      primaryContactName: input.primaryContactName,
      email,
      communityName: input.communityName,
      address: input.address,
      addressLine1: input.addressLine1,
      city: input.city,
      state: input.state,
      zipCode: input.zipCode,
      county: input.county,
      unitCount: input.unitCount,
      communityType: input.communityType,
      planKey: input.planKey,
      candidateSlug: subdomain.normalizedSubdomain,
      termsAccepted: true,
    },
    updatedAt: now,
    expiresAt: new Date(now.getTime() + SIGNUP_EXPIRY_MS),
  };

  let rows: Array<{ signupRequestId: string; candidateSlug: string }>;
  try {
    rows = await db
      .insert(pendingSignups)
      .values({ ...columns, emailNormalized: email })
      .onConflictDoUpdate({
        target: pendingSignups.emailNormalized,
        set: columns,
        // A payment that lands between the read above and this write must win.
        setWhere: notInArray(pendingSignups.status, [...POST_PAYMENT_SIGNUP_STATUSES]),
      })
      .returning({
        signupRequestId: pendingSignups.signupRequestId,
        candidateSlug: pendingSignups.candidateSlug,
      });
  } catch (error) {
    if (isNamedUniqueViolation(error, 'pending_signups_candidate_slug_active_unique')) {
      throw new ValidationError('That subdomain is no longer available.', {
        field: 'candidateSlug',
      });
    }
    throw error;
  }

  const row = rows[0];
  if (!row) {
    throw new ValidationError(ALREADY_SIGNED_UP_MESSAGE, { field: 'email' });
  }

  console.info(JSON.stringify({
    event: 'signup.details_saved',
    signupRequestId: row.signupRequestId,
    slug: row.candidateSlug,
  }));
  return { signupRequestId: row.signupRequestId, subdomain: row.candidateSlug };
}

export const _testInternals = {
  MIN_START_RESPONSE_MS,
  START_EMAILS_PER_WINDOW,
  START_WINDOW_MS,
  unusablePassword,
} as const;
