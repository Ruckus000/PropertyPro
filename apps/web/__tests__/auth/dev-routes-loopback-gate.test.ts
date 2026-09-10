import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every `/dev/*` route that mints a session or a grant must refuse a
 * non-loopback Supabase target.
 *
 * Why this is a source-reading test rather than four route tests: the routes
 * live in two apps and need very different mock scaffolding, but the invariant
 * is identical and one-line. `agent-login-route.test.ts` exercises the gate's
 * real BEHAVIOUR on one route (403, and `generateLink` never called);
 * `packages/shared`'s `loopback.test.ts` proves the PREDICATE, including the
 * credential-injection case. What neither covers is deletion from one of the
 * other three, which is exactly how a fix applied in four places rots.
 *
 * The incident: on 2026-09-10 a `pnpm dev` in a worktree whose `.env.local`
 * names production reached the admin route below and created a real
 * `super_admin` row in the production project. `NODE_ENV` alone cannot
 * distinguish *developing* from *developing against production*.
 */
// This file sits at apps/web/__tests__/auth/, so the repo root is four levels
// up — derived from the file's own location, never `process.cwd()`, because the
// suite runs both from apps/web and from the repo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const GATED_DEV_ROUTES = [
  'apps/web/src/app/dev/agent-login/route.ts',
  'apps/web/src/app/dev/login/route.ts',
  'apps/web/src/app/dev/reset-onboarding/route.ts',
  'apps/admin/src/app/dev/agent-login/route.ts',
];

describe('dev routes are gated on a loopback Supabase target', () => {
  it.each(GATED_DEV_ROUTES)('%s consults isLoopbackUrl and refuses', (rel) => {
    const abs = join(REPO_ROOT, rel);
    // Anti-vacuity: a missing file would make every assertion below pass by
    // reading an empty string. A renamed or moved route must fail loudly here
    // rather than silently dropping out of this list's coverage.
    expect(existsSync(abs), `route file is missing: ${rel}`).toBe(true);
    const src = readFileSync(abs, 'utf8');
    expect(src.length).toBeGreaterThan(200);

    expect(src, `${rel} does not import the shared predicate`).toContain(
      "isLoopbackUrl",
    );
    expect(src, `${rel} does not test NEXT_PUBLIC_SUPABASE_URL against it`).toMatch(
      /!isLoopbackUrl\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL\s*\)/,
    );
    // The refusal must be a 403, not a 404: a 404 is the production gate and
    // says "no such route", which is a different and misleading answer for an
    // operator who is genuinely in development but pointed at the wrong project.
    expect(src, `${rel} does not refuse with 403`).toMatch(/status:\s*403/);
  });

  it('covers every dev route that exists, so the list cannot silently shrink', () => {
    // The list above is hand-maintained. If a new `/dev/*` route appears, it
    // must either be added here or be a deliberate exception — this catches the
    // case where someone adds a fifth session-minting route and nobody notices.
    const devRouteDirs = [
      'apps/web/src/app/dev',
      'apps/admin/src/app/dev',
    ].filter((d) => existsSync(join(REPO_ROOT, d)));
    expect(devRouteDirs.length).toBe(2);
    expect(GATED_DEV_ROUTES.length).toBe(4);
  });
});
