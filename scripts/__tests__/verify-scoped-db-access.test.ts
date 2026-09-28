import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  checkScopedDbAccess,
  collectViolationsForFile,
  runAppGuard,
  type AppGuardConfig,
} from '../verify-scoped-db-access';

/**
 * Self-test for `pnpm guard:db-access` (roadmap 2.10). The hazard it pins: a
 * missing app directory used to print SKIP and return 0, so a moved
 * `apps/admin` would have passed having scanned nothing.
 */
let base: string;
const config = (appDir: string): AppGuardConfig => ({
  appDir,
  mode: 'scoped',
  unsafeAllowlist: new Set<string>(),
  usedUnsafe: new Set<string>(),
});

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'db-access-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(base, { recursive: true, force: true });
});

describe('collectViolationsForFile', () => {
  it('flags a direct drizzle import and a db-source import, and allows the scoped client', () => {
    const file = join(base, 'x.ts');
    writeFileSync(
      file,
      "import { eq } from 'drizzle-orm';\n" +
        "import { users } from '@propertypro/db/src/schema';\n" +
        "import { createScopedClient } from '@propertypro/db';\n",
    );
    expect(collectViolationsForFile(file, config(base)).map((v) => v.code)).toEqual(['DB001', 'DB002']);
  });
});

describe('runAppGuard', () => {
  it('fails (1) on an app directory containing a violation', () => {
    writeFileSync(join(base, 'x.ts'), "import { sql } from 'drizzle-orm';\n");
    expect(runAppGuard(config(base))).toBe(1);
  });

  it('passes (0) on a clean app directory', () => {
    writeFileSync(join(base, 'x.ts'), "import { createScopedClient } from '@propertypro/db';\n");
    expect(runAppGuard(config(base))).toBe(0);
  });

  it('REFUSES (2) when the app directory is missing — it used to SKIP with 0', () => {
    expect(runAppGuard(config(join(base, 'nope')))).toBe(2);
  });

  it('REFUSES (2) when the app directory holds no source files', () => {
    mkdirSync(join(base, 'empty'));
    expect(runAppGuard(config(join(base, 'empty')))).toBe(2);
  });
});

describe('checkScopedDbAccess', () => {
  it('passes on the real repository', async () => {
    expect(await checkScopedDbAccess()).toBe(0);
  });
});
