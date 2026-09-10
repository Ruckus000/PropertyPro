import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every `/dev/*` route must refuse unless BOTH backends are loopback — the
 * Supabase project (`NEXT_PUBLIC_SUPABASE_URL`) and the database
 * (`DATABASE_URL`). Requiring both in every route is deliberate; the reasoning
 * lives on `nonLocalBackendReason` in `packages/shared/src/env/loopback.ts`.
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

describe('dev routes are gated on loopback Supabase AND database targets', () => {
  it.each(GATED_DEV_ROUTES)('%s consults nonLocalBackendReason and refuses', (rel) => {
    const abs = join(REPO_ROOT, rel);
    // Anti-vacuity: a missing file would make every assertion below pass by
    // reading an empty string. A renamed or moved route must fail loudly here
    // rather than silently dropping out of this list's coverage.
    expect(existsSync(abs), `route file is missing: ${rel}`).toBe(true);
    const src = readFileSync(abs, 'utf8');
    expect(src.length).toBeGreaterThan(200);

    expect(src, `${rel} does not import the shared predicate`).toContain(
      'nonLocalBackendReason',
    );
    // The whole env object, not a hand-picked variable. `nonLocalBackendReason`
    // requires loopback on BOTH `NEXT_PUBLIC_SUPABASE_URL` and `DATABASE_URL`,
    // so passing `process.env` is what makes the rule uniform — and a route that
    // narrowed it back to one variable (the original defect: `reset-onboarding`
    // gated on Supabase while writing over `DATABASE_URL`) fails here.
    expect(src, `${rel} does not pass process.env to the shared predicate`).toMatch(
      /nonLocalBackendReason\(\s*process\.env\s*\)/,
    );
    // The refusal must be a 403, not a 404: a 404 is the production gate and
    // says "no such route", which is a different and misleading answer for an
    // operator who is genuinely in development but pointed at the wrong project.
    expect(src, `${rel} does not refuse with 403`).toMatch(/status:\s*403/);
  });

  /**
   * The list above is hand-maintained, so it must be *forced* to grow. The
   * version of this case that shipped first asserted `devRouteDirs.length === 2`
   * and `GATED_DEV_ROUTES.length === 4` — both constants, so a fifth
   * session-minting route could not fail it, and correctly adding one to the list
   * BROKE it (5 !== 4), training the next author to edit the assertion instead of
   * thinking. Its docblock claimed it caught exactly the case it could not see.
   *
   * This version enumerates the files on disk instead. Adding any `route.ts`
   * under either `app/dev` now fails until it is listed above, which is also the
   * moment to decide whether it needs the gate.
   */
  it('discovers every dev route on disk and requires it to be listed', () => {
    const DEV_ROUTE_DIRS = ['apps/web/src/app/dev', 'apps/admin/src/app/dev'];

    function collectRouteFiles(relDir: string): string[] {
      const abs = join(REPO_ROOT, relDir);
      // Anti-vacuity: a renamed `app/dev` directory must fail here, not quietly
      // contribute zero discovered routes and leave the comparison trivially
      // satisfied by the hand-maintained list.
      expect(existsSync(abs), `dev route directory is missing: ${relDir}`).toBe(true);
      const out: string[] = [];
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          out.push(...collectRouteFiles(`${relDir}/${entry.name}`));
        } else if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
          out.push(`${relDir}/${entry.name}`);
        }
      }
      return out;
    }

    const discovered = DEV_ROUTE_DIRS.flatMap(collectRouteFiles).sort();

    // Non-zero denominator: a walk that examined nothing must not pass.
    expect(discovered.length).toBeGreaterThan(0);
    // Sorted arrays, so the failure message names the offending path rather than
    // reporting a length mismatch.
    expect(
      discovered,
      'a /dev/* route exists that is not in GATED_DEV_ROUTES (or was removed from disk)',
    ).toEqual([...GATED_DEV_ROUTES].sort());
  });
});
