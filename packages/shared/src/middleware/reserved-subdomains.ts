/**
 * Subdomains that can never be claimed as a community slug.
 *
 * `*.getpropertypro.com` is a wildcard domain, so EVERY label reaches the app
 * and is read as a tenant slug. Whatever is not reserved here is claimable by
 * anyone who completes a signup — and the resulting hostname is served by us,
 * over our own TLS certificate, on our own registrable domain. That is the
 * property that makes an unreserved name a phishing surface rather than a
 * cosmetic annoyance: a browser shows no difference between
 * `secure.getpropertypro.com` run by a tenant and one run by us.
 *
 * `checkSignupSubdomainAvailability` (`apps/web/src/lib/auth/signup.ts`) is the
 * enforcement point and runs on the WRITE path, not just the availability probe,
 * so this list is the whole gate.
 *
 * ## Widen this list early or not at all
 *
 * Reserving a name is free only while nobody holds it. Once a community owns a
 * slug, adding it here does not just block new signups — it strands a live
 * tenant whose site, links and logins all carry that hostname. Verified against
 * production on 2026-09-08: none of the names below was held by any community or
 * pending signup, which is why they could all be added at once.
 */
export const RESERVED_SUBDOMAINS = [
  // ---- App surfaces we route ourselves -------------------------------------
  'admin',
  'api',
  'www',
  'mobile',
  'pm',
  'app',
  'dashboard',
  'login',
  'signup',
  'legal',

  // ---- Mail, and mail-client auto-configuration ----------------------------
  //
  // `autodiscover` and `autoconfig` are the sharp ones, not `mail`. Outlook and
  // Thunderbird fetch `https://autodiscover.<domain>/autodiscover.xml` (and
  // `autoconfig.<domain>`) automatically when someone sets up an account at our
  // domain, and they trust what comes back. A tenant serving those hostnames
  // over our certificate could hand mail clients a server of their choosing.
  // The rest are conventional mail-infrastructure labels, reserved so that
  // pointing any of them at a mail provider later is a DNS change rather than a
  // negotiation with whoever registered it.
  'mail',
  'webmail',
  'mx',
  'smtp',
  'imap',
  'pop',
  'autodiscover',
  'autoconfig',

  // ---- Names that borrow our credibility -----------------------------------
  //
  // These read as first-party wherever they appear — in an email, a support
  // message, a browser address bar. A tenant-controlled `verify.` or `billing.`
  // is a credential-harvesting page on our own domain with a valid padlock, and
  // no amount of user vigilance distinguishes it from us.
  'secure',
  'account',
  'accounts',
  'billing',
  'payments',
  'verify',
  'auth',
  'sso',
  'support',
  'help',

  // ---- Infrastructure and surfaces we may want later -----------------------
  //
  // Nothing is served from these today. They are reserved because doing it now
  // costs one line each, and doing it after someone has claimed one costs a
  // migration for a live tenant.
  'status',
  'docs',
  'cdn',
  'static',
  'assets',
  'demo',
  'staging',
  'dev',
  'test',
  'preview',
] as const;

const RESERVED_SUBDOMAIN_SET = new Set<string>(RESERVED_SUBDOMAINS);

export function isReservedSubdomain(value: string): boolean {
  return RESERVED_SUBDOMAIN_SET.has(value.toLowerCase());
}
