// Unsafe DB access is intentional here: signup intent is pre-tenant state.
// AUTHZ: Auth flow — pre-tenant state lookup, no community context yet.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, pendingSignups } from '@propertypro/db';
import { and, eq, gt, isNull, lt, notInArray, or } from '@propertypro/db/filters';
// AUTHZ: GoTrue admin generateLink for the signup being provisioned; only reached once the caller owns the signupRequestId (census F1)
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { sendEmail } from '@propertypro/email';
import { CURRENT_TERMS_VERSION } from '@propertypro/shared';
import { createElement } from 'react';
import { SignupVerificationEmail } from '@propertypro/email';
import { SignupEmailDeliveryError, ValidationError } from '@/lib/api/errors';
import { isReservedSubdomain } from '@/lib/tenant/reserved-subdomains';
import {
  normalizeSignupSubdomain,
  signupSchema,
  type SignupInput,
} from './signup-schema';
import { getBaseUrl } from '@/lib/utils/url';
import { buildVerificationLink, buildVerificationRedirectUrl } from './verification-link';
import { signupRemainingSteps } from './signup-remaining-steps';
import { isNamedUniqueViolation } from '@/lib/db/postgres-error';
import { SIGNUP_EXPIRY_MS } from './signup-expiry';

const SIGNUP_SUCCESS_MESSAGE =
  'Thanks for signing up. Check your email for a verification link before checkout.';
const MIN_SIGNUP_RESPONSE_MS = 250;
const VERIFICATION_EMAIL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const STRUCTURED_ADDRESS_DB_COLUMNS = new Set([
  'address_line_1',
  'city',
  'state',
  'zip_code',
]);

export interface SubdomainAvailabilityResult {
  normalizedSubdomain: string;
  available: boolean;
  reason: 'invalid' | 'reserved' | 'taken' | 'available' | 'unknown';
  message: string;
}

const SUBDOMAIN_UNKNOWN_MESSAGE =
  "We couldn't verify this subdomain right now. Please try again in a moment.";

export interface SignupSubmitResult {
  signupRequestId: string;
  subdomain: string;
  verificationRequired: true;
  checkoutEligible: false;
  message: string;
}

export async function checkSignupSubdomainAvailability(
  rawSubdomain: string,
  options?: { excludeSignupRequestId?: string; signupRequestId?: string },
): Promise<SubdomainAvailabilityResult> {
  const normalizedSubdomain = normalizeSignupSubdomain(rawSubdomain);
  const logContext = {
    signupRequestId: options?.signupRequestId,
    normalizedSubdomain,
  };

  if (!normalizedSubdomain || normalizedSubdomain.length < 3) {
    console.info(JSON.stringify({ event: 'subdomain.check.invalid', ...logContext }));
    return {
      normalizedSubdomain,
      available: false,
      reason: 'invalid',
      message: 'Subdomain must be at least 3 characters.',
    };
  }

  if (isReservedSubdomain(normalizedSubdomain)) {
    console.info(JSON.stringify({ event: 'subdomain.check.reserved', ...logContext }));
    return {
      normalizedSubdomain,
      available: false,
      reason: 'reserved',
      message: 'That subdomain is reserved and unavailable.',
    };
  }

  let existingCommunityRows: Array<{ id: number }>;
  let pendingRows: Array<{ id: bigint; signupRequestId: string }>;
  try {
    const db = createUnscopedClient();
    [existingCommunityRows, pendingRows] = await Promise.all([
      db
        .select({ id: communities.id })
        .from(communities)
        .where(eq(communities.slug, normalizedSubdomain))
        .limit(1),
      db
        .select({
          id: pendingSignups.id,
          signupRequestId: pendingSignups.signupRequestId,
        })
        .from(pendingSignups)
        .where(
          and(
            eq(pendingSignups.candidateSlug, normalizedSubdomain),
            // Only verified+ signups reserve slugs. Unverified signups
            // (pending_verification) don't block — prevents squatting by
            // bots or bad actors who never confirm their email.
            notInArray(pendingSignups.status, [
              'pending_verification',
              'expired',
              'completed',
            ]),
            // Exclude implicitly expired rows (cleanup job hasn't run yet).
            or(
              isNull(pendingSignups.expiresAt),
              gt(pendingSignups.expiresAt, new Date()),
            ),
          ),
        )
        .limit(5),
    ]);
  } catch (dbError) {
    console.error(JSON.stringify({
      event: 'subdomain.check.db_failure',
      ...logContext,
      error: dbError instanceof Error ? dbError.message : String(dbError),
    }));
    return {
      normalizedSubdomain,
      available: false,
      reason: 'unknown',
      message: SUBDOMAIN_UNKNOWN_MESSAGE,
    };
  }

  if (existingCommunityRows.length > 0) {
    console.info(JSON.stringify({ event: 'subdomain.check.taken.community', ...logContext }));
    return {
      normalizedSubdomain,
      available: false,
      reason: 'taken',
      message: 'That subdomain is already taken.',
    };
  }

  const conflictingPendingCount = pendingRows.filter(
    (row) => row.signupRequestId !== options?.excludeSignupRequestId,
  ).length;

  if (conflictingPendingCount > 0) {
    console.info(JSON.stringify({
      event: 'subdomain.check.taken.pending',
      ...logContext,
      conflictingPendingCount,
    }));
    return {
      normalizedSubdomain,
      available: false,
      reason: 'taken',
      message: 'That subdomain is already taken.',
    };
  }

  console.info(JSON.stringify({ event: 'subdomain.check.available', ...logContext }));
  return {
    normalizedSubdomain,
    available: true,
    reason: 'available',
    message: 'Subdomain is available.',
  };
}

