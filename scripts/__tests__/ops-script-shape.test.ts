import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guard against the bug fixed in PR #137: ops scripts that grab the unscoped
 * Drizzle pool via `createUnscopedClient()` MUST also close it (or hand the
 * lifecycle off to `runOpsScript`). Without one of those, the postgres-js
 * pool keeps the Node event loop alive after `main()` returns and the
 * process hangs at 0% CPU until SIGTERM. Block-buffered stdout never
 * flushes, so the symptom is "zero output, no exit" — easy to misread as
 * a deadlock at import.
 *
 * This test reads each `scripts/*.ts` file as text and asserts that any
 * file importing `createUnscopedClient` either:
 *   (a) uses the canonical `runOpsScript` helper, OR
 *   (b) calls `closeUnscopedClient(` itself, OR
 *   (c) calls `process.exit(` (acceptable but leaks the pool at the OS layer
 *       — `runOpsScript` is preferred).
 */
const here = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(here, '..');

function listScriptFiles(): string[] {
  return readdirSync(SCRIPTS_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(SCRIPTS_DIR, name))
    .filter((path) => statSync(path).isFile());
}

describe('ops script lifecycle shape', () => {
  it('every scripts/*.ts that uses createUnscopedClient also closes the pool or runs through runOpsScript', () => {
    const offenders: Array<{ file: string; reason: string }> = [];

    for (const path of listScriptFiles()) {
      const src = readFileSync(path, 'utf8');
      const usesUnscopedClient = /createUnscopedClient\b/.test(src);
      if (!usesUnscopedClient) continue;

      const usesHelper = /from ['"]\.\/lib\/run-ops-script['"]/.test(src);
      const closesPool = /closeUnscopedClient\s*\(/.test(src);
      const callsExit = /process\.exit\s*\(/.test(src);

      if (!usesHelper && !closesPool && !callsExit) {
        offenders.push({
          file: path.slice(SCRIPTS_DIR.length + 1),
          reason:
            'imports createUnscopedClient but does not import runOpsScript, ' +
            'call closeUnscopedClient(), or call process.exit(). The pool will ' +
            'keep the event loop alive and the script will hang on exit.',
        });
      }
    }

    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });
});
