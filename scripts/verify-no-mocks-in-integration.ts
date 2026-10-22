/**
 * Phase 5 Test Doctrine: No-Mock Guard for Integration Tests
 *
 * Verifies that integration test files do not use vi.mock(), jest.mock(),
 * or related mocking APIs to mock first-party modules.
 *
 * The sanctioned stand-ins live in ONE place: `setup-integration.ts`, backed by
 * `apps/web/__tests__/integration/providers/`. It supplies the session (the kit's
 * current actor, or `setSignedOut` for a 401), Supabase Auth admin, storage
 * presigning, and capture sinks for notifications, announcement fan-out and PDF
 * extraction. That file is not scanned (it is not a test file), so a test file
 * that needs nothing else carries no mocking call of its own.
 *
 * Files on the LEGACY_ALLOWLIST are exempt. An entry FAILS the guard once its
 * file is gone or no longer mocks anything, so the list can only shrink, and
 * cannot be left behind to excuse a future mock in a migrated file.
 *
 * Scope matches vitest integration configs exactly:
 *   - apps/web/__tests__/**\/*integration.test.ts
 *   - packages/db/__tests__/**\/*.integration.test.ts
 *
 * apps/admin is NOT scanned. It has no integration config and no integration
 * tests: `apps/admin/vitest.integration.config.ts` was deleted on 2026-08-05
 * because its `include` glob was written relative to the repo root inside an
 * app-root config, so it could never match, and no script or workflow ever
 * invoked it. If admin gains integration tests, add a working config and put
 * the root back here.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Glob-equivalent directories to scan for integration test files.
 *
 * Patterns mirror their respective vitest integration configs exactly:
 *   - web:   vitest.integration.config.ts includes `**\/*integration.test.ts` (any char before "integration")
 *   - db:    vitest.integration.config.ts includes `**\/*.integration.test.ts` (requires dot before "integration")
 */
const SCAN_ROOTS = [
  { dir: join(repoRoot, 'apps/web/__tests__'), pattern: /integration\.test\.ts$/ },
  { dir: join(repoRoot, 'packages/db/__tests__'), pattern: /\.integration\.test\.ts$/ },
];

