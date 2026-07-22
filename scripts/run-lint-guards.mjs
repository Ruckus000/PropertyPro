#!/usr/bin/env node
/**
 * Concurrent lint-guard runner (INF-05).
 *
 * Replaces the serial `pnpm guard:a && pnpm guard:b && …` chain in the root
 * `lint` script. The guards are independent read-only checks, so running them
 * concurrently cuts the lint job's wall-clock (each was a cold `tsx` process).
 *
 * Fail-fast semantics are PRESERVED, not weakened: every guard runs, and the
 * process exits non-zero if ANY guard fails — the same overall pass/fail the
 * `&&` chain produced. Each guard's output is buffered and printed as a group
 * so concurrent logs don't interleave; failures are printed last and summarized.
 *
 * Ordering note: this list must stay in sync with the `guard:*` scripts wired
 * into the root `lint` script in package.json.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';

const GUARDS = [
  'guard:db-access',
  'guard:token-freshness',
  'guard:breadcrumbs',
  'guard:operations-routes',
  'guard:sentry-instrumentation',
  'guard:component-api-calls',
  'guard:hook-requestjson',
  'guard:authz-comments',
  'guard:component-service-imports',
  'guard:route-table-imports',
  'guard:contracts',
  'guard:tenant-scope',
  'guard:help-content',
  'guard:legacy-roles',
  'guard:token-coverage',
  'guard:design-tokens',
  'guard:page-padding',
  'guard:audit-log-trigger-overrides',
  'guard:sanitizer-deps',
];

// Cap concurrency so 16 cold tsx processes don't thrash a small CI runner.
const CONCURRENCY = Math.max(2, Math.min(8, (cpus().length || 4)));

/** Run one `pnpm <script>`, buffering combined stdout/stderr. */
function runGuard(script) {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['run', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('error', (err) => resolve({ script, code: 1, output: `${output}\n${err.message}` }));
    child.on('close', (code) => resolve({ script, code: code ?? 1, output }));
  });
}

async function main() {
  const queue = [...GUARDS];
  const results = [];

  async function worker() {
    for (;;) {
      const script = queue.shift();
      if (script === undefined) return;
      const started = Date.now();
      const res = await runGuard(script);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      // eslint-disable-next-line no-console
      console.log(`${res.code === 0 ? '✅' : '❌'} ${script} (${secs}s)`);
      results.push(res);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const failures = results.filter((r) => r.code !== 0);
  if (failures.length > 0) {
    for (const f of failures) {
      // eslint-disable-next-line no-console
      console.error(`\n──────── ${f.script} FAILED ────────\n${f.output.trimEnd()}`);
    }
    // eslint-disable-next-line no-console
    console.error(`\n❌ ${failures.length} guard(s) failed: ${failures.map((f) => f.script).join(', ')}`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`\n✅ All ${GUARDS.length} guards passed.`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
