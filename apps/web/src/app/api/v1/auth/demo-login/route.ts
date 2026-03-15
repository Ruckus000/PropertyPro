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
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import {
  decryptDemoTokenSecret,
  extractDemoIdFromToken,
  validateDemoToken,
} from '@propertypro/shared/server';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { demoInstances } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { buildSecurityHeaders, buildCspHeader } from '@/lib/middleware/security-headers';

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

function createRedirectResponse(target: string | URL, options?: { isPreview?: boolean }): NextResponse {
  const response = NextResponse.redirect(target);
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');

  // Apply security headers directly — middleware headers may not propagate
  // to route-handler-created redirect responses in Next.js App Router.
  const isPreview = options?.isPreview ?? false;
  const secHeaders = buildSecurityHeaders({ isPreview });
  for (const [name, value] of Object.entries(secHeaders)) {
    response.headers.set(name, value);
  }
  // Browsers check frame-ancestors on redirect responses before following them.
  response.headers.set('Content-Security-Policy', buildCspHeader({ isPreview }));

  return response;
}

/**
 * For preview-mode (iframe) requests, return an HTML page that redirects
 * client-side instead of a 307. Browsers block Set-Cookie on 307 redirect
 * responses in cross-origin iframes, preventing the session from being
 * established. A 200 HTML response stores cookies normally, then JS navigates.
 */
function createPreviewRedirectResponse(target: string | URL): NextResponse {
  const targetUrl = typeof target === 'string' ? target : target.toString();
  const escaped = targetUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${escaped}"><script>window.location.replace(${JSON.stringify(targetUrl)})</script></head><body></body></html>`;

  const response = new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Pragma', 'no-cache');

  const secHeaders = buildSecurityHeaders({ isPreview: true });
  for (const [name, value] of Object.entries(secHeaders)) {
    response.headers.set(name, value);
  }
  response.headers.set('Content-Security-Policy', buildCspHeader({ isPreview: true }));

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

  // Allow explicit redirect override (used by admin preview tabs)
  const explicitRedirect = url.searchParams.get('redirect');
  let redirectPath: string;
  if (explicitRedirect) {
    if (
      !explicitRedirect.startsWith('/') ||
      explicitRedirect.startsWith('//') ||
      explicitRedirect.includes('://')
    ) {
      return loginError(trustedBaseUrl, 'invalid_redirect');
    }
    redirectPath = explicitRedirect;
  } else {
    redirectPath =
      payload.role === 'resident'
        ? `/mobile?communityId=${communityId}`
        : `/dashboard?communityId=${communityId}`;
  }

  const redirectToUrl = new URL(redirectPath, trustedBaseUrl);
  // Propagate preview flag so the final page response has relaxed iframe headers
  if (url.searchParams.get('preview') === 'true') {
    redirectToUrl.searchParams.set('preview', 'true');
  }
  const redirectTo = redirectToUrl.toString();

  // 6. Generate a magic link and verify OTP server-side (same pattern as /dev/agent-login)
  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[demo-login] Failed to generate magic link:', linkError?.message);
    return loginError(trustedBaseUrl, 'session_error');
  }

  // Verify OTP server-side to establish session with cookies
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[demo-login] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return loginError(trustedBaseUrl, 'session_error');
  }

  const cookieStore = await cookies();
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> =
    [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          pendingCookies.push(cookie);
          try {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          } catch {
            // May fail in some contexts; replayed onto response below
          }
        }
      },
    },
  });

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });

  if (verifyError) {
    console.error('[demo-login] OTP verification failed:', verifyError.message);
    return loginError(trustedBaseUrl, 'session_error');
  }

  // 7. Redirect with session cookies attached
  const isPreview = url.searchParams.get('preview') === 'true';
  const response = isPreview
    ? createPreviewRedirectResponse(redirectTo)
    : createRedirectResponse(redirectTo);
  for (const cookie of pendingCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
