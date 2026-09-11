import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import {
  CannotCheckError,
  INTERNAL_ROOTS,
  callsRequireCronSecret,
  scanRoot,
  stripComments,
} from '../verify-internal-cron-auth';

/**
 * Unit tests for `pnpm guard:internal-cron-auth`.
 *
 * The guard's value is entirely in the cases where it REFUSES. A guard that can
 * only pass is indistinguishable from no guard, and this one previously had a
 * way to pass while checking nothing: `walkRouteFiles` swallowed a missing
 * directory, so a renamed root printed `Scanned 0` and exited 0.
 *
 * `.claude/rules/verification.md` asks for three directions, and until now only
 * two were here: passes on the real repo, and refuses when it cannot check. The
 * third — FAILS ON AN INJECTED VIOLATION — was missing at the `scanRoot` level,
 * so deleting the `if (!callsRequireCronSecret(...))` block (the one line that
 * makes this a guard) left every test green. `scanRoot over an injected root`
 * below is that direction; it is the case protecting a session-less route on the
 * app that holds the service-role key.
 */
describe('the roots it scans', () => {
  it('covers both apps that open an internal prefix in middleware', () => {
    expect(INTERNAL_ROOTS.map((r) => r.dir)).toEqual([
      'apps/web/src/app/api/v1/internal',
      'apps/admin/src/app/api/admin/internal',
    ]);
  });

  it('exempts nothing on the console, which holds the service-role key', () => {
    const admin = INTERNAL_ROOTS.find((r) => r.dir.startsWith('apps/admin'));
    expect(admin?.exemptions).toEqual([]);
  });

  it('every exemption carries a reason', () => {
    for (const root of INTERNAL_ROOTS) {
      for (const exemption of root.exemptions) {
        expect(exemption.reason.length).toBeGreaterThan(20);
      }
    }
  });
});

