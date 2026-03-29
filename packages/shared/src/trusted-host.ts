/**
 * Hostname allowlisting for CORS, demo-login redirects, and related trust checks.
 * Primary hostname comes from NEXT_PUBLIC_APP_URL; when unset, the canonical
 * production root getpropertypro.com and its subdomains remain trusted.
 */

const CANONICAL_PRODUCTION_ROOT = 'getpropertypro.com';

/**
 * Parses the hostname from a configured app URL (e.g. https://getpropertypro.com → getpropertypro.com).
 */
export function parseHostnameFromAppUrl(appUrl: string | undefined | null): string | null {
  if (!appUrl?.trim()) return null;
  try {
    const host = new URL(appUrl.trim()).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Returns true when the hostname is trusted for production-style requests.
 *
 * - localhost and 127.0.0.1
 * - `primaryHostname` and any of its subdomains (from NEXT_PUBLIC_APP_URL)
 * - Canonical: getpropertypro.com and *.getpropertypro.com (when tests omit env)
 */
export function isTrustedHostname(
  hostname: string,
  options?: { primaryHostname?: string | null },
): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return true;

  const primary = options?.primaryHostname?.trim().toLowerCase();
  if (primary && (h === primary || h.endsWith(`.${primary}`))) return true;

  if (h === CANONICAL_PRODUCTION_ROOT || h.endsWith(`.${CANONICAL_PRODUCTION_ROOT}`)) return true;

  return false;
}

/**
 * Convenience: trust check using NEXT_PUBLIC_APP_URL from the environment.
 */
export function isTrustedHostnameFromEnv(hostname: string): boolean {
  const primary = parseHostnameFromAppUrl(
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_APP_URL : undefined,
  );
  return isTrustedHostname(hostname, { primaryHostname: primary });
}
