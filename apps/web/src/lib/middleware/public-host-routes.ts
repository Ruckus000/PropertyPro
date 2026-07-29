import { isReservedSubdomain } from '@propertypro/shared';

const PATH_PUBLIC_SUFFIXES = new Set(['transparency', 'notices', 'request-access', 'unavailable']);

const PROTECTED_FIRST_SEGMENTS = new Set([
  'dashboard',
  'help',
  'select-community',
  'settings',
  'documents',
  'maintenance',
  'violations',
  'contracts',
  'audit-trail',
  'announcements',
  'notifications',
  'mobile',
  'pm',
  'communities',
  'onboarding',
  'emergency',
  'payments',
  'assessments',
  'finance',
  'esign',
  'auth',
  'signup',
  'api',
  'login',
  'public-site',
  'public-transparency',
  'dev',
  'pdfjs-test',
  '_next',
]);

/**
 * Path-based public routes like `/sunset-condos/transparency` on the apex host.
 * Returns null when the path is not a deprecated public slug route.
 */
export function parsePathBasedPublicRoute(pathname: string): { slug: string; path: string } | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 2) return null;

  const slug = segments[0];
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  if (isReservedSubdomain(slug)) return null;
  if (PROTECTED_FIRST_SEGMENTS.has(slug)) return null;

  if (segments.length === 1) {
    return { slug, path: '/' };
  }

  const suffix = segments[1];
  if (!suffix || !PATH_PUBLIC_SUFFIXES.has(suffix)) return null;
  return { slug, path: `/${suffix}` };
}

/**
 * First path segments that are infrastructure, not site content — they must
 * keep their normal handling on EVERY host, including a fully-public custom
 * domain.
 *
 * `_next` is only partly covered by the middleware matcher: it excludes
 * `_next/static` and `_next/image`, but RSC navigation and data requests still
 * reach middleware, and rewriting those to the public-site renderer breaks
 * client-side navigation with no error anyone would recognise.
 *
 * `api` matters even on a custom domain that serves nothing but the public
 * site: the rendered page still calls back for contact-form posts and the
 * like, and a rewritten POST would silently render HTML instead.
 */
const INFRASTRUCTURE_FIRST_SEGMENTS = new Set(['api', '_next', 'auth', 'dev', 'pdfjs-test']);

/**
 * True when a path on a fully-public host should be served by the public-site
 * renderer rather than by its normal route.
 *
 * Only meaningful for hosts where the whole origin is public — i.e. a verified
 * custom domain. A community SUBDOMAIN also serves the authenticated app, so
 * this must not be used to decide routing there. See
 * `isCommunityPublicOnlyHost` in middleware.ts for that distinction.
 */
export function isPublicSitePath(pathname: string): boolean {
  const first = pathname.split('/').filter(Boolean)[0];
  if (first === undefined) return true; // '/' itself
  return !INFRASTRUCTURE_FIRST_SEGMENTS.has(first);
}

/**
 * Slugs a community may not use for a public page on its SUBDOMAIN, because the
 * subdomain also serves the authenticated app and the app route wins.
 *
 * Derived from `PROTECTED_FIRST_SEGMENTS` rather than hand-listed, so adding a
 * protected app route cannot silently create a slug that shadows it. Exported
 * for the page-creation validator to reuse — the reserved list and the routing
 * rule must never be two lists that drift.
 */
export function isReservedPublicSlug(slug: string): boolean {
  return PROTECTED_FIRST_SEGMENTS.has(slug) || PATH_PUBLIC_SUFFIXES.has(slug);
}

export function isApexHost(host: string | null, rootDomain: string): boolean {
  if (!host) return true;
  const hostname = host.split(':')[0]?.toLowerCase() ?? '';
  const rootHost = rootDomain.split(':')[0]?.toLowerCase() ?? rootDomain.toLowerCase();

  if (hostname === rootHost || hostname === `www.${rootHost}`) return true;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  return false;
}

export function shouldRewriteHostTransparency(pathname: string): boolean {
  return pathname === '/transparency' || pathname.startsWith('/transparency/');
}
