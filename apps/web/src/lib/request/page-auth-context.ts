import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { SUPPORT_SESSION_COOKIE } from '@propertypro/shared';
import { createServerClient } from '@propertypro/db/supabase/server';
import { UnauthorizedError } from '@/lib/api/errors';
import { parseImpersonationCookie } from '@/lib/support/impersonation';
import {
  normalizeForwardedHeaderValue,
  SUPPORT_SESSION_HEADER,
  USER_EMAIL_HEADER,
  USER_FULL_NAME_HEADER,
  USER_ID_HEADER,
  USER_PHONE_HEADER,
} from './forwarded-headers';

export interface PageAuthenticatedUser {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  user_metadata: {
    full_name?: string;
  };
}

/**
 * The user the request's own credentials prove, read independently of the
 * identity headers middleware forwards.
 *
 * - A support session carries the operator's signed support cookie, not a
 *   Supabase session for the impersonated user, so its subject is the
 *   cookie's verified `sub`. Middleware has already matched that cookie to a
 *   live `support_sessions` row; this repeats the signature and expiry check.
 * - Otherwise it is the verified access token's `sub`. `getClaims()` reads the
 *   request cookies, which already hold any token middleware just refreshed,
 *   and verifies the JWT locally against the cached JWKS (asymmetric signing
 *   keys, so no Auth round trip).
 */
async function resolveSessionSubject(requestHeaders: Headers): Promise<string | null> {
  if (requestHeaders.get(SUPPORT_SESSION_HEADER) === '1') {
    const supportCookie = (await cookies()).get(SUPPORT_SESSION_COOKIE)?.value;
    return (await parseImpersonationCookie(supportCookie))?.sub ?? null;
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getClaims();
  return error ? null : (data?.claims?.sub ?? null);
}

/**
 * Pages verify the session themselves, in addition to middleware: the
 * forwarded identity headers are used only when the request's own credentials
 * name the same user. `cache()` keeps this to one check per request.
 */
const getOptionalPageAuthenticatedUserCached = cache(
  async (): Promise<PageAuthenticatedUser | null> => {
    const requestHeaders = await headers();
    const userId = normalizeForwardedHeaderValue(requestHeaders.get(USER_ID_HEADER));

    if (!userId) {
      return null;
    }

    if ((await resolveSessionSubject(requestHeaders)) !== userId) {
      return null;
    }

    const email = normalizeForwardedHeaderValue(requestHeaders.get(USER_EMAIL_HEADER));
    const fullName = normalizeForwardedHeaderValue(
      requestHeaders.get(USER_FULL_NAME_HEADER),
    );
    const phone = normalizeForwardedHeaderValue(requestHeaders.get(USER_PHONE_HEADER));

    return {
      id: userId,
      email,
      phone,
      fullName,
      user_metadata: fullName ? { full_name: fullName } : {},
    };
  },
);

export async function getOptionalPageAuthenticatedUser(): Promise<PageAuthenticatedUser | null> {
  return getOptionalPageAuthenticatedUserCached();
}

export async function requirePageAuthenticatedUser(): Promise<PageAuthenticatedUser> {
  const user = await getOptionalPageAuthenticatedUserCached();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export async function requirePageAuthenticatedUserId(): Promise<string> {
  const user = await requirePageAuthenticatedUser();
  return user.id;
}
