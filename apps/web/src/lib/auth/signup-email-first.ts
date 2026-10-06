/**
 * Email-first signup (design "Front porch").
 *
 * The form signup in `signup.ts` asks for everything — including a password —
 * before the email is verified, and writes a `pending_signups` row up front.
 * This flow asks for the email ONLY, and the row is written after the emailed
 * link has signed the user in:
 *
 *   1. `startEmailFirstSignup(email)` — one `magiclink` generateLink, which
 *      GoTrue turns into a `signup` (creating a passwordless-in-practice user
 *      with its own random password) when the address is new, and email a
 *      first-party link. No `pending_signups` row: every community
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
// AUTHZ: Auth flow — pre-tenant signup state keyed by the caller's own verified session email; no community exists yet.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { pendingSignups } from '@propertypro/db';
import { eq, notInArray } from '@propertypro/db/filters';
// AUTHZ: GoTrue admin generateLink for the address the caller typed; the link is emailed only to that address.
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { randomBytes } from 'node:crypto';
import { CURRENT_TERMS_VERSION } from '@propertypro/shared';
import { ForbiddenError, SignupEmailDeliveryError, ValidationError } from '@/lib/api/errors';
import { RateLimitError } from '@/lib/api/errors/RateLimitError';
import { isNamedUniqueViolation } from '@/lib/db/postgres-error';
import { consumeKeyedRateLimit } from '@/lib/api/keyed-rate-limit';
import { closeCheckoutSession } from '@/lib/services/stripe-service';
import { getBaseUrl } from '@/lib/utils/url';
import {
  POST_PAYMENT_SIGNUP_STATUSES,
  buildPendingSignupPayload,
  checkSignupSubdomainAvailability,
  enforceMinSignupResponseTime,
  sendSignupVerificationEmail,
} from './signup';
import {
  COMMUNITY_EXISTS_FIELD,
  COMMUNITY_EXISTS_MESSAGE,
  checkSignupAddress,
} from './community-address-conflict';
import { SIGNUP_EXPIRY_MS } from './signup-expiry';
import { signupDetailsSchema, signupStartSchema } from './signup-schema';
import { buildVerificationLink, type VerificationLinkType } from './verification-link';

export const START_SIGNUP_MESSAGE = 'Check your email for a link to continue.';

/**
 * Floor on the start response. Higher than the form flow's 250ms because the
 * already-registered branch makes a second GoTrue call; an unpadded response
 * would tell a caller whether an address has an account.
 */
const MIN_START_RESPONSE_MS = 800;

/**
 * Link-email caps, on top of the auth tier's 10/min per IP.
 *
 * Per address AND caller IP, so someone else spending an address's budget does
 * not silence the owner's own requests. Plus a looser per-address ceiling that
 * bounds how many unsolicited emails any one inbox can be sent. An attacker can
 * still exhaust that ceiling for a victim — any cap keyed on the address can be
 * spent by someone else — so it is set where real retries never reach it.
 */
const START_EMAILS_PER_CALLER = 3;
const START_CALLER_WINDOW_MS = 15 * 60 * 1000;
const START_EMAILS_PER_ADDRESS = 10;
const START_ADDRESS_WINDOW_MS = 60 * 60 * 1000;

async function consumeStartBudget(email: string, ip: string): Promise<boolean> {
  const caller = await consumeKeyedRateLimit(
    `rl:signup-start:email-ip:${email}:${ip}`,
    START_EMAILS_PER_CALLER,
    START_CALLER_WINDOW_MS,
  );
  if (!caller.allowed) return false;
  const address = await consumeKeyedRateLimit(
    `rl:signup-start:email:${email}`,
    START_EMAILS_PER_ADDRESS,
    START_ADDRESS_WINDOW_MS,
  );
  return address.allowed;
}

/**
 * One GoTrue call for every address, so new and existing accounts cost the same
 * time. `magiclink` for an unknown address is converted by GoTrue into a
 * `signup` with a generated password (auth `adminGenerateLink`), and verifying
 * either kind confirms the email. The token is bound to the type GoTrue
 * reports, so the link carries `verification_type`, not the type we asked for.
 */
