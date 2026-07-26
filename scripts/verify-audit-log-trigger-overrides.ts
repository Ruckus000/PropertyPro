/**
 * Audit-log trigger overrides are privileged maintenance operations. The
 * append-only guard must never be disabled outside the three approved,
 * transaction-scoped maintenance paths below.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const approvedFiles = [
  'apps/web/__tests__/integration/helpers/multi-tenant-test-kit.ts',
  'apps/web/__tests__/elections/vote-integration.test.ts',
  'packages/db/__tests__/reconcile-auth-user-id.integration.test.ts',
  'packages/db/src/seed/seed-community.ts',
].map((file) => resolve(repoRoot, file));

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
 * `packages/db/src/seed/seed-community.ts`) into compiled chunks, so a local
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
      if (SKIP_DIR_NAMES.has(entry.name) || path === resolve(repoRoot, 'packages/db/migrations')) {
        continue;
      }
      files.push(...findSourceFiles(path));
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const discoveredFiles = [resolve(repoRoot, 'apps'), resolve(repoRoot, 'packages')]
  .flatMap(findSourceFiles)
  .filter((file) => overridePattern.test(readFileSync(file, 'utf8')));

const unexpectedFiles = discoveredFiles.filter((file) => !approvedFiles.includes(file));
if (unexpectedFiles.length > 0) {
  throw new Error(`Unauthorized compliance_audit_log trigger override(s):\n${unexpectedFiles.join('\n')}`);
}

console.log(`Audit-log trigger override guard passed (${approvedFiles.length} approved paths).`);
