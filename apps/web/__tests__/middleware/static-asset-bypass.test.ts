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
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
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
 * ONLY top-level dynamic segment, (b) no static top-level segment sits on an
 * excluded prefix, and (c) nothing that renders for it — its files, the
 * ancestor layouts, and everything they import from apps/web/src — reads
 * request headers or the forwarded identity. Workspace packages are not
 * followed, so a bare import of one that reads headers
 * (`@propertypro/db/supabase/server`) is flagged by name instead.
 */
describe('pages reachable under a matcher-excluded prefix', () => {
  const srcDir = join(__dirname, '../../src');
  const appDir = join(srcDir, 'app');

  const isDir = (path: string) => statSync(path).isDirectory();

  /** First URL segment of every route, looking through (group) folders at any depth. */
  function topLevelSegments(dir = appDir, rel = ''): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      // `_private` folders are not routable. `(group)` and `@slot` folders add
      // no URL segment, so look through them.
      if (!isDir(full) || entry.startsWith('_')) return [];
      const path = rel ? `${rel}/${entry}` : entry;
      return entry.startsWith('(') || entry.startsWith('@') ? topLevelSegments(full, path) : [path];
    });
  }

  function filesUnder(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return isDir(full) ? filesUnder(full) : [full];
    });
  }

  function resolveImport(fromFile: string, spec: string): string | null {
    let base: string;
    if (spec.startsWith('@/')) base = join(srcDir, spec.slice(2));
    else if (spec.startsWith('.')) base = join(dirname(fromFile), spec);
    else return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
      if (existsSync(candidate) && !isDir(candidate)) return candidate;
    }
    return null;
  }

  function transitiveClosure(entries: string[]): string[] {
    const seen = new Set<string>();
    const queue = [...entries];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
        const resolved = resolveImport(file, match[1]!);
        if (resolved) queue.push(resolved);
      }
    }
    return [...seen];
  }

  it('has exactly one top-level dynamic segment, including inside nested route groups', () => {
    expect(topLevelSegments().filter((s) => s.split('/').pop()!.startsWith('['))).toEqual([
      '(public)/[subdomain]',
    ]);
  });

  it('has no static top-level segment on a matcher-excluded prefix', () => {
    const excluded = topLevelSegments().filter((s) => {
      const leaf = s.split('/').pop()!;
      // `_next*` needs no check: `_`-prefixed folders are private (skipped above).
      return leaf === 'pdfjs' || leaf.startsWith('favicon.ico');
    });
    expect(excluded).toEqual([]);
  });

  it('nothing that renders for (public)/[subdomain] reads request headers or the forwarded identity', () => {
    const entries = [
      ...filesUnder(join(appDir, '(public)/[subdomain]')),
      ...['layout.tsx', 'template.tsx', '(public)/layout.tsx', '(public)/template.tsx']
        .map((f) => join(appDir, f))
        .filter(existsSync),
    ];
    const closure = transitiveClosure(entries);
    // Denominator: both sides of the walk must be reached — the redirect
    // helper (from [subdomain]) and a root-layout import (from the layouts).
    expect(closure.some((f) => f.endsWith('lib/tenant/redirect-canonical-host.ts'))).toBe(true);
    expect(closure.some((f) => f.endsWith('components/navigation/navigation-progress.tsx'))).toBe(true);
    const offenders = closure
      .filter((file) =>
        /next\/headers|lib\/request\/|supabase\/server/.test(readFileSync(file, 'utf8')),
      )
      .map((file) => relative(srcDir, file));
    expect(offenders).toEqual([]);
  });
});
