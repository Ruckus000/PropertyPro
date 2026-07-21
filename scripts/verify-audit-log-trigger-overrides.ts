/**
 * Audit-log trigger overrides are privileged maintenance operations. The
 * append-only guard must never be disabled outside the three approved,
 * transaction-scoped maintenance paths below.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const approvedFiles = [
  'apps/web/__tests__/integration/helpers/multi-tenant-test-kit.ts',
  'apps/web/__tests__/elections/vote-integration.test.ts',
  'packages/db/src/seed/seed-community.ts',
].map((file) => resolve(repoRoot, file));

const overridePattern = /ALTER\s+TABLE\s+compliance_audit_log\s+(?:DISABLE|ENABLE)\s+TRIGGER\s+compliance_audit_log_append_only_guard/gi;

for (const file of approvedFiles) {
  const source = readFileSync(file, 'utf8');
  if (!overridePattern.test(source)) {
    throw new Error(`Approved audit-log maintenance file no longer overrides the trigger: ${file}`);
  }
  overridePattern.lastIndex = 0;
  if (!source.includes('pg_advisory_xact_lock')) {
    throw new Error(`Audit-log trigger override must use pg_advisory_xact_lock: ${file}`);
  }
}

const output = execFileSync(
  'rg',
  [
    '-l',
    '--glob',
    '!packages/db/migrations/**',
    'ALTER TABLE compliance_audit_log (DISABLE|ENABLE) TRIGGER compliance_audit_log_append_only_guard',
    'apps',
    'packages',
  ],
  { cwd: repoRoot, encoding: 'utf8' },
);
const discoveredFiles = output
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((file) => resolve(repoRoot, file));

const unexpectedFiles = discoveredFiles.filter((file) => !approvedFiles.includes(file));
if (unexpectedFiles.length > 0) {
  throw new Error(`Unauthorized compliance_audit_log trigger override(s):\n${unexpectedFiles.join('\n')}`);
}

console.log(`Audit-log trigger override guard passed (${approvedFiles.length} approved paths).`);
