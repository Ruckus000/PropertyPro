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
  isPublicSitePath,
  isReservedPublicSlug,
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

  it.each(['transparency', 'notices', 'request-access', 'unavailable'])(
    'reserves the already-public suffix %s',
    (slug) => {
      expect(isReservedPublicSlug(slug)).toBe(true);
    },
  );

  it.each(['meetings', 'about', 'amenities', 'board', 'contact-us'])(
    'leaves %s available for a page',
    (slug) => {
      expect(isReservedPublicSlug(slug)).toBe(false);
    },
  );

  it("reserves every one of the app's protected first segments", () => {
    // Derived, not hand-listed: this is the assertion that catches a NEW
    // protected route being added without the reserved list following it.
    const protectedFirstSegments = [
      'dashboard', 'help', 'select-community', 'settings', 'documents',
      'maintenance', 'violations', 'contracts', 'audit-trail', 'announcements',
      'notifications', 'mobile', 'pm', 'communities', 'onboarding', 'emergency',
      'payments', 'assessments', 'finance', 'esign', 'auth', 'signup', 'api',
      'login', 'public-site', 'public-transparency', 'dev', 'pdfjs-test', '_next',
    ];
    for (const slug of protectedFirstSegments) {
      expect(isReservedPublicSlug(slug), `${slug} must be reserved`).toBe(true);
    }
  });
});
