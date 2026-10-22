import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  SCAN_ROOTS,
  checkComponentApiCalls,
  findViolations,
} from '../verify-component-api-calls';

/**
 * Fixture tests for `pnpm guard:component-api-calls` (ADR-003), in the three
 * directions `.claude/rules/verification.md` asks for. Until this file the
 * guard skipped a missing scan root silently, so a renamed directory read as
 * clean; one of its ten roots (`app/legal`) had in fact been gone since the
 * legal pages moved under (marketing).
 */
const NONE = new Set<string>();
let base: string;

function write(rel: string, content: string): void {
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Every root exists and holds one clean component, so only the case's own file can fail it. */
function scaffold(): void {
  for (const root of SCAN_ROOTS) write(`${root}/clean.tsx`, 'export const A = () => null;\n');
}

const errors = () =>
  vi
    .mocked(console.error)
    .mock.calls.map((c) => String(c[0]))
    .join('\n');

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'component-api-calls-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('checkComponentApiCalls', () => {
  it('passes on the real repo', () => {
    expect(checkComponentApiCalls()).toBe(0);
  });

  it('passes (0) on a clean fixture tree', () => {
    scaffold();
    write(
      'apps/web/src/components/widgets/list.tsx',
      "import { useWidgets } from '@/hooks/use-widgets';\n// GET /api/v1/widgets lives in the hook\n",
    );
    expect(checkComponentApiCalls(base, NONE)).toBe(0);
  });

  it('FAILS (1) on an injected direct fetch, naming the file and line', () => {
    scaffold();
    write(
      'apps/web/src/components/widgets/list.tsx',
      "export async function load() {\n  return fetch('/api/v1/widgets');\n}\n",
    );
    expect(checkComponentApiCalls(base, NONE)).toBe(1);
    expect(errors()).toContain('apps/web/src/components/widgets/list.tsx:2');
  });

  it('FAILS (1) on a direct fetch in a PAGE under a route group, not just components', () => {
    scaffold();
    write(
      'apps/web/src/app/(authenticated)/widgets/page.tsx',
      'const r = await fetch(`/api/v1/widgets?x=1`);\n',
    );
    expect(checkComponentApiCalls(base, NONE)).toBe(1);
    expect(errors()).toContain('(authenticated)/widgets/page.tsx:1');
  });

  it('ignores test files and __tests__ directories', () => {
    scaffold();
    write('apps/web/src/components/widgets/list.test.tsx', "fetch('/api/v1/widgets');\n");
    write('apps/web/src/components/__tests__/list.tsx', "fetch('/api/v1/widgets');\n");
    expect(checkComponentApiCalls(base, NONE)).toBe(0);
  });

  it('allowlist: a listed file passes, and a listed file that no longer fetches FAILS as dead', () => {
    scaffold();
    const rel = 'apps/web/src/components/widgets/list.tsx';
    write(rel, "fetch('/api/v1/widgets');\n");
    expect(checkComponentApiCalls(base, new Set([rel]))).toBe(0);

    write(rel, 'export {};\n');
    expect(checkComponentApiCalls(base, new Set([rel]))).toBe(1);
    expect(errors()).toContain(`- ${rel}`);
  });

  it('REFUSES (2) when a scan root is missing, and names it', () => {
    scaffold();
    rmSync(join(base, 'apps/web/src/app/sign'), { recursive: true });
    expect(checkComponentApiCalls(base, NONE)).toBe(2);
    expect(errors()).toContain('apps/web/src/app/sign');
  });

  it('REFUSES (2) when every root exists but holds no source file', () => {
    for (const root of SCAN_ROOTS) mkdirSync(join(base, root), { recursive: true });
    expect(checkComponentApiCalls(base, NONE)).toBe(2);
  });
});

describe('findViolations', () => {
  it('matches all three quote styles and ignores a URL that is not a fetch argument', () => {
    const src = [
      "fetch('/api/v1/a');",
      'fetch("/api/v1/b");',
      'fetch(`/api/v1/c`);',
      "const docs = 'see /api/v1/d';",
      "fetch('/api/v2/e');",
    ].join('\n');
    expect(findViolations(src, 'x.tsx').map((v) => v.line)).toEqual([1, 2, 3]);
  });
});
