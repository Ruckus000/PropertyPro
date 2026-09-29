import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkReadEntitlement, classifyRoute } from '../verify-read-entitlement-coverage';

/**
 * Self-test for `pnpm guard:read-entitlement` (roadmap 2.10). Three directions
 * (passes on the repo, fails on an injected violation, refuses when it cannot
 * check) plus one probe per hazard 2.10 fixed.
 */
const MEMBERSHIP = 'const m = await requireCommunityMembership(communityId, userId);';
const GATE = 'await requireEntitledForAdminRead(communityId, m);';

describe('classifyRoute', () => {
  it('puts a function-form GET in scope (the const-only regex missed it)', () => {
    const r = classifyRoute('route.ts', `export async function GET() { ${MEMBERSHIP} }`);
    expect(r).toEqual({ inScope: true, gated: false, exempt: false });
  });

  it('does not count a gate named only in a comment', () => {
    const r = classifyRoute(
      'route.ts',
      `export const GET = async () => { ${MEMBERSHIP}\n  // TODO: requireEntitledForAdminRead(communityId, m);\n};`,
    );
    expect(r.gated).toBe(false);
  });

  it('counts a real gate, and reads the exempt marker from the comment it lives in', () => {
    expect(classifyRoute('route.ts', `export const GET = async () => { ${MEMBERSHIP} ${GATE} };`).gated).toBe(true);
    expect(
      classifyRoute('route.ts', `// read-entitlement:exempt — reactivation path\nexport const GET = async () => { ${MEMBERSHIP} };`)
        .exempt,
    ).toBe(true);
  });
});

describe('checkReadEntitlement', () => {
  let base: string;
  const write = (rel: string, content: string) => {
    const file = join(base, 'apps/web/src/app/api/v1', rel, 'route.ts');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  const errors = () => vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'read-entitlement-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(base, { recursive: true, force: true });
  });

  it('passes on the real repository', () => {
    expect(checkReadEntitlement()).toBe(0);
  });

  it('fails (1) on an in-scope GET with no gate, naming it', () => {
    write('widgets', `export async function GET() { ${MEMBERSHIP} }`);
    expect(checkReadEntitlement(base)).toBe(1);
    expect(errors()).toContain('api/v1/widgets/route.ts');
  });

  it('passes (0) when every in-scope GET is gated', () => {
    write('widgets', `export async function GET() { ${MEMBERSHIP} ${GATE} }`);
    expect(checkReadEntitlement(base)).toBe(0);
  });

  it('REFUSES (2) when the API root is missing', () => {
    expect(checkReadEntitlement(base)).toBe(2);
  });

  it('REFUSES (2) when no route is in scope — a scan that examined nothing', () => {
    write('widgets', `export async function GET() { return listWidgets(); }`);
    expect(checkReadEntitlement(base)).toBe(2);
    expect(errors()).toContain('0 admin GET routes in scope');
  });

  it('REFUSES (2) on a file that does not parse', () => {
    write('widgets', `export async function GET() { ${MEMBERSHIP} ${GATE} }`);
    write('broken', 'export const GET = (;');
    expect(checkReadEntitlement(base)).toBe(2);
  });
});
