/**
 * Audit-log trigger overrides are privileged maintenance operations. The
 * append-only guard must never be disabled outside the three approved,
 * transaction-scoped maintenance paths below.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The tree to scan. Defaults to this repo.
 *
 * `--root <dir>` exists for the test suite, which must not plant fixture files
 * inside the real `apps/` or `packages/`: other guards' tests walk those trees
 * at the same time in parallel vitest workers, and a file appearing and
 * vanishing mid-walk made `guard:call-ceilings` list a file it could then no
 * longer read (exit 2, "could not check"), in a test that has nothing to do
 * with this one. Tests build a fixture tree in a temp directory instead. The
 * approved paths below are resolved against the same root, so a fixture tree
 * must carry them too.
 */
function resolveRoot(argv: readonly string[]): string {
  const index = argv.indexOf('--root');
  if (index === -1) return resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    // A bare `--root` must not fall back to the repo: the caller asked to scan
    // somewhere else, and quietly scanning here instead would pass for the
    // wrong reason.
    console.error('Usage: verify-audit-log-trigger-overrides.ts [--root <dir>]');
    process.exit(2);
  }
  return resolve(value);
}

const root = resolveRoot(process.argv.slice(2));
const approvedFiles = [
  'apps/web/__tests__/integration/helpers/multi-tenant-test-kit.ts',
  'apps/web/__tests__/elections/vote-integration.test.ts',
  'packages/db/__tests__/reconcile-auth-user-id.integration.test.ts',
  'packages/db/src/seed/community/users.ts',
].map((file) => resolve(root, file));

const overridePattern = /ALTER\s+TABLE\s+compliance_audit_log\s+(?:DISABLE|ENABLE)\s+TRIGGER\s+compliance_audit_log_append_only_guard/i;

for (const file of approvedFiles) {
  const source = readFileSync(file, 'utf8');
  if (!overridePattern.test(source)) {
    throw new Error(`Approved audit-log maintenance file no longer overrides the trigger: ${file}`);
  }
  if (!source.includes('pg_advisory_xact_lock')) {
    throw new Error(`Audit-log trigger override must use pg_advisory_xact_lock: ${file}`);
  }
}

/**
 * Build output must never be scanned. Bundlers inline approved source (e.g.
 * `packages/db/src/seed/community/users.ts`) into compiled chunks, so a local
 * `pnpm build` would otherwise surface artifacts such as
 * `apps/admin/.next/server/app/api/admin/demos/route.js` as "unauthorized"
 * overrides and fail `pnpm lint` for anyone who has built.
 * Excluded: node_modules, .next, dist, build, .turbo, .vercel, coverage.
 */
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.vercel',
  'coverage',
]);

function findSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name) || path === resolve(root, 'packages/db/migrations')) {
        continue;
      }
      files.push(...findSourceFiles(path));
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const discoveredFiles = [resolve(root, 'apps'), resolve(root, 'packages')]
  .flatMap(findSourceFiles)
  .filter((file) => overridePattern.test(readFileSync(file, 'utf8')));

const unexpectedFiles = discoveredFiles.filter((file) => !approvedFiles.includes(file));
if (unexpectedFiles.length > 0) {
  throw new Error(`Unauthorized compliance_audit_log trigger override(s):\n${unexpectedFiles.join('\n')}`);
}

console.log(`Audit-log trigger override guard passed (${approvedFiles.length} approved paths).`);
