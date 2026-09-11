import { describe, expect, it } from 'vitest';

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
