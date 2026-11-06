import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@propertypro/db/unsafe', () => ({ closeUnscopedClient: vi.fn() }));

import { runOpsScript } from '../lib/run-ops-script';

// Fixtures live under the OS temp directory, never in the repo (see
// .claude/rules/verification.md: tests must not write inside the repo).
describe('runOpsScript', () => {
  let dir: string;
  let script: string;
  const originalArgv1 = process.argv[1];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'run-ops-script-'));
    script = join(dir, 'ops.ts');
    writeFileSync(script, '// fixture\n');
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    process.argv[1] = originalArgv1 as string;
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs a script invoked through a symlink, which the bare argv comparison skipped', async () => {
    const link = join(dir, 'linked-ops.ts');
    symlinkSync(script, link);
    process.argv[1] = link;
    const run = vi.fn().mockResolvedValue(undefined);

    await runOpsScript({ name: 'fixture', url: pathToFileURL(script).href, run });

    expect(run).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('does not run a script that was only imported', async () => {
    process.argv[1] = join(dir, 'some-other-entrypoint.ts');
    writeFileSync(process.argv[1], '// another file\n');
    const run = vi.fn();

    await runOpsScript({ name: 'fixture', url: pathToFileURL(script).href, run });

    expect(run).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });
});