/** Forbidden patterns in integration test files */
const FORBIDDEN_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /vi\.mock\s*\(/, label: 'vi.mock()' },
  { regex: /jest\.mock\s*\(/, label: 'jest.mock()' },
  { regex: /\.mockImplementation\s*\(/, label: '.mockImplementation()' },
  { regex: /\.mockReturnValue\s*\(/, label: '.mockReturnValue()' },
  { regex: /\.mockResolvedValue\s*\(/, label: '.mockResolvedValue()' },
  { regex: /\.mockRejectedValue\s*\(/, label: '.mockRejectedValue()' },
  { regex: /vi\.hoisted\s*\(/, label: 'vi.hoisted()' },
  { regex: /vi\.spyOn\s*\(/, label: 'vi.spyOn()' },
];

/**
 * LEGACY ALLOWLIST
 *
 * Pre-existing integration tests that still use a mocking API.
 *
 * Each entry: relative path from repo root → reason for allowlisting.
 * Remove entries as tests are migrated (a stale entry fails the guard).
 * WS 65 DoD: this list is empty.
 */
const LEGACY_ALLOWLIST = new Map<string, string>([
  // Both remaining entries stub Stripe, which has no test seam: the two call
  // sites build their client straight from STRIPE_SECRET_KEY
  // (`lib/services/stripe-service.ts`, `lib/billing/volume-discounts.ts`), and
  // on Node the SDK sends through its own NodeHttpClient, not global fetch, so a
  // `vi.stubGlobal('fetch')` boundary stub cannot reach it either. Draining
  // them needs a production seam first (an injectable client or a configurable
  // API host), not a test-side change.
  ['apps/web/__tests__/api/pm-communities-gated.integration.test.ts',
    'LEGACY: stubs Stripe checkout (no seam), plus auth, billing-group-service, PM check, subdomain check'],
  ['apps/web/__tests__/billing/billing-group-service.integration.test.ts',
    'LEGACY: stubs Stripe volume-discount sync (no seam); the tier recalculation and DB writes are real'],
]);

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

interface Violation {
  file: string; // relative to repo root
  line: number;
  pattern: string;
}

function collectFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];

  function walk(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return; // directory doesn't exist yet
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile() && pattern.test(entry)) {
          results.push(fullPath);
        }
      } catch {
        // skip inaccessible files
      }
    }
  }

  walk(dir);
  return results;
}

function scanFile(filePath: string): Violation[] {
  const violations: Violation[] = [];
  const relPath = relative(repoRoot, filePath);
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip comment lines
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) {
      continue;
    }

    for (const { regex, label } of FORBIDDEN_PATTERNS) {
      if (regex.test(line)) {
        violations.push({
          file: relPath,
          line: i + 1,
          pattern: label,
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('🔍 No-Mock Integration Test Guard');
  console.log('='.repeat(60));

  let totalFiles = 0;
  let totalViolations = 0;
  const allViolations: Violation[] = [];
  /** Allowlisted files that no longer use a mocking API — the entry is stale. */
  const cleanAllowlisted: string[] = [];
  const scannedPaths = new Set<string>();

  for (const { dir, pattern } of SCAN_ROOTS) {
    try {
      statSync(dir);
    } catch {
      console.error(`\n❌ Scan root missing: ${relative(repoRoot, dir)} — refusing to report a clean scan.`);
      process.exit(2);
    }
    const files = collectFiles(dir, pattern);
    totalFiles += files.length;

    for (const file of files) {
      const relPath = relative(repoRoot, file);
      scannedPaths.add(relPath);
      const violations = scanFile(file);
      if (LEGACY_ALLOWLIST.has(relPath)) {
        if (violations.length === 0) cleanAllowlisted.push(relPath);
        continue;
      }
      if (violations.length > 0) {
        allViolations.push(...violations);
        totalViolations += violations.length;
      }
    }
  }

  if (totalFiles === 0) {
    console.error('\n❌ Scanned 0 integration test files — refusing to report a clean scan.');
    process.exit(2);
  }

  // The allowlist may only shrink, and only truthfully: an entry whose file is
  // gone (or no longer matches the integration glob), or whose file no longer
  // mocks anything, must be deleted rather than left to excuse a future mock.
  const missingAllowlisted = [...LEGACY_ALLOWLIST.keys()].filter((file) => !scannedPaths.has(file));

  // Report allowlist status
  const allowlistSize = LEGACY_ALLOWLIST.size;
  console.log(`\nScanned: ${totalFiles} integration test files`);
  console.log(`Legacy allowlist: ${allowlistSize} files (burn-down target: 0)`);

  if (allowlistSize > 0) {
    console.log('\n📋 Allowlisted files (migrate to test providers):');
    for (const [file, reason] of LEGACY_ALLOWLIST) {
      console.log(`  ⏳ ${file}`);
      console.log(`     ${reason}`);
    }
  }

  if (missingAllowlisted.length > 0 || cleanAllowlisted.length > 0) {
    console.log('\n❌ Stale LEGACY_ALLOWLIST entries — delete them:\n');
    for (const file of missingAllowlisted) {
      console.log(`  ${file} — not a scanned integration test file (deleted, renamed, or outside the glob)`);
    }
    for (const file of cleanAllowlisted) {
      console.log(`  ${file} — no longer uses a mocking API`);
    }
    process.exit(1);
  }

  if (allViolations.length > 0) {
    console.log(`\n❌ ${totalViolations} violation(s) found:\n`);
    for (const v of allViolations) {
      console.log(`  ${v.file}:${v.line} — ${v.pattern}`);
    }
    console.log('\nIntegration tests must not use mocking APIs.');
    console.log('Use shared test providers from __tests__/integration/providers/ instead.');
    console.log('If migrating a legacy test, add it to LEGACY_ALLOWLIST temporarily.');
    process.exit(1);
  }

  console.log(`\n✅ No violations found in ${totalFiles - allowlistSize} non-allowlisted integration test files.`);

  if (allowlistSize > 0) {
    console.log(`\n⚠️  ${allowlistSize} legacy files still need migration.`);
  }

  process.exit(0);
}

main();
