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
 * Files on BOUNDARY_ALLOWLIST are exempt: each stubs an external network
 * boundary that has no local test mode, and names it. An entry FAILS the guard
 * once its file is gone or no longer mocks anything, so it cannot be left
 * behind to excuse a future mock.
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
import { isMainModule } from './lib/is-main-module';

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
export const SCAN_ROOTS = [
  { dir: 'apps/web/__tests__', pattern: /integration\.test\.ts$/ },
  { dir: 'packages/db/__tests__', pattern: /\.integration\.test\.ts$/ },
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
 * Integration tests that stub an EXTERNAL network boundary with no local test
 * mode. Each entry: path from repo root -> the boundary it stubs. Everything
 * first-party runs for real in these files.
 *
 * Stripe is the only such boundary: there are no Stripe keys in CI or locally,
 * the client is built straight from STRIPE_SECRET_KEY, and on Node the SDK
 * sends through its own NodeHttpClient, so a `fetch` stub cannot reach it.
 *
 * ponytail: Stripe is stubbed per file. Trigger: a second integration file
 * needs a Stripe stub -> move it into providers/ like test-pdf-double.
 */
export const BOUNDARY_ALLOWLIST = new Map<string, string>([
  ['apps/web/__tests__/billing/billing-group-service.integration.test.ts',
    'stubs Stripe subscription sync (applyVolumeDiscountToSubscriptions); tier recalculation and DB writes are real'],
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

function scanFile(root: string, filePath: string): Violation[] {
  const violations: Violation[] = [];
  const relPath = relative(root, filePath);
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
// Check
// ---------------------------------------------------------------------------

/** 0 clean, 1 violations or stale allowlist entries, 2 could not check. */
export function checkNoMocksInIntegration(
  root: string = repoRoot,
  allowlist: ReadonlyMap<string, string> = BOUNDARY_ALLOWLIST,
): 0 | 1 | 2 {
  console.log('🔍 No-Mock Integration Test Guard');
  console.log('='.repeat(60));

  let totalFiles = 0;
  const allViolations: Violation[] = [];
  /** Allowlisted files that no longer use a mocking API: the entry is stale. */
  const cleanAllowlisted: string[] = [];
  const scannedPaths = new Set<string>();

  for (const { dir, pattern } of SCAN_ROOTS) {
    const absDir = join(root, dir);
    try {
      statSync(absDir);
    } catch {
      console.error(`\n❌ Scan root missing: ${dir} — refusing to report a clean scan.`);
      return 2;
    }
    const files = collectFiles(absDir, pattern);
    totalFiles += files.length;

    for (const file of files) {
      const relPath = relative(root, file);
      scannedPaths.add(relPath);
      const violations = scanFile(root, file);
      if (allowlist.has(relPath)) {
        if (violations.length === 0) cleanAllowlisted.push(relPath);
        continue;
      }
      allViolations.push(...violations);
    }
  }

  if (totalFiles === 0) {
    console.error('\n❌ Scanned 0 integration test files — refusing to report a clean scan.');
    return 2;
  }

  // An entry whose file is gone (or no longer matches the integration glob), or
  // whose file no longer mocks anything, must be deleted rather than left to
  // excuse a future mock.
  const missingAllowlisted = [...allowlist.keys()].filter((file) => !scannedPaths.has(file));

  console.log(`\nScanned: ${totalFiles} integration test files`);
  console.log(`Boundary allowlist: ${allowlist.size} file(s)`);
  for (const [file, reason] of allowlist) {
    console.log(`  ${file}`);
    console.log(`     ${reason}`);
  }

  if (missingAllowlisted.length > 0 || cleanAllowlisted.length > 0) {
    console.log('\n❌ Stale BOUNDARY_ALLOWLIST entries — delete them:\n');
    for (const file of missingAllowlisted) {
      console.log(`  ${file} — not a scanned integration test file (deleted, renamed, or outside the glob)`);
    }
    for (const file of cleanAllowlisted) {
      console.log(`  ${file} — no longer uses a mocking API`);
    }
    return 1;
  }

  if (allViolations.length > 0) {
    console.log(`\n❌ ${allViolations.length} violation(s) found:\n`);
    for (const v of allViolations) {
      console.log(`  ${v.file}:${v.line} — ${v.pattern}`);
    }
    console.log('\nIntegration tests must not use mocking APIs.');
    console.log('Use the shared stand-ins in setup-integration.ts / __tests__/integration/providers/.');
    console.log('Only an external network boundary with no test mode belongs on BOUNDARY_ALLOWLIST.');
    return 1;
  }

  console.log(`\n✅ No violations found in ${totalFiles - allowlist.size} non-allowlisted integration test files.`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exit(checkNoMocksInIntegration());
}
