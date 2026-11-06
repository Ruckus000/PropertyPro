/**
 * Standard runner for one-shot ops scripts that talk to the DB via
 * `createUnscopedClient`.
 *
 * Why this exists:
 *   `createUnscopedClient` returns a singleton postgres-js pool that is
 *   created at module load. Without an explicit `closeUnscopedClient()`
 *   the pool keeps the Node event loop alive after `main()` returns, and
 *   the process hangs forever at 0% CPU. Block-buffered stdout never
 *   flushes when piped/redirected, so the symptom is "zero output, no
 *   exit, must SIGTERM" — easy to mistake for a deadlock at import or
 *   first query.
 *
 *   Every ops script that reaches for the unscoped client must therefore
 *   close it AND force an explicit exit. Centralizing that here removes
 *   the per-script boilerplate and the per-script footgun.
 *
 * Usage:
 *   import { runOpsScript } from './lib/run-ops-script';
 *
 *   async function run() { … your work … }
 *
 *   void runOpsScript({ name: 'sync-stripe-lookup-keys', url: import.meta.url, run });
 *
 * Throw an `Error` from `run` to exit non-zero. Anything else returns 0.
 *
 * The entrypoint check is preserved so that importing the script from a test
 * or another tool does not auto-execute it. It uses `isMainModule`, which
 * realpath-resolves both sides: the bare `import.meta.url === argv[1]` form
 * silently skipped `run` when the script was invoked through a symlink or a
 * path with a space, exiting having done nothing.
 */
import { isMainModule } from './is-main-module';
// AUTHZ: CLI/seed script — runs out-of-band of tenant scoping with explicit operator authorization.
import { closeUnscopedClient } from '@propertypro/db/unsafe';

export interface RunOpsScriptConfig {
  /** Short identifier prefixed onto error logs. Match the script's filename. */
  name: string;
  /** Pass `import.meta.url` from the calling script. */
  url: string;
  /** The work to perform. Throw to exit non-zero. */
  run: () => Promise<void>;
}

export async function runOpsScript(config: RunOpsScriptConfig): Promise<void> {
  if (!isMainModule(config.url)) return;

  let exitCode = 0;
  try {
    await config.run();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[${config.name}] failed:`, error);
    exitCode = 1;
  }

  try {
    await closeUnscopedClient();
  } catch (cleanupError) {
    // eslint-disable-next-line no-console
    console.error(`[${config.name}] cleanup failed:`, cleanupError);
    if (exitCode === 0) exitCode = 1;
  }

  process.exit(exitCode);
}
