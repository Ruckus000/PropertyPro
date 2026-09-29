import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import {
  exportedVerbs,
  isTokenAuthenticated,
  parseDeclaredRoutes,
} from '../verify-token-auth-routes';

/**
 * Self-test for `pnpm guard:token-auth-routes` (roadmap 2.10). The guard's
 * repo root is fixed at import, so the real-repo run is a subprocess and the
 * detection is tested through its exported pieces.
 */
const repoRoot = join(__dirname, '..', '..');
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');

describe('isTokenAuthenticated', () => {
  it('is true for a verify*Token call with no session requirement', () => {
    expect(isTokenAuthenticated('export async function GET(req) { const p = verifyDemoToken(t); }')).toBe(true);
  });

  it('is false when the route also requires a session, or only MENTIONS the verifier', () => {
    expect(
      isTokenAuthenticated('export async function GET() { verifyFooToken(t); await requireAuthenticatedUserId(); }'),
    ).toBe(false);
    expect(isTokenAuthenticated('// calls verifyFooToken(t) upstream\nexport async function GET() {}')).toBe(false);
  });
});

describe('exportedVerbs', () => {
  it('reads both export forms and ignores commented-out ones', () => {
    expect(
      exportedVerbs('export async function GET() {}\nexport const POST = h;\n// export const DELETE = h;'),
    ).toEqual(['GET', 'POST']);
  });
});

describe('parseDeclaredRoutes', () => {
  it('reads method + path entries out of the TOKEN_AUTH_ROUTES literal', () => {
    const src = `const TOKEN_AUTH_ROUTES = [\n  { path: '/api/v1/a', method: 'GET' },\n  // { path: '/api/v1/old', method: 'GET' },\n  { path: '/api/v1/b', method: 'POST' },\n];`;
    expect([...parseDeclaredRoutes(src)].sort()).toEqual(['GET /api/v1/a', 'POST /api/v1/b']);
  });

  it('REFUSES (throws, exit 2) on a missing or empty list rather than reporting clean', () => {
    expect(() => parseDeclaredRoutes('const OTHER = [];')).toThrow(/Could not find/);
    expect(() => parseDeclaredRoutes('const TOKEN_AUTH_ROUTES = [\n];')).toThrow(/Parsed 0 entries/);
  });
});

describe('guard on the real repository', () => {
  it('exits 0 and reports a non-zero population', () => {
    const r = spawnSync(tsxBin, [join(repoRoot, 'scripts/verify-token-auth-routes.ts')], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    const scanned = Number(r.stdout.match(/Scanned (\d+) route\.ts files/)?.[1] ?? 0);
    expect(scanned).toBeGreaterThan(0);
  });
});
