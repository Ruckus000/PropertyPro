import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkAdminErrorLeakage, isResponseBodyLine } from '../verify-admin-error-leakage';

/**
 * Fixture tests for `pnpm guard:admin-error-leakage`: an admin route must not
 * put a caught error's `.message` into a response body. The guard's own
 * selftest covers single lines; these cover the scan, the escape hatches, the
 * window-based domain-error allowance, and the refusals (a missing API root
 * used to crash with ENOENT, and an empty one passed).
 */
const API = 'apps/admin/src/app/api';
let base: string;

function write(rel: string, content: string): void {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const CLEAN_ROUTE = [
  "import { assertNoDbError } from '@/lib/api/assert-no-db-error';",
  'export async function GET() {',
  '  const { data, error } = await q();',
  "  assertNoDbError(error, 'Failed to list plans');",
  "  console.error('[admin] detail:', error?.message);",
  '  return NextResponse.json({ data });',
  '}',
].join('\n');

const errors = () =>
  vi
    .mocked(console.error)
    .mock.calls.map((c) => String(c[0]))
    .join('\n');

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'admin-error-leakage-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('checkAdminErrorLeakage', () => {
  it('passes on the real repo', () => {
    expect(checkAdminErrorLeakage()).toBe(0);
  });

  it('passes (0) on a route that throws through assertNoDbError and logs the detail', () => {
    write(`${API}/plans/route.ts`, CLEAN_ROUTE);
    expect(checkAdminErrorLeakage(base)).toBe(0);
  });

  it('FAILS (1) on an injected `catch (e)` leak, naming file and line', () => {
    write(`${API}/plans/route.ts`, CLEAN_ROUTE);
    write(
      `${API}/tickets/route.ts`,
      'export async function POST() {\n  try {\n    await go();\n  } catch (e) {\n' +
        '    return NextResponse.json({ error: { message: (e as Error).message } }, { status: 500 });\n  }\n}\n',
    );
    expect(checkAdminErrorLeakage(base)).toBe(1);
    expect(errors()).toContain(`${API}/tickets/route.ts:5`);
  });

  it('FAILS (1) when the domain-error class is NOT the one in the enclosing branch', () => {
    write(
      `${API}/roles/route.ts`,
      [
        '  if (err instanceof SomeVendorError) {',
        '    return NextResponse.json(',
        "      { error: { code: 'FORBIDDEN', message: err.message } },",
      ].join('\n'),
    );
    expect(checkAdminErrorLeakage(base)).toBe(1);
  });

  it('allows a RoleOpForbiddenError message read inside its own instanceof branch', () => {
    write(
      `${API}/roles/route.ts`,
      [
        '  if (err instanceof RoleOpForbiddenError) {',
        '    return NextResponse.json(',
        "      { error: { code: 'FORBIDDEN', message: err.message } },",
      ].join('\n'),
    );
    expect(checkAdminErrorLeakage(base)).toBe(0);
  });

  it('honours the exemption on the line itself and on the line above', () => {
    write(
      `${API}/a/route.ts`,
      'return NextResponse.json({ error: e.message }); // admin-error-leak:exempt — test-only route\n',
    );
    write(
      `${API}/b/route.ts`,
      '// admin-error-leak:exempt — authored message\nreturn NextResponse.json({ error: e.message });\n',
    );
    expect(checkAdminErrorLeakage(base)).toBe(0);
  });

  it('REFUSES (2) when the admin API root is missing', () => {
    expect(checkAdminErrorLeakage(base)).toBe(2);
    expect(errors()).toContain(`${API} does not exist`);
  });

  it('REFUSES (2) when the admin API root holds no .ts file', () => {
    write(`${API}/README.md`, 'routes go here\n');
    expect(checkAdminErrorLeakage(base)).toBe(2);
  });
});

describe('isResponseBodyLine', () => {
  it('does not flag a Zod issue message or a server-side log', () => {
    expect(isResponseBodyLine("  { error: { message: parsed.error.issues[0]?.message } },")).toBe(false);
    expect(isResponseBodyLine("  console.error('x', error.message);")).toBe(false);
  });

  it('flags a template literal that interpolates a vendor message', () => {
    expect(isResponseBodyLine('  { error: { message: `Snapshot failed: ${snapErr.message}` } },')).toBe(true);
  });
});
