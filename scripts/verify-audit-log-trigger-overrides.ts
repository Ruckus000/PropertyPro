/**
 * Audit-log trigger overrides are privileged maintenance operations. The
 * append-only guard must never be disabled outside the approved,
 * transaction-scoped maintenance paths in `lib/audit-log-trigger-approved-files.ts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIT_LOG_TRIGGER_APPROVED_FILES } from './lib/audit-log-trigger-approved-files';
import { parseRootArg, RootArgError } from './lib/root-arg';

/**
 * The tree to scan. Defaults to this repo.
 *
 * `--root <dir>` exists for the test suite, which must not plant fixture files
 * inside the real `apps/` or `packages/`: other guards' tests walk those trees
 * at the same time in parallel vitest workers, and a file appearing and
 * vanishing mid-walk made `guard:call-ceilings` list a file it could then no
 * longer read (exit 2, "could not check"), in a test that has nothing to do
 * with this one. Tests build a fixture tree in a temp directory instead. The
 * approved paths are resolved against the same root, so a fixture tree must
 * carry them too. A mistyped `--root` refuses (exit 2); see `lib/root-arg.ts`.
 */
function resolveRoot(argv: readonly string[]): string {
  try {
    return parseRootArg(argv) ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  } catch (err) {
    if (err instanceof RootArgError) refuse(err.message);
    throw err;
  }
}

function refuse(message: string): never {
  console.error(`${message}\nUsage: verify-audit-log-trigger-overrides.ts [--root <dir>]`);
  process.exit(2);
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

const root = resolveRoot(process.argv.slice(2));
// Assert the search roots exist before reporting anything: a missing tree is
// "could not check" (exit 2), not a violation (exit 1) and not a pass.
for (const dir of ['apps', 'packages']) {
  if (!isDirectory(resolve(root, dir))) refuse(`Cannot check: ${resolve(root, dir)} is missing or not a directory.`);
}
const approvedFiles = AUDIT_LOG_TRIGGER_APPROVED_FILES.map((file) => resolve(root, file));

const overridePattern = /ALTER\s+TABLE\s+compliance_audit_log\s+(?:DISABLE|ENABLE)\s+TRIGGER\s+compliance_audit_log_append_only_guard/i;

for (const file of approvedFiles) {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch (err) {
    // A missing approved file means the list or the root is wrong: could not
    // check (2), not an unauthorized override (1).
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') refuse(`Cannot check: approved file ${file} is missing.`);
    throw err;
  }
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
