import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkHookRequestJson, findViolations } from '../verify-hook-requestjson';

/**
 * Fixture tests for `pnpm guard:hook-requestjson` (Plan B6). The guard's one
 * claim over its sibling `guard:component-api-calls` is that it scans whole
 * files, so a `fetch(` wrapped onto the next line is still caught — that case
 * is pinned below. A missing hooks directory used to be skipped silently.
 */
const HOOKS = 'apps/web/src/hooks';
const NONE = new Set<string>();
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
  base = mkdtempSync(join(tmpdir(), 'hook-requestjson-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('checkHookRequestJson', () => {
  it('passes on the real repo', () => {
    expect(checkHookRequestJson()).toBe(0);
  });

  it('passes (0) on a hook that goes through requestJson', () => {
    write(
      `${HOOKS}/use-widgets.ts`,
      "import { requestJson } from '@/lib/api/request-json';\n" +
        "export const load = () => requestJson('/api/v1/widgets');\n",
    );
    expect(checkHookRequestJson(base, NONE)).toBe(0);
  });

  it('FAILS (1) on an injected raw fetch, naming the file and line', () => {
    write(`${HOOKS}/use-widgets.ts`, "export const load = () =>\n  fetch('/api/v1/widgets');\n");
    expect(checkHookRequestJson(base, NONE)).toBe(1);
    expect(errors()).toContain(`${HOOKS}/use-widgets.ts:2`);
  });

  it('FAILS (1) on a fetch whose URL is wrapped onto the next line', () => {
    write(
      `${HOOKS}/use-upload.ts`,
      'export const upload = (body: FormData) =>\n  fetch(\n    `/api/v1/uploads`,\n    { method: "POST", body },\n  );\n',
    );
    expect(checkHookRequestJson(base, NONE)).toBe(1);
    expect(errors()).toContain(`${HOOKS}/use-upload.ts:2`);
  });

  it('does not flag a fetch to a variable URL (presigned storage PUT)', () => {
    write(`${HOOKS}/use-presign.ts`, 'export const put = (url: string) => fetch(url, { method: "PUT" });\n');
    expect(checkHookRequestJson(base, NONE)).toBe(0);
  });

  it('allowlist: a listed hook passes; a listed hook that no longer fetches FAILS as dead', () => {
    const rel = `${HOOKS}/use-export.ts`;
    write(rel, "export const dl = () => fetch('/api/v1/export');\n");
    expect(checkHookRequestJson(base, new Set([rel]))).toBe(0);

    write(rel, "export const dl = () => requestJson('/api/v1/export');\n");
    expect(checkHookRequestJson(base, new Set([rel]))).toBe(1);
    expect(errors()).toContain(`- ${rel}`);
  });

  it('REFUSES (2) when the hooks directory is missing', () => {
    expect(checkHookRequestJson(base, NONE)).toBe(2);
    expect(errors()).toContain(HOOKS);
  });

  it('REFUSES (2) when the hooks directory holds no source file', () => {
    write(`${HOOKS}/README.md`, '# hooks\n');
    expect(checkHookRequestJson(base, NONE)).toBe(2);
  });
});

describe('findViolations', () => {
  it('reports every raw fetch in a file, each at its own line', () => {
    const src = "fetch('/api/v1/a');\nconst x = 1;\nfetch(\n  \"/api/v1/b\");\n";
    expect(findViolations(src, 'x.ts').map((v) => v.line)).toEqual([1, 3]);
  });
});
