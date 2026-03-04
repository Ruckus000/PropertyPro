/**
 * Demo auto-auth endpoint.
 *
 * Validates an HMAC-signed demo token, looks up the demo instance,
 * creates a Supabase session for the appropriate demo user, and
 * redirects to the relevant portal.
 *
 * Token-authenticated (no session required) — listed in middleware allowlist.
 */
import { NextResponse } from 'next/server';
import {
  decryptDemoTokenSecret,
  extractDemoIdFromToken,
  validateDemoToken,
} from '@propertypro/shared/server';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { demoInstances } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';

/** Redirect to login with an error code. */
function loginError(request: Request, error?: string) {
  const url = error ? `/auth/login?error=${error}` : '/auth/login';
  return NextResponse.redirect(new URL(url, request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return loginError(request);
  }

  // 1. Extract demoId (before signature verification — just to look up the secret)
  const demoId = extractDemoIdFromToken(token);
  if (!demoId) {
    return loginError(request, 'invalid_token');
  }

  // 2. Look up demo instance to get the HMAC secret (service_role access via unscoped client)
  const db = createUnscopedClient();
  const rows = await db
    .select()
    .from(demoInstances)
    .where(eq(demoInstances.id, demoId))
    .limit(1);

  // To prevent demo instance enumeration, use a dummy secret whenever the real
  // secret cannot be resolved (missing row or decrypt failure). Signature checks
  // still run timing-safe and return the same external error.
  const instance = rows[0];
  const encryptedSecret = instance?.authTokenSecret;
  const encryptionKeyHex = process.env.DEMO_TOKEN_ENCRYPTION_KEY_HEX ?? '';
  const decryptedSecret = encryptedSecret
    ? decryptDemoTokenSecret(encryptedSecret, encryptionKeyHex)
    : null;
  const secret = decryptedSecret ?? 'dummy-secret-for-timing-safe-comparison';

  // 3. Validate token with the demo's HMAC secret
  const payload = validateDemoToken(token, secret);
  if (!instance || !decryptedSecret || !payload) {
    return loginError(request, 'invalid_token');
  }

  // 4. Determine which demo user to authenticate as
  const email =
    payload.role === 'resident' ? instance.demoResidentEmail : instance.demoBoardEmail;

  if (!email) {
    return loginError(request, 'demo_user_missing');
  }

  // 5. Determine redirect target before creating the session link
  const communityId = instance.seededCommunityId;
  if (!communityId) {
    return loginError(request, 'demo_setup_incomplete');
  }
  const redirectPath =
    payload.role === 'resident'
      ? `/mobile?communityId=${communityId}`
      : `/dashboard?communityId=${communityId}`;
  const redirectTo = new URL(redirectPath, request.url).toString();

  // 6. Create a Supabase session via admin magic-link API
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    return loginError(request, 'session_error');
  }

  // 7. Redirect to the Supabase action link (sets session cookie, then redirects to app)
  //    Set Referrer-Policy to prevent token leakage from the query string.
  const response = NextResponse.redirect(data.properties.action_link);
  response.headers.set('Referrer-Policy', 'no-referrer');

  return response;
}
