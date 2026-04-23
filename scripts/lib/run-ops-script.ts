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
 *   import { pathToFileURL } from 'node:url';
 *   import { runOpsScript } from './lib/run-ops-script';
 *
 *   async function run() { … your work … }
 *
 *   void runOpsScript({ name: 'sync-stripe-lookup-keys', url: import.meta.url, run });
 *
 * Throw an `Error` from `run` to exit non-zero. Anything else returns 0.
 *
 * The entrypoint check (comparing `import.meta.url` to argv[1]) is preserved
 * so that importing the script from a test or another tool does not
 * auto-execute it.
 */
import { pathToFileURL } from 'node:url';
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
  const isEntrypoint = process.argv[1]
    ? config.url === pathToFileURL(process.argv[1]).href
    : false;
  if (!isEntrypoint) return;

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
