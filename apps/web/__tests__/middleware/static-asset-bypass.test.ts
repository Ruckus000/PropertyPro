/**
 * The middleware matcher must not let a PAGE skip header sanitisation.
 *
 * The matcher used to exclude every path ending in an image/.mjs extension.
 * Next still routes `/help/<category>/<slug>.png` (or any dynamic page segment
 * that ends in `.png`) to a PAGE, and middleware is the only place inbound
 * x-user-* / x-community-id headers are stripped; `page-auth-context.ts`
 * trusts them. So a cookie-less request with a forged `x-user-id` rendered
 * authenticated pages as that user.
 *
 * Now the matcher excludes only prefixes no page can live under, and
 * extension paths take a fast path that strips forwarded auth headers.
 * The matcher is checked with Next's OWN compiler (`getMiddlewareMatchers`),
 * not a hand-copied regex, so this fails if the literal regresses.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import * as nextStaticInfo from 'next/dist/build/analysis/get-page-static-info';

// Exported at runtime but absent from Next's .d.ts; fail loudly if it moves
// rather than letting the matcher cases pass against nothing.
const { getMiddlewareMatchers } = nextStaticInfo as unknown as {
  getMiddlewareMatchers: (matcher: unknown, config: unknown) => Array<{ regexp: string }>;
};
if (typeof getMiddlewareMatchers !== 'function') {
  throw new Error('next/dist/build/analysis/get-page-static-info no longer exports getMiddlewareMatchers');
}

const { createMiddlewareClientMock } = vi.hoisted(() => ({
  createMiddlewareClientMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/middleware', () => ({
  createMiddlewareClient: createMiddlewareClientMock,
}));

import { config, middleware } from '../../src/middleware';

function middlewareRuns(pathname: string): boolean {
  const matchers = getMiddlewareMatchers(config.matcher, {});
  return matchers.some((m) => new RegExp(m.regexp).test(pathname));
}

const FORGED = {
  'x-user-id': '00000000-0000-4000-8000-000000000001',
  'x-user-email': 'victim@example.com',
  'x-user-full-name': 'Victim',
  'x-community-id': '2',
  'x-support-session': '1',
  'x-preview': '1',
  'x-tenant-slug': 'sunset-condos',
  'x-tenant-source': 'subdomain',
};

beforeEach(() => {
  vi.clearAllMocks();
  createMiddlewareClientMock.mockResolvedValue({
    supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } },
    response: NextResponse.next(),
    user: null,
    authChecked: false,
  });
});

describe('middleware matcher (compiled by Next)', () => {
  it.each([
    '/help/billing/fake.png',
    '/communities/2/board/forum/x.png',
    '/dashboard/x.svg',
    '/api/v1/documents/1.png',
  ])('RUNS middleware for %s (a page or API path must never skip sanitisation)', (path) => {
    expect(middlewareRuns(path)).toBe(true);
  });

  it('RUNS middleware for a real public asset (it takes the fast path instead)', () => {
    expect(middlewareRuns('/marketing/v1/who-hoa-800.webp')).toBe(true);
  });

  it.each([
    '/_next/static/chunks/main.js',
    '/_next/image',
    '/favicon.ico',
    '/pdfjs/pdf.mjs',
    '/pdfjs/pdf.worker.mjs',
  ])('skips middleware for %s (a prefix no page lives under)', (path) => {
    expect(middlewareRuns(path)).toBe(false);
  });
});

describe('static-asset fast path', () => {
  it('strips forged identity headers on an extension path and does no session work', async () => {
    const res = await middleware(
      new NextRequest('http://localhost:3000/help/billing/fake.png', { headers: FORGED }),
    );

    for (const name of Object.keys(FORGED)) {
      expect(res.headers.get(`x-middleware-request-${name}`)).toBeNull();
    }
    // Forwarded request headers are overridden (the stripped set is applied),
    // and the encoding asserted null above is still the one Next emits.
    expect(res.headers.get('x-middleware-override-headers')).not.toBeNull();
    expect(res.headers.get('x-middleware-request-x-request-id')).toBeTruthy();
    // A page reached this way still gets the main path's security headers.
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('location')).toBeNull();
    expect(createMiddlewareClientMock).not.toHaveBeenCalled();
  });

  it('does NOT fast-path an /api/ path ending in an image extension (full middleware runs)', async () => {
    await middleware(
      new NextRequest('http://localhost:3000/api/v1/documents/1.png', { headers: FORGED }),
    );

    expect(createMiddlewareClientMock).toHaveBeenCalled();
  });

  it('passes a real public asset through unchanged (no redirect, no auth)', async () => {
    const res = await middleware(
      new NextRequest('http://localhost:3000/marketing/v1/who-hoa-800.webp'),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(createMiddlewareClientMock).not.toHaveBeenCalled();
  });
});

/**
 * The matcher's excluded prefixes are not page-free: the top-level dynamic
 * segment `(public)/[subdomain]` makes `/pdfjs/transparency` resolve to a page
 * that middleware never sees. That is safe only while (a) `[subdomain]` is the
 * ONLY top-level dynamic segment and (b) nothing under it reads request
 * headers or the forwarded identity.
 */
describe('pages reachable under a matcher-excluded prefix', () => {
  const appDir = join(__dirname, '../../src/app');

  function topLevelDynamicSegments(): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(appDir)) {
      const full = join(appDir, entry);
      if (!statSync(full).isDirectory()) continue;
      if (entry.startsWith('[')) out.push(entry);
      if (entry.startsWith('(')) {
        for (const child of readdirSync(full)) {
          if (child.startsWith('[') && statSync(join(full, child)).isDirectory()) {
            out.push(`${entry}/${child}`);
          }
        }
      }
    }
    return out.sort();
  }

  function filesUnder(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? filesUnder(full) : [full];
    });
  }

  it('has exactly one top-level dynamic segment', () => {
    expect(topLevelDynamicSegments()).toEqual(['(public)/[subdomain]']);
  });

  it('no file under (public)/[subdomain] reads request headers or the forwarded identity', () => {
    // Plus the one helper those pages share (all of them only redirect).
    const files = [
      ...filesUnder(join(appDir, '(public)/[subdomain]')),
      join(appDir, '../lib/tenant/redirect-canonical-host.ts'),
    ];
    expect(files.length).toBeGreaterThan(1);
    const offenders = files.filter((file) =>
      /next\/headers|lib\/request\//.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
