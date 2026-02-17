// Unsafe DB access is intentional here: signup intent is pre-tenant state.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { communities, pendingSignups } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { sendEmail } from '@propertypro/email';
import { createElement, type ReactElement } from 'react';
import { ValidationError } from '@/lib/api/errors';
import { isReservedSubdomain } from '@/lib/tenant/reserved-subdomains';
import {
  normalizeSignupSubdomain,
  signupSchema,
  type SignupInput,
} from './signup-schema';

const SIGNUP_SUCCESS_MESSAGE =
  'Thanks for signing up. Check your email for a verification link before checkout.';
const MIN_SIGNUP_RESPONSE_MS = 250;

export interface SubdomainAvailabilityResult {
  normalizedSubdomain: string;
  available: boolean;
  reason: 'invalid' | 'reserved' | 'taken' | 'available';
  message: string;
}

export interface SignupSubmitResult {
  signupRequestId: string;
  subdomain: string;
  verificationRequired: true;
  checkoutEligible: false;
  message: string;
}

export async function checkSignupSubdomainAvailability(
  rawSubdomain: string,
  options?: { excludeSignupRequestId?: string },
): Promise<SubdomainAvailabilityResult> {
  const normalizedSubdomain = normalizeSignupSubdomain(rawSubdomain);

  if (!normalizedSubdomain || normalizedSubdomain.length < 3) {
    return {
      normalizedSubdomain,
      available: false,
      reason: 'invalid',
      message: 'Subdomain must be at least 3 characters.',
    };
  }

  if (isReservedSubdomain(normalizedSubdomain)) {
    return {
      normalizedSubdomain,
      available: false,
      reason: 'reserved',
      message: 'That subdomain is reserved and unavailable.',
    };
  }

  const db = createUnscopedClient();
  const [existingCommunityRows, pendingRows] = await Promise.all([
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
      .where(eq(pendingSignups.candidateSlug, normalizedSubdomain))
      .limit(5),
  ]);

  const conflictingPending = pendingRows.some(
    (row) => row.signupRequestId !== options?.excludeSignupRequestId,
  );

  if (existingCommunityRows.length > 0 || conflictingPending) {
    return {
      normalizedSubdomain,
      available: false,
      reason: 'taken',
      message: 'That subdomain is already taken.',
    };
  }

  return {
    normalizedSubdomain,
    available: true,
    reason: 'available',
    message: 'Subdomain is available.',
  };
}

interface PersistedSignupRow {
  id: number;
  signupRequestId: string;
  candidateSlug: string;
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
  const authoritativeSubdomain = await checkSignupSubdomainAvailability(
    input.candidateSlug,
    { excludeSignupRequestId: signupRequestId },
  );

