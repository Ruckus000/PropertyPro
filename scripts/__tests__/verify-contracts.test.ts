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
});
