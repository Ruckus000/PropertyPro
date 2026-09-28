import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkRouteTableImports } from '../verify-route-table-imports';

/**
 * Unit tests for `pnpm guard:route-table-imports`, in the three directions
 * `.claude/rules/verification.md` asks for: refuses when it cannot check (2),
 * fails on an injected violation (1), passes on a clean tree (0). The guard
 * used to exit 0 having scanned nothing when its root was missing.
 */
const SCAN_ROOT = 'apps/web/src/app/api';

let base: string;

function writeRoute(relDir: string, content: string): void {
  const file = join(base, SCAN_ROOT, relDir, 'route.ts');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'route-table-imports-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('checkRouteTableImports', () => {
  it('passes on the real repo and prints a non-zero denominator', () => {
    expect(checkRouteTableImports()).toBe(0);
    const logged = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    const scanned = Number(logged.match(/Scanned (\d+) route\.ts files/)?.[1] ?? 0);
    expect(scanned).toBeGreaterThan(0);
  });

  it('REFUSES (2) when the scan root does not exist, and says so', () => {
    expect(checkRouteTableImports(base)).toBe(2);
    const errors = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');
    expect(errors).toContain(`scan root ${SCAN_ROOT} does not exist`);
  });

  it('REFUSES (2) when the scan root holds no route.ts at all', () => {
    mkdirSync(join(base, SCAN_ROOT, 'v1', 'widgets'), { recursive: true });
    writeFileSync(join(base, SCAN_ROOT, 'v1', 'widgets', 'contract.ts'), 'export {};\n');
    expect(checkRouteTableImports(base)).toBe(2);
  });

  it('REFUSES (2) when the walk hits an entry it cannot stat', () => {
    writeRoute('v1/widgets', "import { createScopedClient } from '@propertypro/db';\n");
    symlinkSync(join(base, 'does-not-exist'), join(base, SCAN_ROOT, 'v1', 'dangling'));
    expect(checkRouteTableImports(base)).toBe(2);
  });

  it('FAILS (1) on an injected direct table import', () => {
    writeRoute('v1/widgets', "import { createScopedClient } from '@propertypro/db';\n");
    writeRoute('v1/gadgets', "import { createScopedClient, gadgets } from '@propertypro/db';\n");
    expect(checkRouteTableImports(base)).toBe(1);
    const errors = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');
    expect(errors).toContain('imports: gadgets');
  });

  it('passes (0) on a clean fixture tree', () => {
    writeRoute('v1/widgets', "import { createScopedClient, paginate } from '@propertypro/db';\n");
    writeRoute('v1/gadgets', "import type { Gadget } from '@propertypro/db';\n");
    expect(checkRouteTableImports(base)).toBe(0);
  });
});
