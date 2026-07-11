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
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  if (isReservedSubdomain(slug)) return null;
  if (PROTECTED_FIRST_SEGMENTS.has(slug)) return null;

  if (segments.length === 1) {
    return { slug, path: '/' };
  }

  const suffix = segments[1];
  if (!PATH_PUBLIC_SUFFIXES.has(suffix)) return null;
  return { slug, path: `/${suffix}` };
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
