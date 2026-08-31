// Unsafe DB access is intentional here: signup intent is pre-tenant state.
// AUTHZ: Auth flow — pre-tenant state lookup, no community context yet.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, pendingSignups } from '@propertypro/db';
import { and, eq, gt, isNull, notInArray, or } from '@propertypro/db/filters';
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

const SIGNUP_SUCCESS_MESSAGE =
  'Thanks for signing up. Check your email for a verification link before checkout.';
const MIN_SIGNUP_RESPONSE_MS = 250;
const SIGNUP_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
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
const POST_PAYMENT_SIGNUP_STATUSES = ['payment_completed', 'provisioning', 'completed'] as const;

async function upsertPendingSignup(input: SignupPersistenceInput): Promise<PersistedSignupRow> {
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
        setWhere: notInArray(pendingSignups.status, [...POST_PAYMENT_SIGNUP_STATUSES]),
      })
      .returning({
        id: pendingSignups.id,
        signupRequestId: pendingSignups.signupRequestId,
        candidateSlug: pendingSignups.candidateSlug,
        verificationEmailSentAt: pendingSignups.verificationEmailSentAt,
      });

    const row = rows[0];
    if (!row) {
      // With the setWhere guard above, an empty result means the email already
      // belongs to a committed signup — surface an actionable message.
      throw new ValidationError(
        'An account already exists for this email address. Please log in.',
        { field: 'email' },
      );
    }
    return row;
  } catch (error) {
    if (isUniqueConstraintError(error, 'pending_signups_candidate_slug_active_unique')) {
      throw new ValidationError('That subdomain is no longer available.', {
        field: 'candidateSlug',
      });
    }

    if (isUniqueConstraintError(error, 'pending_signups_signup_request_unique')) {
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

  const actionLink = signupLink.data?.properties?.action_link;
  if (!signupLink.error && actionLink) {
    return {
      authUserId: signupLink.data.user?.id ?? null,
      verificationLink: actionLink,
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

  const magicActionLink = magicLink.data?.properties?.action_link;
  if (magicLink.error || !magicActionLink) {
    throw new Error(magicLink.error?.message ?? 'Failed to generate verification link');
  }

  return {
    authUserId: magicLink.data.user?.id ?? null,
    verificationLink: magicActionLink,
  };
}

async function sendSignupVerificationEmail(
  primaryContactName: string,
  communityName: string,
  email: string,
  verificationLink: string,
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
    }),
  });

  return result.id;
}

function buildPendingSignupPayload(input: SignupPersistenceInput): Record<string, unknown> {
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
  };
}

function buildVerificationRedirectUrl(signupRequestId: string): string {
  const baseUrl = getBaseUrl();
  const url = new URL('/signup', baseUrl);
  url.searchParams.set('signupRequestId', signupRequestId);
  url.searchParams.set('verified', '1');
  return url.toString();
}

function isAlreadyRegisteredAuthError(message: string | undefined): boolean {
  if (!message) return false;
  return /already.+registered|already.+exists|already.+in use/i.test(message);
}

function isUniqueConstraintError(error: unknown, constraintName: string): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: string;
    constraint?: string;
    constraint_name?: string;
    message?: string;
  };

  if (candidate.code !== '23505') {
    return false;
  }

  return (
    candidate.constraint === constraintName
    || candidate.constraint_name === constraintName
  );
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

async function enforceMinSignupResponseTime(startMs: number): Promise<void> {
  const elapsed = Date.now() - startMs;
  const remaining = MIN_SIGNUP_RESPONSE_MS - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

export const _testInternals = {
  MIN_SIGNUP_RESPONSE_MS,
  SIGNUP_EXPIRY_MS,
  VERIFICATION_EMAIL_COOLDOWN_MS,
  enforceMinSignupResponseTime,
  getBaseUrl,
} as const;
