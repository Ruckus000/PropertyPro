import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ALLOWLIST_REASONS, checkContracts, type AllowlistReason } from '../verify-contracts';

/** Self-test for `pnpm guard:contracts` (roadmap 2.10). */
const ROOT = 'apps/web/src/app/api';
const NONE = new Map<string, AllowlistReason>();

describe('checkContracts', () => {
  let base: string;
  const write = (rel: string, content: string) => {
    const file = join(base, ROOT, rel, 'route.ts');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  };
  const errors = () => vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'contracts-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(base, { recursive: true, force: true });
  });

  it('passes on the real repository, with the allowlist at its pinned size', () => {
    expect(checkContracts()).toBe(0);
    expect(ALLOWLIST_REASONS.size).toBeGreaterThan(0);
  });

  it('fails (1) on a route that is neither contracted nor allowlisted', () => {
    write('v1/contracted', 'export const GET = withErrorHandler(runRoute(c, async () => ({})));');
    write('v1/bare', 'export async function GET() { return NextResponse.json({}); }');
    expect(checkContracts(base, NONE)).toBe(1);
    expect(errors()).toContain('v1/bare/route.ts');
  });

  it('passes (0) when the only uncontracted route is allowlisted', () => {
    write('v1/bare', 'export async function GET() { return NextResponse.json({}); }');
    const allowlist = new Map<string, AllowlistReason>([[`${ROOT}/v1/bare/route.ts`, 'redirect']]);
    expect(checkContracts(base, allowlist)).toBe(0);
  });

  it('REFUSES (2) when the scan root is missing — it used to exit 1 via "dead allowlist"', () => {
    expect(checkContracts(base)).toBe(2);
    expect(errors()).toContain('does not exist');
    expect(errors()).not.toContain('ALLOWLIST_REASONS');
  });

  it('REFUSES (2) when the scan root holds no route.ts', () => {
    mkdirSync(join(base, ROOT, 'v1'), { recursive: true });
    expect(checkContracts(base, NONE)).toBe(2);
  });

  // CON-05 ends with PENDING_DRAIN_ROUTES empty. The machinery stays so that
  // state refuses every `pending-drain` claim instead of accepting any.
  describe('pending-drain reservation', () => {
    const CRUD = `${ROOT}/v1/crud/route.ts`;
    const EMPTY = new Set<string>();
    const logs = () => vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');

    it('with an EMPTY pending set, refuses (1) any pending-drain claim, saying CON-05 is complete', () => {
      write('v1/crud', 'export async function POST() { return NextResponse.json({}); }');
      const allowlist = new Map<string, AllowlistReason>([[CRUD, 'pending-drain']]);
      expect(checkContracts(base, allowlist, EMPTY)).toBe(1);
      expect(errors()).toContain("1 entry claims 'pending-drain' but is not a CON-05 route");
      expect(errors()).toContain('CON-05 is complete, so NO route may be pending');
      expect(errors()).toContain(CRUD);
    });

    it('with an EMPTY pending set, a clean tree passes and the summary names no shrink path', () => {
      write('v1/bare', 'export async function GET() { return NextResponse.json({}); }');
      const allowlist = new Map<string, AllowlistReason>([[`${ROOT}/v1/bare/route.ts`, 'redirect']]);
      expect(checkContracts(base, allowlist, EMPTY)).toBe(0);
      expect(logs()).toContain('CON-05 is complete');
      expect(logs()).toContain('no shrink path remains');
      expect(logs()).not.toContain('0 pending-drain');
    });

    it('a named pending route is accepted as pending-drain, and the summary is singular', () => {
      write('v1/crud', 'export async function POST() { return NextResponse.json({}); }');
      const allowlist = new Map<string, AllowlistReason>([[CRUD, 'pending-drain']]);
      expect(checkContracts(base, allowlist, new Set([CRUD]))).toBe(0);
      expect(logs()).toContain('(1 pending-drain CRUD route left, Phase 3.5)');
    });

    it('a named pending route classified as anything else is refused as frozen (1)', () => {
      write('v1/crud', 'export async function POST() { return NextResponse.json({}); }');
      const allowlist = new Map<string, AllowlistReason>([[CRUD, 'status-codes']]);
      expect(checkContracts(base, allowlist, new Set([CRUD]))).toBe(1);
      expect(errors()).toContain("classified as something other than 'pending-drain'");
    });

    it('a pending-drain claim outside a non-empty set names the routes that may be pending', () => {
      write('v1/crud', 'export async function POST() { return NextResponse.json({}); }');
      write('v1/other', 'export async function POST() { return NextResponse.json({}); }');
      const allowlist = new Map<string, AllowlistReason>([
        [CRUD, 'pending-drain'],
        [`${ROOT}/v1/other/route.ts`, 'pending-drain'],
      ]);
      expect(checkContracts(base, allowlist, new Set(['apps/web/src/app/api/v1/meetings/route.ts']))).toBe(1);
      expect(errors()).toContain("2 entries claim 'pending-drain' but are not CON-05 routes");
      expect(errors()).toContain('Only meetings may be pending');
    });
  });
});
