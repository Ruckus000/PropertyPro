import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  KNOWN_DIRECT_TABLE_IMPORTS,
  checkRouteTableImports,
  findDisallowedDbImports,
} from '../verify-route-table-imports';

/**
 * Unit tests for `pnpm guard:route-table-imports`, in the three directions
 * `.claude/rules/verification.md` asks for: refuses when it cannot check (2),
 * fails on an injected violation (1), passes on a clean tree (0). The guard
 * used to exit 0 having scanned nothing when its root was missing.
 */
const SCAN_ROOT = 'apps/web/src/app/api';
const EMPTY = new Map<string, readonly string[]>();

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
    const scanned = Number(logged.match(/Scanned (\d+) server files/)?.[1] ?? 0);
    expect(scanned).toBeGreaterThan(0);
  });

  it('REFUSES (2) when the scan root does not exist, and says so', () => {
    expect(checkRouteTableImports(base, EMPTY)).toBe(2);
    const errors = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');
    expect(errors).toContain('scan root apps/web/src/app does not exist');
  });

  it('REFUSES (2) when the scan root holds no route.ts at all', () => {
    mkdirSync(join(base, SCAN_ROOT, 'v1', 'widgets'), { recursive: true });
    writeFileSync(join(base, SCAN_ROOT, 'v1', 'widgets', 'contract.ts'), 'export {};\n');
    expect(checkRouteTableImports(base, EMPTY)).toBe(2);
  });

  it('REFUSES (2) when the walk hits an entry it cannot stat', () => {
    writeRoute('v1/widgets', "import { createScopedClient } from '@propertypro/db';\n");
    symlinkSync(join(base, 'does-not-exist'), join(base, SCAN_ROOT, 'v1', 'dangling'));
    expect(checkRouteTableImports(base, EMPTY)).toBe(2);
  });

  it('FAILS (1) on an injected direct table import', () => {
    writeRoute('v1/widgets', "import { createScopedClient } from '@propertypro/db';\n");
    writeRoute('v1/gadgets', "import { createScopedClient, gadgets } from '@propertypro/db';\n");
    expect(checkRouteTableImports(base, EMPTY)).toBe(1);
    const errors = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');
    expect(errors).toContain('→ gadgets');
  });

  it('passes (0) on a clean fixture tree', () => {
    writeRoute('v1/widgets', "import { createScopedClient, paginate } from '@propertypro/db';\n");
    writeRoute('v1/gadgets', "import type { Gadget } from '@propertypro/db';\n");
    expect(checkRouteTableImports(base, EMPTY)).toBe(0);
  });

  it('FAILS (1) on a table import in a PAGE, not just an API route (roadmap 2.3)', () => {
    writeRoute('v1/widgets', "import { createScopedClient } from '@propertypro/db';\n");
    const page = join(base, 'apps/web/src/app/(authenticated)/gadgets/page.tsx');
    mkdirSync(dirname(page), { recursive: true });
    writeFileSync(page, "import { gadgets } from '@propertypro/db';\nexport default function P() { return null; }\n");
    expect(checkRouteTableImports(base, EMPTY)).toBe(1);
    const errors = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');
    expect(errors).toContain('(authenticated)/gadgets/page.tsx');
  });

  it('ignores test files under the app tree', () => {
    writeRoute('v1/widgets', "import { createScopedClient } from '@propertypro/db';\n");
    writeRoute('v1/widgets/__tests__', "import { widgets } from '@propertypro/db';\n");
    writeFileSync(join(base, SCAN_ROOT, 'v1', 'widgets', 'x.test.ts'), "import { widgets } from '@propertypro/db';\n");
    expect(checkRouteTableImports(base, EMPTY)).toBe(0);
  });

  it('baseline: a listed symbol passes, a NEW symbol in the same file fails, a stale one fails', () => {
    writeRoute('v1/gadgets', "import { gadgets } from '@propertypro/db';\n");
    const rel = `${SCAN_ROOT}/v1/gadgets/route.ts`;
    expect(checkRouteTableImports(base, new Map([[rel, ['gadgets']]]))).toBe(0);

    writeRoute('v1/gadgets', "import { gadgets, widgets } from '@propertypro/db';\n");
    expect(checkRouteTableImports(base, new Map([[rel, ['gadgets']]]))).toBe(1);

    writeRoute('v1/gadgets', "import { createScopedClient } from '@propertypro/db';\n");
    expect(checkRouteTableImports(base, new Map([[rel, ['gadgets']]]))).toBe(1);
    const errors = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');
    expect(errors).toContain(`${rel} → gadgets`);
  });

  it('REFUSES (2) when a scanned file does not parse', () => {
    writeRoute('v1/widgets', "import { createScopedClient } from '@propertypro/db';\n");
    writeRoute('v1/broken', 'export const GET = (;\n');
    expect(checkRouteTableImports(base, EMPTY)).toBe(2);
  });

  it('keeps app/api at its hard floor: no baseline entry is an API route', () => {
    expect([...KNOWN_DIRECT_TABLE_IMPORTS.keys()].filter((f) => f.includes('/app/api/'))).toEqual([]);
  });
});

/**
 * Roadmap 2.4 (DBB-05): the regex scanner this replaced saw only
 * `import { … } from`. Each shape below reaches the same tables and was
 * invisible to it.
 */
describe('findDisallowedDbImports', () => {
  const find = (src: string) => findDisallowedDbImports('x.ts', src);

  it('flags a namespace import', () => {
    expect(find("import * as db from '@propertypro/db';")).toEqual(['namespace import (* as db)']);
  });

  it('flags a re-export, named or star', () => {
    expect(find("export { gadgets } from '@propertypro/db';")).toEqual(['re-export (gadgets)']);
    expect(find("export * from '@propertypro/db';")).toEqual(['re-export (export * from)']);
  });

  it('flags a dynamic import', () => {
    expect(find("async function f() { const { g } = await import('@propertypro/db'); }")).toEqual([
      'dynamic import()',
    ]);
  });

  it('flags a default import and an aliased table, by its SOURCE name', () => {
    expect(find("import db, { gadgets as g } from '@propertypro/db';")).toEqual([
      'default import (db)',
      'gadgets',
    ]);
  });

  it('allows helpers, type-only imports (both forms) and other db subpaths', () => {
    expect(
      find(
        "import { createScopedClient, type Gadget } from '@propertypro/db';\n" +
          "import type { Widget } from '@propertypro/db';\n" +
          "export type { Widget } from '@propertypro/db';\n" +
          "import { eq } from '@propertypro/db/filters';\n",
      ),
    ).toEqual([]);
  });

  it('does not treat a string or comment mentioning the module as an import', () => {
    expect(find("// import { gadgets } from '@propertypro/db'\nconst s = \"import('@propertypro/db')\";")).toEqual([]);
  });
});
