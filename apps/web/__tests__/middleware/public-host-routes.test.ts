/**
 * The two rules 11b-0 rests on.
 *
 * `isPublicSitePath` decides what a fully-public host (a verified custom
 * domain) may hand to the public-site renderer. Getting it wrong does not fail
 * loudly — it breaks client-side navigation or turns an API POST into an HTML
 * response — so the infrastructure exclusions are pinned here.
 *
 * `isReservedPublicSlug` is the other half of the same decision: a community
 * SUBDOMAIN serves the authenticated app, so a page slug that collides with an
 * app route can never win there. The list must be derived from the app's own
 * protected segments, not hand-copied, or the two drift and a page silently
 * shadows a real route.
 */
import { describe, it, expect } from 'vitest';
import {
  classifySubdomainPath,
  isPublicSitePath,
  isReservedPublicSlug,
  METADATA_FIRST_SEGMENTS,
  PATH_PUBLIC_SUFFIXES,
  PROTECTED_PATH_PREFIXES,
} from '@/lib/middleware/public-host-routes';

describe('isPublicSitePath', () => {
  it.each(['/', '/documents', '/meetings', '/about-us', '/a/b/c'])(
    'treats %s as public-site content',
    (path) => {
      expect(isPublicSitePath(path)).toBe(true);
    },
  );

  it.each([
    ['/api/v1/contact', 'an API POST rewritten to HTML fails in a way nobody reads'],
    ['/_next/abc/page.js', 'RSC and data requests break client navigation silently'],
    ['/auth/login', 'authentication must never be shadowed by page content'],
    ['/dev/agent-login', 'dev surfaces keep their own production gating'],
    ['/pdfjs-test', 'browser asset harness'],
  ])('never routes %s to the public site — %s', (path) => {
    expect(isPublicSitePath(path)).toBe(false);
  });

  it('only inspects the FIRST segment, so a page may be named after one', () => {
    // `/api` is infrastructure; a page called "API guide" at /api-guide is not.
    expect(isPublicSitePath('/api-guide')).toBe(true);
    expect(isPublicSitePath('/authority')).toBe(true);
  });
});

describe('isReservedPublicSlug', () => {
  it.each(['documents', 'dashboard', 'settings', 'payments', 'pm', 'api', 'auth'])(
    'reserves %s, because the subdomain app route owns it',
    (slug) => {
      expect(isReservedPublicSlug(slug)).toBe(true);
    },
  );

  it.each([...PATH_PUBLIC_SUFFIXES])('reserves the already-public suffix %s', (slug) => {
    expect(isReservedPublicSlug(slug)).toBe(true);
  });

  it.each(['meetings', 'about', 'amenities', 'board', 'contact-us'])(
    'leaves %s available for a page',
    (slug) => {
      expect(isReservedPublicSlug(slug)).toBe(false);
    },
  );

  // ── The derivation invariant [11b-2 / S1] ───────────────────────────────
  // This replaces a hand-copied 29-entry array. The array was itself the bug:
  // it could only ever agree with `PROTECTED_PATH_PREFIXES` by someone
  // remembering to update both, and by the time 11b-2 started it already
  // didn't (`/welcome`). Assert the relationship, never the contents.
  it('reserves the first segment of EVERY protected path prefix', () => {
    for (const prefix of PROTECTED_PATH_PREFIXES) {
      const first = prefix.split('/')[1] as string;
      expect(
        isReservedPublicSlug(first),
        `${prefix} is protected, so "${first}" must be reserved`,
      ).toBe(true);
    }
    // Guard the guard: an empty/degenerate prefix list would make the loop
    // above vacuously true.
    expect(PROTECTED_PATH_PREFIXES.length).toBeGreaterThan(20);
  });

  it('reserves "welcome" — the divergence that motivated the derivation', () => {
    // `/welcome` is a protected app route. Before S1 it was absent from the
    // reserved list, so a public page slugged `welcome` would have shadowed
    // the authenticated route for every resident on that subdomain.
    expect(isReservedPublicSlug('welcome')).toBe(true);
  });

  it('reserves everything that was reserved before, and nothing became free', () => {
    // The full pre-11b-2 set, pinned. Widening is allowed (that is what S1
    // does); narrowing is a routing regression and must fail here.
    const previouslyReserved = [
      'dashboard', 'help', 'select-community', 'settings', 'documents',
      'maintenance', 'violations', 'contracts', 'audit-trail', 'announcements',
      'notifications', 'mobile', 'pm', 'communities', 'onboarding', 'emergency',
      'payments', 'assessments', 'finance', 'esign', 'auth', 'signup', 'api',
      'login', 'public-site', 'public-transparency', 'dev', 'pdfjs-test', '_next',
      'transparency', 'notices', 'request-access', 'unavailable',
    ];
    for (const slug of previouslyReserved) {
      expect(isReservedPublicSlug(slug), `${slug} must stay reserved`).toBe(true);
    }
  });

  it('reserves the auth-only segments that no protected prefix implies', () => {
    // These are NOT derivable from PROTECTED_PATH_PREFIXES — they are the
    // explicit union in `NON_PROTECTED_RESERVED_FIRST_SEGMENTS`. Losing them
    // would let a page shadow sign-in or an internal rewrite target.
    for (const slug of ['auth', 'login', 'signup', 'public-site', 'public-transparency']) {
      expect(isReservedPublicSlug(slug), `${slug} must be reserved`).toBe(true);
    }
  });
});

describe('classifySubdomainPath', () => {
  it('treats the root as the public site home', () => {
    expect(classifySubdomainPath('/')).toBe('site-root');
  });

  it('treats a one-segment non-reserved slug as a public page', () => {
    expect(classifySubdomainPath('/about')).toBe('site-page');
    expect(classifySubdomainPath('/contact-us')).toBe('site-page');
    // Prefix-shadowing is exactly what putting this above `isProtectedPath`
    // prevents: `/documents-2024` starts with `/documents` but is a page.
    expect(classifySubdomainPath('/documents-2024')).toBe('site-page');
  });

  it.each(['/dashboard', '/documents', '/welcome', '/settings', '/auth/login'])(
    'leaves %s to the app route',
    (path) => {
      expect(classifySubdomainPath(path)).toBe('app');
    },
  );

  it.each(['/api/v1/documents', '/_next/static/chunk.js', '/dev/agent-login'])(
    'leaves infrastructure path %s alone',
    (path) => {
      expect(classifySubdomainPath(path)).toBe('app');
    },
  );

  it.each([...METADATA_FIRST_SEGMENTS])('classifies /%s as metadata', (segment) => {
    expect(classifySubdomainPath(`/${segment}`)).toBe('metadata');
  });

  it('refuses nested slugs — site_pages_slug_shape_check forbids "/"', () => {
    expect(classifySubdomainPath('/a/b')).toBe('app');
    expect(classifySubdomainPath('/about/team')).toBe('app');
  });

  it('refuses a first segment that could never be a slug', () => {
    expect(classifySubdomainPath('/About-Us')).toBe('app');
    expect(classifySubdomainPath('/-leading-hyphen')).toBe('app');
    expect(classifySubdomainPath('/manifest.webmanifest')).toBe('app');
  });
});
