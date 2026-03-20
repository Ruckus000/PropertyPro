/**
 * Phase 5 Test Doctrine: No-Mock Guard for Integration Tests
 *
 * Verifies that integration test files do not use vi.mock(), jest.mock(),
 * or related mocking APIs to mock first-party modules.
 *
 * Files on the LEGACY_ALLOWLIST are exempt — these are pre-existing tests
 * that must be migrated to use shared test providers (WS 65).
 * The allowlist should shrink to zero as migration completes.
 *
 * Scope matches vitest integration configs exactly:
 *   - apps/web/__tests__/**\/*integration.test.ts
 *   - packages/db/__tests__/**\/*.integration.test.ts
 *   - apps/admin/__tests__/**\/*integration.test.ts
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
 *   - admin: vitest.integration.config.ts includes `**\/*.integration.test.ts` (requires dot before "integration")
 */
const SCAN_ROOTS = [
  { dir: join(repoRoot, 'apps/web/__tests__'), pattern: /integration\.test\.ts$/ },
  { dir: join(repoRoot, 'packages/db/__tests__'), pattern: /\.integration\.test\.ts$/ },
  { dir: join(repoRoot, 'apps/admin/__tests__'), pattern: /\.integration\.test\.ts$/ },
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
 * Pre-existing integration tests that use vi.mock and must be migrated
 * to shared test providers as part of Workstream 65.
 *
 * Each entry: relative path from repo root → reason for allowlisting.
 * Remove entries as tests are migrated. WS 65 DoD: this list is empty.
 */
const LEGACY_ALLOWLIST = new Map<string, string>([
  // Web integration tests — all mock @/lib/api/auth at minimum
  ['apps/web/__tests__/integration/multi-tenant-routes.integration.test.ts',
    'LEGACY: mocks auth, email, admin client, DB partial'],
  ['apps/web/__tests__/integration/multi-tenant-isolation.integration.test.ts',
    'LEGACY: mocks auth, middleware'],
  ['apps/web/__tests__/integration/multi-tenant-access-policy.integration.test.ts',
    'LEGACY: mocks auth'],
  ['apps/web/__tests__/integration/rls-validation.integration.test.ts',
    'LEGACY: mocks auth'],
  ['apps/web/__tests__/integration/document-upload-flow.integration.test.ts',
    'LEGACY: mocks auth, DB partial, notifications, PDF'],
  ['apps/web/__tests__/integration/compliance-lifecycle.integration.test.ts',
    'LEGACY: mocks auth, notifications, PDF'],
  ['apps/web/__tests__/integration/announcements-crud.integration.test.ts',
    'LEGACY: mocks auth, announcement delivery, notifications'],
  ['apps/web/__tests__/integration/meeting-deadlines.integration.test.ts',
    'LEGACY: mocks auth, notifications, PDF'],
  ['apps/web/__tests__/integration/calendar-phase2a.integration.test.ts',
    'LEGACY: mocks auth, notifications — Phase 2A calendar stack'],
  ['apps/web/__tests__/integration/onboarding-flow.integration.test.ts',
    'LEGACY: mocks auth, email'],
  ['apps/web/__tests__/integration/onboarding-flow-condo.integration.test.ts',
    'LEGACY: mocks auth'],
  ['apps/web/__tests__/integration/feature-flag-enforcement.integration.test.ts',
    'LEGACY: mocks auth'],
  // Billing integration test — lives outside __tests__/integration/ directory
  ['apps/web/__tests__/billing/subscription-guard-integration.test.ts',
    'LEGACY: mocks DB unsafe, admin client, auth — deep refactor needed'],
  // Admin integration test
  ['apps/admin/__tests__/integration/site-blocks-crud.integration.test.ts',
    'LEGACY: mocks auth — migrate to test auth provider'],
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

  // Skip allowlisted files
  if (LEGACY_ALLOWLIST.has(relPath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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

  for (const { dir, pattern } of SCAN_ROOTS) {
    const files = collectFiles(dir, pattern);
    totalFiles += files.length;

    for (const file of files) {
      const violations = scanFile(file);
      if (violations.length > 0) {
        allViolations.push(...violations);
        totalViolations += violations.length;
      }
    }
  }

  // Report allowlist status
  const allowlistSize = LEGACY_ALLOWLIST.size;
  console.log(`\nScanned: ${totalFiles} integration test files`);
  console.log(`Legacy allowlist: ${allowlistSize} files (burn-down target: 0)`);

  if (allowlistSize > 0) {
    console.log('\n📋 Allowlisted files (migrate to test providers):');
    for (const [file, reason] of LEGACY_ALLOWLIST) {
      // Check if file actually exists (may have been migrated/renamed)
      const fullPath = resolve(repoRoot, file);
      try {
        statSync(fullPath);
        console.log(`  ⏳ ${file}`);
        console.log(`     ${reason}`);
      } catch {
        console.log(`  ⚠️  ${file} (FILE NOT FOUND — remove from allowlist)`);
      }
    }
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
