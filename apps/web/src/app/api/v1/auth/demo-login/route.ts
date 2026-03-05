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

const PRODUCTION_DOMAIN = 'propertyprofl.com';

function isTrustedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === PRODUCTION_DOMAIN ||
    normalized.endsWith(`.${PRODUCTION_DOMAIN}`)
  );
}

function originFromTrustedUrl(urlString: string): string | null {
  try {
    const parsed = new URL(urlString);
    return isTrustedHostname(parsed.hostname) ? parsed.origin : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a trusted base URL for all redirects emitted by this route.
 * Avoid using untrusted Host-header-derived values.
 */
function getTrustedBaseUrl(request: Request): string | null {
  const requestOrigin = originFromTrustedUrl(request.url);
  if (requestOrigin) return requestOrigin;

  const appUrlOrigin = process.env.NEXT_PUBLIC_APP_URL
    ? originFromTrustedUrl(process.env.NEXT_PUBLIC_APP_URL)
    : null;
  if (appUrlOrigin) return appUrlOrigin;

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    const normalized = vercelUrl.startsWith('http://') || vercelUrl.startsWith('https://')
      ? vercelUrl
      : `https://${vercelUrl}`;
    const vercelOrigin = originFromTrustedUrl(normalized);
    if (vercelOrigin) return vercelOrigin;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  return null;
}

function createRedirectResponse(target: string | URL): NextResponse {
  const response = NextResponse.redirect(target);
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');
  return response;
}

/** Redirect to login with an error code. */
function loginError(baseUrl: string, error?: string): NextResponse {
  const url = error ? `/auth/login?error=${error}` : '/auth/login';
  return createRedirectResponse(new URL(url, baseUrl));
}

export async function GET(request: Request) {
  const trustedBaseUrl = getTrustedBaseUrl(request);
  if (!trustedBaseUrl) {
    console.error('[demo-login] No trusted base URL available for redirect construction.');
    const response = NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Pragma', 'no-cache');
    return response;
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return loginError(trustedBaseUrl);
  }

  // 1. Extract demoId (before signature verification — just to look up the secret)
  const demoId = extractDemoIdFromToken(token);
  if (!demoId) {
    return loginError(trustedBaseUrl, 'invalid_token');
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
  const isEncryptedSecret = encryptedSecret?.startsWith('enc:v1:') ?? false;
  const encryptionKeyHex = process.env.DEMO_TOKEN_ENCRYPTION_KEY_HEX;

  if (isEncryptedSecret && !encryptionKeyHex) {
    console.error('[demo-login] DEMO_TOKEN_ENCRYPTION_KEY_HEX is required for encrypted demo secrets.');
    return loginError(trustedBaseUrl, 'session_error');
  }

  const decryptedSecret = encryptedSecret
    ? decryptDemoTokenSecret(encryptedSecret, encryptionKeyHex ?? '')
    : null;
  const secret = decryptedSecret ?? 'dummy-secret-for-timing-safe-comparison';

  // 3. Validate token with the demo's HMAC secret
  const payload = validateDemoToken(token, secret);
  if (!instance || !decryptedSecret || !payload) {
    return loginError(trustedBaseUrl, 'invalid_token');
  }

  // 4. Determine which demo user to authenticate as
  const email =
    payload.role === 'resident' ? instance.demoResidentEmail : instance.demoBoardEmail;

  if (!email) {
    return loginError(trustedBaseUrl, 'demo_user_missing');
  }

  // 5. Determine redirect target before creating the session link
  const communityId = instance.seededCommunityId;
  if (!communityId) {
    return loginError(trustedBaseUrl, 'demo_setup_incomplete');
  }
  const redirectPath =
    payload.role === 'resident'
      ? `/mobile?communityId=${communityId}`
      : `/dashboard?communityId=${communityId}`;
  const redirectToUrl = new URL(redirectPath, trustedBaseUrl);
  // Propagate preview flag so the final page response has relaxed iframe headers
  if (url.searchParams.get('preview') === 'true') {
    redirectToUrl.searchParams.set('preview', 'true');
  }
  const redirectTo = redirectToUrl.toString();

  // 6. Create a Supabase session via admin magic-link API
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    return loginError(trustedBaseUrl, 'session_error');
  }

  // 7. Redirect to the Supabase action link (sets session cookie, then redirects to app)
  return createRedirectResponse(data.properties.action_link);
}
