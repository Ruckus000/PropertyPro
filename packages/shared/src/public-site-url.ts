/**
 * Canonical web app hostname for tenant URLs, emails, and copy.
 * - Prefer NEXT_PUBLIC_WEB_APP_URL when set (use on admin app where NEXT_PUBLIC_APP_URL is the admin host).
 * - Else NEXT_PUBLIC_APP_URL on the web app only (admin app sets NEXT_PUBLIC_APP_ROLE=admin and skips this).
 * - Fallback apex for prod alignment when unset.
 */

const FALLBACK_WEB_HOSTNAME = 'getpropertypro.com';

function readWebAppUrlRaw(): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const webOnly = process.env.NEXT_PUBLIC_WEB_APP_URL?.trim();
  if (webOnly) return webOnly;
  if (process.env.NEXT_PUBLIC_APP_ROLE === 'admin') {
    return undefined;
  }
  return process.env.NEXT_PUBLIC_APP_URL?.trim();
}

/** Public site apex hostname, e.g. getpropertypro.com */
export function getWebAppHostnameFromEnv(): string {
  const raw = readWebAppUrlRaw();
  if (raw) {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      // fall through
    }
  }
  return FALLBACK_WEB_HOSTNAME;
}

/** Origin for the public web app, e.g. https://getpropertypro.com */
export function getWebAppOriginFromEnv(): string {
  const raw = readWebAppUrlRaw();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // fall through
    }
  }
  return `https://${FALLBACK_WEB_HOSTNAME}`;
}
