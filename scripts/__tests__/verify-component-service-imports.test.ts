import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  checkComponentServiceImports,
  findViolations,
  isTypeOnlyImport,
} from '../verify-component-service-imports';

/**
 * Fixture tests for `pnpm guard:component-service-imports` (ADR-003). The
 * guard's non-trivial claim is the type-only carve-out: `import type` and an
 * all-`type` brace list pass, and ANY value binding in the same statement
 * fails. A missing scan root used to read as "0 files, clean".
 */
const COMPONENTS = 'apps/web/src/components';
let base: string;

function write(rel: string, content: string): void {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const errors = () =>
  vi
    .mocked(console.error)
    .mock.calls.map((c) => String(c[0]))
    .join('\n');

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'component-service-imports-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('checkComponentServiceImports', () => {
  it('passes on the real repo', () => {
    expect(checkComponentServiceImports()).toBe(0);
  });

  it('passes (0) on type-only imports of a service module', () => {
    write(
      `${COMPONENTS}/widgets/card.tsx`,
      "import type { Widget } from '@/lib/services/widget-service';\n" +
        "import { type Gadget, type GadgetId } from '@/lib/gadgets/gadget-service';\n" +
        "import { useWidgets } from '@/hooks/use-widgets';\n",
    );
    expect(checkComponentServiceImports(base)).toBe(0);
  });

  it('FAILS (1) on a value import, naming the file and the statement line', () => {
    write(
      `${COMPONENTS}/widgets/card.tsx`,
      "import { cn } from '@/lib/utils';\nimport { listWidgets } from '@/lib/services/widget-service';\n",
    );
    expect(checkComponentServiceImports(base)).toBe(1);
    expect(errors()).toContain(`${COMPONENTS}/widgets/card.tsx:2`);
  });

  it('FAILS (1) on a multi-line mixed import where one binding is a value', () => {
    write(
      `${COMPONENTS}/widgets/card.tsx`,
      "import {\n  type Widget,\n  listWidgets,\n} from '@/lib/widgets/services/list';\n",
    );
    expect(checkComponentServiceImports(base)).toBe(1);
    expect(errors()).toContain(`${COMPONENTS}/widgets/card.tsx:1`);
  });

  it('ignores __tests__ directories', () => {
    write(`${COMPONENTS}/ok.tsx`, 'export {};\n');
    write(`${COMPONENTS}/__tests__/card.tsx`, "import { listWidgets } from '@/lib/services/widget-service';\n");
    expect(checkComponentServiceImports(base)).toBe(0);
  });

  it('REFUSES (2) when the components root is missing', () => {
    expect(checkComponentServiceImports(base)).toBe(2);
    expect(errors()).toContain(COMPONENTS);
  });

  it('REFUSES (2) when the components root holds no source file', () => {
    write(`${COMPONENTS}/notes.md`, '# nothing\n');
    expect(checkComponentServiceImports(base)).toBe(2);
  });
});

describe('isTypeOnlyImport', () => {
  it.each([
    ["import type { A } from '@/lib/services/x';", true],
    ["import { type A, type B } from '@/lib/services/x';", true],
    ["import { type A, b } from '@/lib/services/x';", false],
    ["import X, { type A } from '@/lib/services/x';", false],
    ["import * as svc from '@/lib/services/x';", false],
    ["import { typeOf } from '@/lib/services/x';", false],
  ])('%s → %s', (stmt, expected) => {
    expect(isTypeOnlyImport(stmt)).toBe(expected);
  });
});

describe('findViolations', () => {
  it('matches all three service path shapes and nothing else', () => {
    const src = [
      "import { a } from '@/lib/services/alpha';",
      "import { b } from '@/lib/billing/services/beta';",
      "import { c } from '@/lib/billing/gamma-service';",
      "import { d } from '@/lib/billing/delta';",
      "import { e } from '@/hooks/use-epsilon';",
    ].join('\n');
    expect(findViolations(src, 'x.tsx').map((v) => v.line)).toEqual([1, 2, 3]);
  });
});