interface PersistedSignupRow {
  id: bigint;
  signupRequestId: string;
  candidateSlug: string;
  verificationEmailSentAt: Date | null;
}

interface AuthVerificationLinkResult {
  authUserId: string | null;
  verificationLink: string;
}

type SignupPersistenceInput = SignupInput & {
  signupRequestId: string;
  email: string;
  candidateSlug: string;
};

export async function submitSignup(rawInput: unknown): Promise<SignupSubmitResult> {
  const startMs = Date.now();
  const parsed = signupSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError('Invalid signup payload', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const input = parsed.data;
  const signupRequestId = input.signupRequestId ?? crypto.randomUUID();
  const normalizedEmail = input.email.trim().toLowerCase();

  console.info(JSON.stringify({
    event: 'signup.submitted',
    signupRequestId,
    communityType: input.communityType,
    slug: input.candidateSlug,
  }));
  const authoritativeSubdomain = await checkSignupSubdomainAvailability(
    input.candidateSlug,
    { excludeSignupRequestId: signupRequestId, signupRequestId },
  );

  if (!authoritativeSubdomain.available) {
    const retryMessage =
      authoritativeSubdomain.reason === 'unknown'
        ? SUBDOMAIN_UNKNOWN_MESSAGE
        : authoritativeSubdomain.message;
    throw new ValidationError(retryMessage, {
      field: 'candidateSlug',
      reason: authoritativeSubdomain.reason,
    });
  }

  const pendingRow = await upsertPendingSignup({
    ...input,
    signupRequestId,
    email: normalizedEmail,
    candidateSlug: authoritativeSubdomain.normalizedSubdomain,
  });

  if (pendingRow === null) {
    // The email already holds a LIVE signup this caller did not start (they did
    // not present its signupRequestId). Answer exactly as a fresh signup would,
    // but with the id we minted for this request, which links to nothing: the
    // existing id is never disclosed, the existing row is untouched, and no
    // auth link or email is generated. The rightful owner continues from the
    // verification email already in their inbox, which carries their id.
    console.info(JSON.stringify({
      event: 'signup.conflict_suppressed',
      signupRequestId,
    }));
    await enforceMinSignupResponseTime(startMs);
    return {
      signupRequestId,
      subdomain: authoritativeSubdomain.normalizedSubdomain,
      verificationRequired: true,
      checkoutEligible: false,
      message: SIGNUP_SUCCESS_MESSAGE,
    };
  }

  // Skip re-sending verification email if one was sent recently (anti-email-bombing).
  const emailRecentlySent =
    pendingRow.verificationEmailSentAt != null
    && Date.now() - pendingRow.verificationEmailSentAt.getTime() < VERIFICATION_EMAIL_COOLDOWN_MS;

  if (emailRecentlySent) {
    await enforceMinSignupResponseTime(startMs);
    return {
      signupRequestId: pendingRow.signupRequestId,
      subdomain: pendingRow.candidateSlug,
      verificationRequired: true,
      checkoutEligible: false,
      message: SIGNUP_SUCCESS_MESSAGE,
    };
  }

  const verificationRedirectUrl = buildVerificationRedirectUrl(
    pendingRow.signupRequestId,
  );
  const authResult = await createOrLinkAuthAccount({
    ...input,
    signupRequestId: pendingRow.signupRequestId,
    email: normalizedEmail,
    candidateSlug: pendingRow.candidateSlug,
  }, verificationRedirectUrl);

  // Persist auth linkage before email delivery so retries remain recoverable
  // even when the downstream mail provider is unavailable.
  try {
    const db = createUnscopedClient();
    await db
      .update(pendingSignups)
      .set({
        authUserId: authResult.authUserId,
        updatedAt: new Date(),
      })
      .where(eq(pendingSignups.id, pendingRow.id));
  } catch (linkError) {
    console.error(JSON.stringify({
      event: 'signup.auth_link_failed',
      signupRequestId: pendingRow.signupRequestId,
      authUserId: authResult.authUserId,
      error: linkError instanceof Error ? linkError.message : String(linkError),
    }));
    throw linkError;
  }

  let messageId: string;
  try {
    messageId = await sendSignupVerificationEmail(
      input.primaryContactName,
      input.communityName,
      normalizedEmail,
      authResult.verificationLink,
      input.planKey,
    );
  } catch (emailError) {
    console.error(JSON.stringify({
      event: 'signup.verification_email_failed',
      signupRequestId: pendingRow.signupRequestId,
      authUserId: authResult.authUserId,
      error: emailError instanceof Error ? emailError.message : String(emailError),
    }));
    throw new SignupEmailDeliveryError();
  }

  const db = createUnscopedClient();
  await db
    .update(pendingSignups)
    .set({
      verificationEmailSentAt: new Date(),
      verificationEmailId: messageId,
      updatedAt: new Date(),
    })
    .where(eq(pendingSignups.id, pendingRow.id));

  console.info(JSON.stringify({
    event: 'signup.completed',
    signupRequestId: pendingRow.signupRequestId,
    slug: pendingRow.candidateSlug,
  }));

  await enforceMinSignupResponseTime(startMs);

  return {
    signupRequestId: pendingRow.signupRequestId,
    subdomain: pendingRow.candidateSlug,
    verificationRequired: true,
    checkoutEligible: false,
    message: SIGNUP_SUCCESS_MESSAGE,
  };
}

// A6: statuses at or past payment. A pending-signup row in one of these is a
// live/committed signup and must never be reset by a re-submission.
export const POST_PAYMENT_SIGNUP_STATUSES = ['payment_completed', 'provisioning', 'completed'] as const;

/**
 * Insert the pending signup, or update the existing row for this email ONLY when
 * the caller owns it (presented its signupRequestId) or it has expired.
 *
 * Returns `null` when the email belongs to a live signup the caller did not
 * start. Before 2026-09-28 the conflict branch updated that row regardless and
 * returned ITS signupRequestId: anyone who knew a prospect's email could learn
 * the id (and overwrite their community name, plan and subdomain), then race
 * the prospect's browser on `GET /auth/provisioning-status`, whose first poller
 * after provisioning receives a login token for the new root manager.
 */
async function upsertPendingSignup(
  input: SignupPersistenceInput,
): Promise<PersistedSignupRow | null> {
  const db = createUnscopedClient();
  const timestamp = new Date();
  const expiresAt = new Date(timestamp.getTime() + SIGNUP_EXPIRY_MS);
  const payload = buildPendingSignupPayload(input);

  try {
    const rows = await db
      .insert(pendingSignups)
      .values({
        signupRequestId: input.signupRequestId,
        authUserId: null,
        primaryContactName: input.primaryContactName,
        email: input.email,
        emailNormalized: input.email,
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
        candidateSlug: input.candidateSlug,
        termsAcceptedAt: timestamp,
        // Stamp the version the user actually saw. Recorded here rather than at
        // provisioning because a signup can sit unverified for days — stamping
        // it later would record whatever version is current THEN against an
        // acceptance that happened earlier, silently backdating a legal record.
        termsVersion: CURRENT_TERMS_VERSION,
        status: 'pending_verification',
        payload,
        updatedAt: timestamp,
        expiresAt,
      })
      // Intentionally does NOT update signupRequestId on conflict — the original
      // ID is preserved so the first-submission identity wins. The caller reads
      // the actual ID from .returning() to stay in sync.
      .onConflictDoUpdate({
        target: pendingSignups.emailNormalized,
        set: {
          // Equal to the stored id when the caller owns the row; a NEW id when
          // an expired row is being reused, so any earlier holder of the old id
          // (it was once disclosed) loses it.
          signupRequestId: input.signupRequestId,
          primaryContactName: input.primaryContactName,
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
          candidateSlug: input.candidateSlug,
          termsAcceptedAt: timestamp,
        // Stamp the version the user actually saw. Recorded here rather than at
        // provisioning because a signup can sit unverified for days — stamping
        // it later would record whatever version is current THEN against an
        // acceptance that happened earlier, silently backdating a legal record.
        termsVersion: CURRENT_TERMS_VERSION,
          status: 'pending_verification',
          payload,
          updatedAt: timestamp,
          expiresAt,
        },
        // A6: never clobber a paid/provisioned/completed signup back to
        // pending_verification if someone re-signs up with an already-used email.
        // And only the caller who holds the row's id may update a live row; an
        // expired row is free for anyone (see the docblock).
        setWhere: and(
          notInArray(pendingSignups.status, [...POST_PAYMENT_SIGNUP_STATUSES]),
          or(
            eq(pendingSignups.signupRequestId, input.signupRequestId),
            lt(pendingSignups.expiresAt, timestamp),
          ),
        ),
      })
      .returning({
        id: pendingSignups.id,
        signupRequestId: pendingSignups.signupRequestId,
        candidateSlug: pendingSignups.candidateSlug,
        verificationEmailSentAt: pendingSignups.verificationEmailSentAt,
      });

    const row = rows[0];
    if (!row) {
      // The setWhere guard refused the update: the email belongs either to a
      // committed signup (tell them to log in, as before) or to a live signup
      // this caller does not own (null: the caller answers generically).
      const [existing] = await db
        .select({ status: pendingSignups.status })
        .from(pendingSignups)
        .where(eq(pendingSignups.emailNormalized, input.email))
        .limit(1);
      if (
        !existing
        || (POST_PAYMENT_SIGNUP_STATUSES as readonly string[]).includes(existing.status)
      ) {
        throw new ValidationError(
          'An account already exists for this email address. Please log in.',
          { field: 'email' },
        );
      }
      return null;
    }
    return row;
  } catch (error) {
    if (isNamedUniqueViolation(error, 'pending_signups_candidate_slug_active_unique')) {
      throw new ValidationError('That subdomain is no longer available.', {
        field: 'candidateSlug',
      });
    }

    if (isNamedUniqueViolation(error, 'pending_signups_signup_request_unique')) {
      // A6: the submitted email differs from the one this signupRequestId was
      // created with (a matching email would have been handled by the
      // email-keyed upsert above). We must NOT reassign the signup to the new
      // email — anyone who obtained a signupRequestId could otherwise hijack it.
      // The client mints a fresh signupRequestId when the user legitimately edits
      // their email, so a real correction becomes a brand-new signup. Here we
      // return a clear, status-aware error and leave the existing row untouched.
      const [existing] = await db
        .select({ status: pendingSignups.status })
        .from(pendingSignups)
        .where(eq(pendingSignups.signupRequestId, input.signupRequestId))
        .limit(1);

      if (
        existing &&
        (POST_PAYMENT_SIGNUP_STATUSES as readonly string[]).includes(existing.status)
      ) {
        throw new ValidationError('This signup is already complete — please log in.');
      }

      throw new ValidationError(
        'This signup was started with a different email address. Please start a new signup to use a different email.',
        { field: 'email' },
      );
    }

    const missingColumn = getUndefinedColumnName(error);
    if (missingColumn && STRUCTURED_ADDRESS_DB_COLUMNS.has(missingColumn)) {
      console.error(JSON.stringify({
        event: 'signup.schema_drift_detected',
        signupRequestId: input.signupRequestId,
        candidateSlug: input.candidateSlug,
        missingColumn,
        requiredMigration: '0145_pending_signups_structured_address',
      }));
    }

    throw error;
  }
}

async function createOrLinkAuthAccount(
  input: SignupPersistenceInput,
  verificationRedirectUrl: string,
): Promise<AuthVerificationLinkResult> {
  const admin = createAdminClient();
  const metadata = {
    full_name: input.primaryContactName,
    signup_request_id: input.signupRequestId,
    community_name: input.communityName,
    community_type: input.communityType,
    signup_plan: input.planKey,
  };

  // Uses generateLink (admin API) instead of supabase.auth.signUp so that
  // Supabase does NOT send its default confirmation email. This lets us
  // control email delivery via our Resend-backed pipeline with branded templates.
  const signupLink = await admin.auth.admin.generateLink({
    type: 'signup',
    email: input.email,
    password: input.password,
    options: {
      redirectTo: verificationRedirectUrl,
      data: metadata,
    },
  });

  // `hashed_token`, NOT `action_link`. The action_link's host is Supabase's
  // project domain; we link at our own route and finish with verifyOtp there.
  const signupToken = signupLink.data?.properties?.hashed_token;
  if (!signupLink.error && signupToken) {
    return {
      authUserId: signupLink.data.user?.id ?? null,
      verificationLink: buildVerificationLink({
        hashedToken: signupToken,
        signupRequestId: input.signupRequestId,
        type: 'signup',
      }),
    };
  }

  if (!isAlreadyRegisteredAuthError(signupLink.error?.message)) {
    throw new Error(signupLink.error?.message ?? 'Failed to create auth signup link');
  }

  const magicLink = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: input.email,
    options: {
      redirectTo: verificationRedirectUrl,
      data: metadata,
    },
  });

  const magicToken = magicLink.data?.properties?.hashed_token;
  if (magicLink.error || !magicToken) {
    throw new Error(magicLink.error?.message ?? 'Failed to generate verification link');
  }

  return {
    authUserId: magicLink.data.user?.id ?? null,
    verificationLink: buildVerificationLink({
      hashedToken: magicToken,
      signupRequestId: input.signupRequestId,
      // The already-registered fallback generates a magiclink, so the token is
      // bound to that type and must be verified as one.
      type: 'magiclink',
    }),
  };
}

