import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkAuthzComments, checkFile } from '../verify-authz-comments';

/**
 * Self-test for `pnpm guard:authz-comments` (roadmap 2.5, DBB-03).
 *
 * Module specifiers are assembled at runtime so this file's own text never
 * contains a literal privileged import — the guard scans `scripts/` too.
 */
const UNSAFE = ['@propertypro', 'db', 'unsafe'].join('/');
const SERVICE_ROLE = ['@propertypro', 'db', 'supabase', 'admin'].join('/');
const REASON = '// AUTHZ: GoTrue admin API for the caller\'s own account';

const staticImport = (mod: string) => `import { x } from '${mod}';`;

describe('checkFile', () => {
  it('flags an unannotated service-role import outside apps/admin', () => {
    const r = checkFile('apps/web/src/lib/x.ts', staticImport(SERVICE_ROLE));
    expect(r.imports).toBe(1);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]!.message).toContain(SERVICE_ROLE);
  });

  it('accepts the same import once annotated', () => {
    const r = checkFile('apps/web/src/lib/x.ts', `${REASON}\n${staticImport(SERVICE_ROLE)}`);
    expect(r).toEqual({ imports: 1, violations: [] });
  });

  it('pins the roadmap cut: the service-role client needs no rationale under apps/admin', () => {
    const r = checkFile('apps/admin/src/lib/x.ts', staticImport(SERVICE_ROLE));
    expect(r).toEqual({ imports: 0, violations: [] });
  });

  it('still requires a rationale for /unsafe under apps/admin', () => {
    expect(checkFile('apps/admin/src/lib/x.ts', staticImport(UNSAFE)).violations).toHaveLength(1);
  });

  it('flags an unannotated DYNAMIC import (the demo-grace-guard shape)', () => {
    const src = `async function f() {\n  const { c } = await import('${UNSAFE}');\n}`;
    const r = checkFile('apps/web/src/lib/x.ts', src);
    expect(r.violations.map((v) => v.line)).toEqual([2]);
  });

  it('accepts a dynamic import annotated on the line above the call', () => {
    const src = `async function f() {\n  ${REASON}\n  const { c } = await import('${UNSAFE}');\n}`;
    expect(checkFile('apps/web/src/lib/x.ts', src).violations).toEqual([]);
  });

  it('ignores `typeof import(...)`, which reaches no client', () => {
    const src = `type Db = ReturnType<typeof import('${UNSAFE}').createUnscopedClient>;`;
    expect(checkFile('scripts/lib/x.ts', src)).toEqual({ imports: 0, violations: [] });
  });

  it('rejects a placeholder or too-short reason', () => {
    for (const bad of ['// AUTHZ: TODO', '// AUTHZ: short']) {
      expect(checkFile('apps/web/x.ts', `${bad}\n${staticImport(UNSAFE)}`).violations).toHaveLength(1);
    }
  });

  it('finds the import start of a multi-line import', () => {
    const src = `${REASON}\nimport {\n  a,\n  b,\n} from '${SERVICE_ROLE}';`;
    expect(checkFile('apps/web/x.ts', src).violations).toEqual([]);
  });
});

describe('checkAuthzComments', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'authz-comments-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('refuses (2) when a scan root is missing, rather than scanning nothing', () => {
    expect(checkAuthzComments(dir)).toBe(2);
  });

  it('passes on the real repository', () => {
    expect(checkAuthzComments()).toBe(0);
  });
});
