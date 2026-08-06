/**
 * Security headers for all admin HTTP responses — apps/admin adapter.
 *
 * Until 2026-08-05 the admin console served NONE of these: no CSP, no
 * X-Frame-Options, no nosniff, no Referrer-Policy, no Permissions-Policy. The
 * service-role operator console — which can impersonate any user, delete
 * tenants and grant free access — was clickjackable and unrestricted, while
 * `apps/web` set all of them. (HSTS is set separately, in
 * `apps/admin/vercel.json`.)
 *
 * The builders live in `@propertypro/shared/http`; this module supplies the
 * admin app's own values, and `applySecurityHeaders` is the single choke point
 * the middleware routes every response through.
 */
import type { NextResponse } from 'next/server';
import {
  buildCspHeader,
  buildSecurityHeaders,
} from '@propertypro/shared/http';

const PRODUCTION_DOMAIN = 'getpropertypro.com';

/**
 * Origins the admin console is allowed to FRAME.
 *
 * Admin embeds demo previews of the web app in iframes. Two different helpers
 * build those URLs and they disagree in production, so both shapes must be
 * allowlisted:
 * - `app/demo/[id]/preview/page.tsx` builds `https://<demo-slug>.getpropertypro.com`
 *   — a per-demo subdomain, hence the wildcard.
 * - `lib/demo-client-url.ts` builds from `NEXT_PUBLIC_WEB_APP_URL`, which is
 *   the apex in production and a Vercel hostname in preview deployments.
 */
function getFrameSrc(): string[] {
  const sources = [`https://*.${PRODUCTION_DOMAIN}`, `https://${PRODUCTION_DOMAIN}`];

  const webAppUrl = process.env.NEXT_PUBLIC_WEB_APP_URL;
  if (webAppUrl) {
    try {
      const { origin } = new URL(webAppUrl);
      if (!sources.includes(origin)) sources.push(origin);
    } catch {
      // Invalid NEXT_PUBLIC_WEB_APP_URL — ignore rather than emit a broken directive.
    }
  }

  if (process.env.NODE_ENV === 'development') {
    sources.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }

  return sources;
}

/**
 * Apply the admin security header set to a response.
 *
 * CSP is added to page responses only, matching `apps/web`: it is not
 * meaningful on a JSON body, where `X-Content-Type-Options: nosniff` is the
 * control that matters.
 *
 * `X-Frame-Options: DENY` and `frame-ancestors 'none'` are both correct here —
 * unlike the web app, the admin console is never legitimately framed by
 * anything.
 */
export function applySecurityHeaders(
  response: NextResponse | Response,
  options: { isApi: boolean },
): NextResponse | Response {
  const headers = buildSecurityHeaders({ frameOptions: 'DENY' });
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }

  if (!options.isApi) {
    response.headers.set(
      'Content-Security-Policy',
      buildCspHeader({
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        frameAncestors: "'none'",
        frameSrc: getFrameSrc(),
        // BOTH Sentry forms are needed. A CSP host wildcard replaces exactly
        // one label, so `*.ingest.sentry.io` matches `o123.ingest.sentry.io`
        // but NOT the regional `o123.ingest.us.sentry.io` — which is what this
        // project's DSN actually is. Listing only the first would silently
        // block every browser-side Sentry event from the admin console, and
        // the console has no other client error reporting.
        connectSrc: ['https://*.ingest.sentry.io', 'https://*.ingest.us.sentry.io'],
        // `sucrase` (the demo-template compiler) runs server-side only, so the
        // browser never needs 'unsafe-eval' outside dev-mode HMR.
        allowUnsafeEval: process.env.NODE_ENV === 'development',
      }),
    );
  }

  return response;
}