/**
 * Send the verification email. The names and plan are optional because
 * email-first signup sends this before it has asked for them.
 */
export async function sendSignupVerificationEmail(
  primaryContactName: string | undefined,
  communityName: string | undefined,
  email: string,
  verificationLink: string,
  planKey: string | undefined,
): Promise<string> {
  const result = await sendEmail({
    to: email,
    subject: 'Verify your email to continue your PropertyPro signup',
    category: 'transactional',
    react: createElement(SignupVerificationEmail, {
      branding: { communityName: 'PropertyPro Florida' },
      primaryContactName,
      communityName,
      verificationLink,
      remainingSteps: planKey ? signupRemainingSteps(planKey) : undefined,
    }),
  });

  return result.id;
}

export type PendingSignupPayloadInput = Pick<
  SignupPersistenceInput,
  | 'signupRequestId'
  | 'primaryContactName'
  | 'email'
  | 'communityName'
  | 'address'
  | 'addressLine1'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'county'
  | 'unitCount'
  | 'communityType'
  | 'planKey'
  | 'candidateSlug'
>;

/** `extra` carries flow markers (email-first stamps `flow: 'email_first'`). */
export function buildPendingSignupPayload(
  input: PendingSignupPayloadInput,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    signupRequestId: input.signupRequestId,
    primaryContactName: input.primaryContactName,
    email: input.email,
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
    candidateSlug: input.candidateSlug,
    termsAccepted: true,
    ...extra,
  };
}

function isAlreadyRegisteredAuthError(message: string | undefined): boolean {
  if (!message) return false;
  return /already.+registered|already.+exists|already.+in use/i.test(message);
}


function getUndefinedColumnName(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const candidate = error as {
    code?: string;
    column?: string;
    message?: string;
  };

  if (candidate.code !== '42703') {
    return null;
  }

  if (candidate.column) {
    return candidate.column;
  }

  const match = candidate.message?.match(/column "([^"]+)"/);
  return match?.[1] ?? null;
}

export async function enforceMinSignupResponseTime(
  startMs: number,
  minMs: number = MIN_SIGNUP_RESPONSE_MS,
): Promise<void> {
  const elapsed = Date.now() - startMs;
  const remaining = minMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

export const _testInternals = {
  MIN_SIGNUP_RESPONSE_MS,
  upsertPendingSignup,
  SIGNUP_EXPIRY_MS,
  VERIFICATION_EMAIL_COOLDOWN_MS,
  enforceMinSignupResponseTime,
  getBaseUrl,
} as const;
