/**
 * Single source of truth for custom-domain host validation, shared by the
 * admin display helpers and the PM-facing web routes. Pure functions — no env,
 * no IO — so they are trivially testable on both edge and node runtimes.
 */

const HOSTNAME_LABEL = /^[a-z0-9-]+$/i;

export function isValidHostname(hostname: string): boolean {
  if (hostname.length < 3 || hostname.length > 253) return false;
  if (!hostname.includes('.')) return false;
  return hostname.split('.').every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      HOSTNAME_LABEL.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-'),
  );
}

/** Normalize raw input to a bare lowercase hostname, or null if unusable. */
export function sanitizeCustomDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  const withoutProtocol = normalized.replace(/^https?:\/\//, '');
  const hostname = withoutProtocol.split(/[/?#]/, 1)[0]?.split(':', 1)[0]?.trim() ?? '';
  if (!hostname || !isValidHostname(hostname)) return null;
  return hostname;
}

/** Bare-host form of a root domain that may carry a dev port (localhost:3000). */
function rootHost(rootDomain: string): string {
  return rootDomain.split(':')[0]?.trim().toLowerCase() ?? rootDomain.toLowerCase();
}

/** True when `host` is the platform root domain or one of its subdomains. */
export function isOwnDomain(host: string, rootDomain: string): boolean {
  const h = host.split(':')[0]?.trim().toLowerCase() ?? '';
  const root = rootHost(rootDomain);
  return h === root || h.endsWith(`.${root}`);
}

export class CustomDomainNotAllowedError extends Error {}

/**
 * Validate a candidate custom domain. Returns the sanitized host, or throws
 * `CustomDomainNotAllowedError` with a message safe to surface to the PM.
 */
export function assertCustomDomainAllowed(raw: string | null | undefined, rootDomain: string): string {
  const host = sanitizeCustomDomain(raw);
  if (!host) {
    throw new CustomDomainNotAllowedError('That doesn\'t look like a valid domain (invalid host). Use a host like www.yourcommunity.com.');
  }
  if (isOwnDomain(host, rootDomain)) {
    throw new CustomDomainNotAllowedError('That domain is reserved by PropertyPro and can\'t be used as a custom domain.');
  }
  return host;
}