async function generateStartLink(
  email: string,
  binding: string,
): Promise<{ link: string; authUserId: string | null }> {
  const redirectTo = new URL('/signup', getBaseUrl());
  redirectTo.searchParams.set('verified', '1');
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: redirectTo.toString() },
  });
  const token = data?.properties?.hashed_token;
  if (error || !token) {
    throw new Error(error?.message ?? 'generateLink returned no token');
  }
  // An UNCONFIRMED account may carry a password someone else chose: the form
  // flow creates one for any address with no proof of ownership. Verifying
  // this link confirms the account and leaves that password in place
  // (GoTrue recoverVerify), so the planter could then sign in to the
  // community this owner pays for. Replace it before the link goes out. An
  // unconfirmed account cannot have signed in, so no session is lost.
  if (data.user && !data.user.email_confirmed_at) {
    const { error: rotateError } = await admin.auth.admin.updateUserById(data.user.id, {
      password: randomBytes(48).toString('base64url'),
    });
    if (rotateError) {
      throw new Error(`password rotation failed: ${rotateError.message}`);
    }
  }
  const reported = data.properties.verification_type;
  const type: VerificationLinkType = reported === 'signup' ? 'signup' : 'magiclink';
  return {
    link: buildVerificationLink({ hashedToken: token, type, binding }),
    authUserId: data.user?.id ?? null,
  };
}

/**
 * Step 1. Always answers `{ message }` — the same body for a new address, an
 * existing account, and a throttled address — so the endpoint cannot be used to
 * learn who has an account. The email itself is what differs, and only the
 * address owner reads it.
 */
export async function startEmailFirstSignup(
  rawInput: unknown,
  callerIp: string,
): Promise<{ message: string }> {
  const startMs = Date.now();
  const parsed = signupStartSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError('Invalid signup payload', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const email = parsed.data.email.trim().toLowerCase();

  // Every branch below ends padded to the same floor, error branches included:
  // a fast or differently-shaped failure would tell a caller something about
  // the address.
  try {
    if (!(await consumeStartBudget(email, callerIp))) {
      console.info(JSON.stringify({ event: 'signup.start.throttled' }));
      return { message: START_SIGNUP_MESSAGE };
    }

    let auth: { link: string; authUserId: string | null };
    try {
      auth = await generateStartLink(email, parsed.data.binding);
    } catch (linkError) {
      // Answered generically: GoTrue's refusals are per-account (a banned
      // user, say). Logged for us; the user simply receives no email.
      console.error(JSON.stringify({
        event: 'signup.start.link_failed',
        error: linkError instanceof Error ? linkError.message : String(linkError),
      }));
      return { message: START_SIGNUP_MESSAGE };
    }

    try {
      await sendSignupVerificationEmail(undefined, undefined, email, auth.link, undefined);
    } catch (emailError) {
      // Provider failure is not per-address, so saying so reveals nothing.
      console.error(JSON.stringify({
        event: 'signup.start.email_failed',
        authUserId: auth.authUserId,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      }));
      throw new SignupEmailDeliveryError();
    }

    console.info(JSON.stringify({ event: 'signup.start.sent', authUserId: auth.authUserId }));
    return { message: START_SIGNUP_MESSAGE };
  } finally {
    await enforceMinSignupResponseTime(startMs, MIN_START_RESPONSE_MS);
  }
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

  // Reuse the row's id only when THIS session wrote it. Anyone can create a
  // form-flow row for any address with an id of their choosing (no proof of
  // ownership is needed for pending_verification), and whoever holds the id of
  // a paid signup can claim its first login token from provisioning-status.
  // An expired row's id may also have been disclosed while it was live.
  const ownLiveRow =
    existing
    && existing.payload?.['flow'] === 'email_first'
    && existing.payload?.['authUserId'] === user.id
    && existing.status !== 'expired'
    && (existing.expiresAt == null || existing.expiresAt > now);
  const signupRequestId = ownLiveRow ? existing.signupRequestId : crypto.randomUUID();

  // Before anything is written or closed: a refused address leaves the
  // caller's existing row and checkout exactly as they were.
  const addressCheck = await checkSignupAddress({
    email,
    addressLine1: input.addressLine1,
    zipCode: input.zipCode,
    excludeSignupRequestId: existing?.signupRequestId,
  });
  if (addressCheck === 'rate_limited') throw new RateLimitError();
  if (addressCheck === 'taken') {
    throw new ValidationError(COMMUNITY_EXISTS_MESSAGE, { field: COMMUNITY_EXISTS_FIELD });
  }

  // Whatever row is being replaced, close any Checkout session it opened, or
  // it can still be paid — at its old plan, or (when the id changes) against
  // an id that no longer exists, which takes payment and provisions nothing.
  const openSessionId = existing?.payload?.['stripeCheckoutSessionId'];
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
    // `createCheckoutSession` opens a fresh one at the new plan. `authUserId`
    // in the payload marks the row as this session's (see `ownLiveRow`).
    payload: buildPendingSignupPayload(
      {
        signupRequestId,
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
      },
      { flow: 'email_first', authUserId: user.id },
    ),
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
  START_EMAILS_PER_CALLER,
  START_EMAILS_PER_ADDRESS,
} as const;
