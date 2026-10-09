/**
 * Signup helpers shared by the email-first flow (`signup-email-first.ts`) and
 * the public web-address check (`GET /api/v1/auth/signup`).
 */
// Unsafe DB access is intentional here: signup intent is pre-tenant state.
// AUTHZ: Auth flow — pre-tenant state lookup, no community context yet.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, pendingSignups } from '@propertypro/db';
import { and, eq, gt, isNull, notInArray, or } from '@propertypro/db/filters';
import { sendEmail } from '@propertypro/email';
import { createElement } from 'react';
import { SignupVerificationEmail } from '@propertypro/email';
import { isReservedSubdomain } from '@/lib/tenant/reserved-subdomains';
import { normalizeSignupSubdomain, type SignupDetailsInput } from './signup-schema';

export interface SubdomainAvailabilityResult {
  normalizedSubdomain: string;
  available: boolean;
  reason: 'invalid' | 'reserved' | 'taken' | 'available' | 'unknown';
  message: string;
}

const SUBDOMAIN_UNKNOWN_MESSAGE =
  "We couldn't verify this subdomain right now. Please try again in a moment.";

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

// A6: statuses at or past payment. A pending-signup row in one of these is a
// live/committed signup and must never be reset by a re-submission.
export const POST_PAYMENT_SIGNUP_STATUSES = ['payment_completed', 'provisioning', 'completed'] as const;

/**
 * Send the sign-in link that starts an email-first signup. It goes out before
 * any community answers exist, so the email carries no names or plan.
 */
export async function sendSignupVerificationEmail(
  email: string,
  verificationLink: string,
): Promise<string> {
  const result = await sendEmail({
    to: email,
    subject: 'Verify your email to continue your PropertyPro signup',
    category: 'transactional',
    react: createElement(SignupVerificationEmail, {
      branding: { communityName: 'PropertyPro Florida' },
      verificationLink,
    }),
  });

  return result.id;
}

export type PendingSignupPayloadInput = Pick<
  SignupDetailsInput,
  | 'primaryContactName'
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
> & {
  signupRequestId: string;
  email: string;
  candidateSlug: string;
};

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

/** Pad a response to `minMs`, so its timing does not say which branch ran. */
export async function enforceMinSignupResponseTime(startMs: number, minMs: number): Promise<void> {
  const elapsed = Date.now() - startMs;
  const remaining = minMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