  if (!authoritativeSubdomain.available) {
    throw new ValidationError(authoritativeSubdomain.message, {
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

  const verificationRedirectUrl = buildVerificationRedirectUrl(
    pendingRow.signupRequestId,
  );
  const authResult = await createOrLinkAuthAccount({
    ...input,
    signupRequestId: pendingRow.signupRequestId,
    email: normalizedEmail,
    candidateSlug: pendingRow.candidateSlug,
  }, verificationRedirectUrl);

  const messageId = await sendSignupVerificationEmail(
    input.primaryContactName,
    input.communityName,
    normalizedEmail,
    authResult.verificationLink,
  );

  const db = createUnscopedClient();
  await db
    .update(pendingSignups)
    .set({
      authUserId: authResult.authUserId,
      verificationEmailSentAt: new Date(),
      verificationEmailId: messageId,
      updatedAt: new Date(),
    })
    .where(eq(pendingSignups.id, pendingRow.id));

  await enforceMinSignupResponseTime(startMs);

  return {
    signupRequestId: pendingRow.signupRequestId,
    subdomain: pendingRow.candidateSlug,
    verificationRequired: true,
    checkoutEligible: false,
    message: SIGNUP_SUCCESS_MESSAGE,
  };
}

async function upsertPendingSignup(input: SignupPersistenceInput): Promise<PersistedSignupRow> {
  const db = createUnscopedClient();
  const timestamp = new Date();
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
        county: input.county,
        unitCount: input.unitCount,
        communityType: input.communityType,
        planKey: input.planKey,
        candidateSlug: input.candidateSlug,
        termsAcceptedAt: timestamp,
        status: 'pending_verification',
        payload,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: pendingSignups.emailNormalized,
        set: {
          primaryContactName: input.primaryContactName,
          communityName: input.communityName,
          address: input.address,
          county: input.county,
          unitCount: input.unitCount,
          communityType: input.communityType,
          planKey: input.planKey,
          candidateSlug: input.candidateSlug,
          termsAcceptedAt: timestamp,
          status: 'pending_verification',
          payload,
          updatedAt: timestamp,
        },
      })
      .returning({
        id: pendingSignups.id,
        signupRequestId: pendingSignups.signupRequestId,
        candidateSlug: pendingSignups.candidateSlug,
      });

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to persist pending signup');
    }
    return row;
  } catch (error) {
    if (isUniqueConstraintError(error, 'pending_signups_candidate_slug_unique')) {
      throw new ValidationError('That subdomain is no longer available.', {
        field: 'candidateSlug',
      });
    }

    if (isUniqueConstraintError(error, 'pending_signups_signup_request_unique')) {
      const rows = await db
        .update(pendingSignups)
        .set({
          primaryContactName: input.primaryContactName,
          email: input.email,
          emailNormalized: input.email,
          communityName: input.communityName,
          address: input.address,
          county: input.county,
          unitCount: input.unitCount,
          communityType: input.communityType,
          planKey: input.planKey,
          candidateSlug: input.candidateSlug,
          termsAcceptedAt: timestamp,
          status: 'pending_verification',
          payload,
          updatedAt: timestamp,
        })
        .where(eq(pendingSignups.signupRequestId, input.signupRequestId))
        .returning({
          id: pendingSignups.id,
          signupRequestId: pendingSignups.signupRequestId,
          candidateSlug: pendingSignups.candidateSlug,
        });

      const row = rows[0];
      if (row) {
        return row;
      }
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
    react: buildSignupVerificationEmailElement(
      primaryContactName,
      communityName,
      verificationLink,
    ),
  });

  return result.id;
}

function buildSignupVerificationEmailElement(
  primaryContactName: string,
  communityName: string,
  verificationLink: string,
): ReactElement {
  return createElement(
    'div',
    { style: { fontFamily: 'Arial, sans-serif', color: '#111827', lineHeight: '1.5' } },
    createElement('h1', null, 'Verify your email'),
    createElement('p', null, `Hi ${primaryContactName},`),
    createElement(
      'p',
      null,
      `Thanks for starting signup for ${communityName}. Verify your email to continue to checkout.`,
    ),
    createElement(
      'p',
      null,
      createElement(
        'a',
        {
          href: verificationLink,
          style: {
            display: 'inline-block',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            textDecoration: 'none',
            padding: '10px 16px',
            borderRadius: '6px',
            fontWeight: 600,
          },
        },
        'Verify Email',
      ),
    ),
    createElement(
      'p',
      { style: { fontSize: '14px', color: '#4b5563' } },
      'For security, checkout stays locked until verification is complete.',
    ),
  );
}

function buildPendingSignupPayload(input: SignupPersistenceInput): Record<string, unknown> {
  return {
    signupRequestId: input.signupRequestId,
    primaryContactName: input.primaryContactName,
    email: input.email,
    communityName: input.communityName,
    address: input.address,
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

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
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
    || candidate.message?.includes(constraintName) === true
  );
}

async function enforceMinSignupResponseTime(startMs: number): Promise<void> {
  const elapsed = Date.now() - startMs;
  const remaining = MIN_SIGNUP_RESPONSE_MS - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
