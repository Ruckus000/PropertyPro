import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkNoMocksInIntegration } from '../verify-no-mocks-in-integration';

/**
 * Fixture tests for the no-mock guard (the required `no-mock-guard` CI job).
 * #1408 made a stale allowlist entry fail and an empty scan refuse; these pin
 * both, plus the violation itself.
 */
let base: string;

function write(rel: string, content: string): string {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return rel;
}

const WEB = 'apps/web/__tests__';
const DB = 'packages/db/__tests__';
const clean = "import { it } from 'vitest';\nit('runs', () => {});\n";
const mocked = "import { vi } from 'vitest';\nvi.mock('@/lib/api/auth');\n";

const output = () =>
  [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls]
    .map((c) => String(c[0]))
    .join('\n');

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'no-mocks-'));
  mkdirSync(join(base, DB), { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('checkNoMocksInIntegration', () => {
  it('passes on the real repo', () => {
    expect(checkNoMocksInIntegration()).toBe(0);
  });

  it('passes (0) on integration tests that mock nothing', () => {
    write(`${WEB}/a.integration.test.ts`, clean);
    expect(checkNoMocksInIntegration(base, new Map())).toBe(0);
  });

  it('FAILS (1) on a vi.mock in a file that is not allowlisted, naming file and line', () => {
    write(`${WEB}/a.integration.test.ts`, clean);
    const bad = write(`${WEB}/b.integration.test.ts`, mocked);
    expect(checkNoMocksInIntegration(base, new Map())).toBe(1);
    expect(output()).toContain(`${bad}:2 — vi.mock()`);
  });

  it('FAILS (1) on an allowlisted file that no longer mocks anything (stale entry)', () => {
    const stale = write(`${WEB}/a.integration.test.ts`, clean);
    expect(checkNoMocksInIntegration(base, new Map([[stale, 'stubs X']]))).toBe(1);
    expect(output()).toContain(`${stale} — no longer uses a mocking API`);
  });

  it('refuses (2) when there is nothing to scan', () => {
    mkdirSync(join(base, WEB), { recursive: true });
    expect(checkNoMocksInIntegration(base, new Map())).toBe(2);
    expect(output()).toContain('Scanned 0 integration test files');
  });
});