describe('scanRoot', () => {
  it('passes on the real roots', () => {
    for (const root of INTERNAL_ROOTS) {
      const result = scanRoot(root);
      expect(result.violations).toEqual([]);
      // Assert a non-zero population: a clean result over nothing is not a pass.
      expect(result.scanned).toBeGreaterThan(0);
    }
  });

  it('REFUSES rather than passing when a root does not exist', () => {
    expect(() =>
      scanRoot({
        dir: 'apps/admin/src/app/api/admin/internal-renamed',
        urlPrefix: '/api/admin/internal-renamed/',
        middleware: 'apps/admin/src/middleware.ts',
        exemptions: [],
      }),
    ).toThrow(CannotCheckError);
  });

  it('REFUSES rather than passing when a root holds no route.ts at all', () => {
    expect(() =>
      scanRoot({
        // A real directory with no route.ts below it.
        dir: 'apps/admin/src/lib/pwa',
        urlPrefix: '/api/admin/internal/',
        middleware: 'apps/admin/src/middleware.ts',
        exemptions: [],
      }),
    ).toThrow(CannotCheckError);
  });

  it('reports a stale exemption, which would silently re-permit a future file', () => {
    const { violations } = scanRoot({
      dir: 'apps/admin/src/app/api/admin/internal',
      urlPrefix: '/api/admin/internal/',
      middleware: 'apps/admin/src/middleware.ts',
      exemptions: [{ file: 'apps/admin/src/app/api/admin/internal/gone/route.ts', reason: 'x'.repeat(30) }],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain('no such route file exists');
  });
});

/**
 * The injected-violation direction, driven through `scanRoot` rather than
 * through `callsRequireCronSecret` alone — the wiring between the predicate and
 * the `violations.push` is the part that was untested.
 *
 * The root is built on disk under the repo, because `scanRoot` resolves its
 * `dir` against the repo root and there is no seam to inject a base path. A
 * committed fixture would be a permanent fake `route.ts` in the tree; a
 * temporary one is gone by the end of the test.
 */
describe('scanRoot over an injected root', () => {
  const REPO_ROOT = resolve(import.meta.dirname, '../..');
  let absolute: string;
  let dir: string;

  const rootAt = (relativeDir: string) => ({
    dir: relativeDir,
    urlPrefix: '/api/admin/internal/',
    middleware: 'apps/admin/src/middleware.ts',
    exemptions: [],
  });

  beforeEach(() => {
    absolute = mkdtempSync(join(REPO_ROOT, '.internal-cron-auth-fixture-'));
    dir = relative(REPO_ROOT, absolute);
  });

  afterEach(() => {
    rmSync(absolute, { recursive: true, force: true });
  });

  function writeRoute(segment: string, filename: string, source: string): void {
    mkdirSync(join(absolute, segment), { recursive: true });
    writeFileSync(join(absolute, segment, filename), source, 'utf-8');
  }

  it('REPORTS a route that never calls requireCronSecret, and only that one', () => {
    writeRoute(
      'guarded',
      'route.ts',
      "import { requireCronSecret } from '@/lib/api/cron-auth';\n" +
        'export const GET = async (req) => {\n' +
        '  requireCronSecret(req, process.env.CRON_SECRET);\n' +
        "  return new Response('ok');\n" +
        '};\n',
    );
    writeRoute(
      'forgotten',
      'route.ts',
      "export const GET = async () => new Response('ok');\n",
    );

    const { scanned, violations } = scanRoot(rootAt(dir));

    // The denominator is asserted too: one violation out of one file would be a
    // different, weaker claim.
    expect(scanned).toBe(2);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.file).toBe(join(dir, 'forgotten', 'route.ts'));
    expect(violations[0]!.message).toContain('No requireCronSecret(...) call');
    expect(violations[0]!.message).toContain('this route is PUBLIC');
  });

  // Next routes all of these, middleware waves all of them past the session
  // gate, and the guard used to match the literal string `route.ts` — so every
  // one of them was a fully public route this guard could not see.
  it.each(['route.tsx', 'route.js', 'route.jsx', 'route.mts', 'route.mjs'])(
    'sees a %s that Next routes just as readily',
    (filename) => {
      writeRoute('forgotten', filename, "export const GET = async () => new Response('ok');\n");

      const { scanned, violations } = scanRoot(rootAt(dir));

      expect(scanned).toBe(1);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.file).toBe(join(dir, 'forgotten', filename));
    },
  );

  // Anti-vacuity for the two cases above: the same root with every route
  // compliant must come back clean, so a guard that simply always reports is not
  // what they are measuring.
  it('stays silent when every route calls it', () => {
    writeRoute('a', 'route.ts', 'requireCronSecret(req, process.env.CRON_SECRET);\n');
    writeRoute('b', 'route.mjs', 'requireCronSecret(req, process.env.CRON_SECRET);\n');

    const { scanned, violations } = scanRoot(rootAt(dir));

    expect(scanned).toBe(2);
    expect(violations).toEqual([]);
  });

  // The comment strip, exercised through `scanRoot` rather than through the
  // predicate alone: a docblock promising the call is the shape a reviewer is
  // most likely to be satisfied by.
  it('is not satisfied by a route that only MENTIONS the call in a comment', () => {
    writeRoute(
      'prose',
      'route.ts',
      '/** Auth: requireCronSecret(req) runs in the shared wrapper. */\n' +
        "export const GET = async () => new Response('ok');\n",
    );

    const { violations } = scanRoot(rootAt(dir));
    expect(violations).toHaveLength(1);
  });
});

describe('callsRequireCronSecret', () => {
  it('sees a real call', () => {
    expect(callsRequireCronSecret('requireCronSecret(request, process.env.CRON_SECRET);')).toBe(
      true,
    );
  });

  it('is not fooled by a mention in prose', () => {
    expect(callsRequireCronSecret('// this route calls requireCronSecret(req) elsewhere')).toBe(
      false,
    );
    expect(callsRequireCronSecret('/* requireCronSecret(req) */ export const GET = h;')).toBe(
      false,
    );
  });

  it('strips both comment forms', () => {
    expect(stripComments('a /* b */ c // d\ne')).toBe('a  c \ne');
  });
});
