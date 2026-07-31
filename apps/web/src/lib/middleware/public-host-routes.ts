import { isReservedSubdomain } from '@propertypro/shared';

export const PATH_PUBLIC_SUFFIXES = new Set([
  'transparency',
  'notices',
  'request-access',
  'unavailable',
]);

/**
 * Routes under `(authenticated)` that require a valid session.
 *
 * The Next.js route group `(authenticated)` is stripped from the URL, so we
 * match on the actual URL paths that live inside that group.
 *
 * **This is the single definition site.** It lives here rather than in
 * `middleware.ts` because `PROTECTED_FIRST_SEGMENTS` (and therefore
 * `isReservedPublicSlug`, which the page-creation validator calls) is derived
 * from it. When the two were separate hand-written lists they drifted: `/welcome`
 * was protected but not reserved, so a public page slugged `welcome` on a
 * community subdomain would have shadowed the authenticated route for every
 * resident. Derivation makes that class of bug unrepresentable.
 *
 * **Every first segment under `apps/web/src/app/(authenticated)/` must appear
 * here.** Before 11b-2 this list only drove `isProtectedPath`, and a missing
 * entry was harmless for any route whose own layout enforced auth. It is now a
 * ROUTING gate as well: `classifySubdomainPath` runs above `isProtectedPath`,
 * so a first segment missing from here is classified `site-page` and rewritten
 * to the public-site renderer, which 404s for a logged-in resident clicking it
 * in the sidebar. `/meetings` and `/arc-requests` (both sidebar nav items) were
 * exactly that; `/account`, `/admin` and `/billing` survived only by accident,
 * because every route under them happens to be ≥2 segments deep.
 * `public-host-routes.test.ts` enumerates the route tree and fails on drift.
 *
 * No prefix should be a substring-prefix of another (e.g. adding '/con'
 * would incorrectly match '/contracts' and '/communities').
 */
export const PROTECTED_PATH_PREFIXES = [
  '/dashboard',
  '/welcome',
  '/help',
  '/meetings',
  '/arc-requests',
  '/account',
  '/admin',
  '/billing',
  '/select-community',
  '/settings',
  '/documents',
  '/maintenance',
  '/violations',
  '/contracts',
  '/audit-trail',
  '/announcements',
  '/notifications',
  '/mobile',
  '/pm',
  '/communities',
  '/onboarding',
  '/emergency',
  '/payments',
  '/assessments',
  '/finance',
  '/esign',
  '/api/v1',
] as const;

/**
 * First segments that are NOT protected-route prefixes but must still be
 * reserved against a public page slug. Kept explicit because nothing in the
 * app's protected-route table implies them:
 *
 * - `auth`, `login`, `signup` — unauthenticated app surfaces. A page at
 *   `/auth` on a subdomain would shadow sign-in itself.
 * - `public-site`, `public-transparency` — the internal rewrite targets. A page
 *   slugged after one of them would collide with the rewrite destination.
 * - `dev`, `pdfjs-test` — dev/test surfaces with their own production gating.
 * - `_next`, `api` — framework infrastructure. (`api` is also derivable from
 *   `/api/v1`; listed here as well so removing that prefix can never un-reserve
 *   it.)
 */
const NON_PROTECTED_RESERVED_FIRST_SEGMENTS = [
  'auth',
  'login',
  'signup',
  'public-site',
  'public-transparency',
  'dev',
  'pdfjs-test',
  '_next',
  'api',
] as const;

const PROTECTED_FIRST_SEGMENTS = new Set<string>([
  ...PROTECTED_PATH_PREFIXES.map((prefix) => prefix.split('/')[1] as string),
  ...NON_PROTECTED_RESERVED_FIRST_SEGMENTS,
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
export const INFRASTRUCTURE_FIRST_SEGMENTS = new Set([
  'api',
  '_next',
  'auth',
  'dev',
  'pdfjs-test',
]);

/**
 * Framework metadata routes (`app/sitemap.ts`, `app/robots.ts`).
 *
 * These must reach their OWN handlers on every host — rewriting them to the
 * public-site renderer is a 404 — but they still need tenant context, because
 * both read `x-community-id` to decide what to emit. So middleware sets the
 * tenant headers and then falls through rather than rewriting.
 *
 * Not part of `INFRASTRUCTURE_FIRST_SEGMENTS`: that set means "leave this path
 * completely alone", and these paths need the headers.
 */
export const METADATA_FIRST_SEGMENTS = new Set(['sitemap.xml', 'robots.txt']);

/**
 * Path-public suffixes that have a host-native renderer of their own.
 *
 * On a host that carries tenant context implicitly (a community subdomain or a
 * verified custom domain) there is no `/[subdomain]/` path segment, so the
 * apex renderer under `app/(public)/[subdomain]/…` cannot serve them. Only
 * `transparency` has a host-native twin today (`app/public-transparency`); the
 * remaining suffixes (`notices`, `request-access`, `unavailable`) have none, so
 * they keep the default public-site handling and render the branded 404.
 */
export const HOST_NATIVE_PUBLIC_SUFFIX_ROUTES: Readonly<Record<string, string>> = {
  transparency: '/public-transparency',
};

/**
 * True when a path on a fully-public host should be served by the public-site
 * renderer rather than by its normal route.
 *
 * Only meaningful for hosts where the whole origin is public — i.e. a verified
 * custom domain. A community SUBDOMAIN also serves the authenticated app, so
 * this must not be used to decide routing there; `classifySubdomainPath` makes
 * that decision instead.
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

/**
 * Shape a public page slug must match. Mirrors `site_pages_slug_shape_check`
 * (and `SITE_PAGE_SLUG_PATTERN` in `@propertypro/shared`). A first segment that
 * cannot be a slug can never be a page, so the app route keeps it.
 */
const PUBLIC_PAGE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * What a community SUBDOMAIN should do with a path.
 *
 * A subdomain serves BOTH the authenticated app and the community's public
 * website, so this is where that fork is decided — deliberately above
 * `isProtectedPath`, whose prefix match would otherwise swallow any slug that
 * merely begins with a protected string (`documents-2024`).
 *
 * - `site-root`  — the public site's home page.
 * - `site-page`  — a one-segment public page slug; rewrite to the renderer.
 *                  Resolved OPTIMISTICALLY: middleware does not read the
 *                  database (it runs on every request), so an unknown slug
 *                  renders the branded public 404 rather than the app's.
 * - `metadata`   — `sitemap.xml` / `robots.txt`: set tenant headers, then let
 *                  the framework's own route run.
 * - `app`        — everything else; the authenticated app route wins.
 *
 * Nested slugs (`/a/b`) are `app`: `site_pages_slug_shape_check` forbids `/` in
 * a slug, so a nested public page does not exist. Do not add nesting here
 * without changing that constraint first.
 */
export type SubdomainPathKind = 'site-root' | 'site-page' | 'metadata' | 'app';

export function classifySubdomainPath(pathname: string): SubdomainPathKind {
  if (pathname === '/') return 'site-root';

  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (first === undefined) return 'site-root';

  if (INFRASTRUCTURE_FIRST_SEGMENTS.has(first)) return 'app';
  if (METADATA_FIRST_SEGMENTS.has(first)) return 'metadata';
  if (isReservedPublicSlug(first)) return 'app';
  if (segments.length > 1) return 'app';
  if (!PUBLIC_PAGE_SLUG_PATTERN.test(first)) return 'app';

  return 'site-page';
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
