import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkPagePadding, findViolations } from '../verify-page-padding';

/**
 * Fixture tests for `pnpm guard:page-padding`. Before these the guard crashed
 * on a missing route group and passed an empty one ("0 authenticated pages
 * verified"); both now refuse with exit 2.
 */
const AUTH = 'apps/web/src/app/(authenticated)';
let base: string;

function writePage(route: string, content: string): string {
  const rel = `${AUTH}/${route}/page.tsx`;
  const file = join(base, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return rel;
}

const page = (rootTag: string) =>
  `export default function Page() {\n  return (\n    ${rootTag}\n      <p>hi</p>\n    </div>\n  );\n}\n`;

const errors = () =>
  vi
    .mocked(console.error)
    .mock.calls.map((c) => String(c[0]))
    .join('\n');

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'page-padding-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('checkPagePadding', () => {
  it('passes on the real repo', () => {
    expect(checkPagePadding()).toBe(0);
  });

  it('passes (0) on pages whose root carries only vertical rhythm', () => {
    writePage('widgets', page('<div className="space-y-6">'));
    writePage('gadgets', page('<div className="mx-auto max-w-3xl">'));
    expect(checkPagePadding(base, {})).toBe(0);
  });

  it('FAILS (1) on a root with responsive horizontal padding, naming the file and rule', () => {
    writePage('widgets', page('<div className="space-y-6">'));
    const bad = writePage('gadgets', page('<div className="space-y-6 px-4 sm:px-8">'));
    expect(checkPagePadding(base, {})).toBe(1);
    expect(errors()).toContain(bad);
    expect(errors()).toContain('[root-horizontal-padding]');
  });

  it('FAILS (1) on a page that renders its own <main>', () => {
    const bad = writePage('gadgets', page('<main className="space-y-6">'));
    expect(checkPagePadding(base, {})).toBe(1);
    expect(errors()).toContain(bad);
    expect(errors()).toContain('[nested-main]');
  });

  it('baseline: a frozen count passes; one more violation than the ceiling fails', () => {
    const rel = writePage('gadgets', page('<div className="p-4">'));
    expect(checkPagePadding(base, { [rel]: 1 })).toBe(0);

    writePage('gadgets', page('<main className="p-4">'));
    expect(checkPagePadding(base, { [rel]: 1 })).toBe(1);
  });

  it('honours the page-padding:exempt escape hatch', () => {
    writePage('gadgets', `// page-padding:exempt — standalone print view\n${page('<div className="px-4">')}`);
    expect(checkPagePadding(base, {})).toBe(0);
  });

  it('REFUSES (2) when the (authenticated) route group is missing', () => {
    expect(checkPagePadding(base, {})).toBe(2);
    expect(errors()).toContain('scan root missing');
  });

  it('REFUSES (2) when the route group holds no page.tsx', () => {
    const layout = join(base, AUTH, 'layout.tsx');
    mkdirSync(dirname(layout), { recursive: true });
    writeFileSync(layout, 'export default function L() { return null; }\n');
    expect(checkPagePadding(base, {})).toBe(2);
  });
});

describe('findViolations', () => {
  it('ignores padding on a leaf element returned from a .map callback', () => {
    const src =
      'export default function P() {\n  return (\n    <div className="space-y-6">\n' +
      '      {xs.map((x) => {\n        return (\n          <a className="px-3">{x}</a>\n        );\n      })}\n' +
      '    </div>\n  );\n}\n';
    expect(findViolations(src)).toEqual([]);
  });

  it('sees a root opening tag that spans several lines', () => {
    const src = 'export default function P() {\n  return (\n    <section\n      className="pl-6"\n    >\n    </section>\n  );\n}\n';
    expect(findViolations(src).map((v) => v.rule)).toEqual(['root-horizontal-padding']);
  });
});
