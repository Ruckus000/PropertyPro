#!/usr/bin/env tsx
/**
 * Integration Test Discovery Guard
 *
 * Ensures all integration tests follow the naming convention required by
 * vitest.integration.config.ts (*.integration.test.ts|tsx).
 *
 * This prevents silent test exclusion where a misnamed integration test
 * is skipped by the integration config and appears as "skipped" in the
 * default test suite instead of running with database backing.
 *
 * Exit codes:
 *  0 - All integration tests correctly named
 *  1 - Found misnamed integration tests
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const INTEGRATION_DIR = join(
  process.cwd(),
  'apps',
  'web',
  '__tests__',
  'integration',
);

const REQUIRED_SUFFIX_PATTERN = /\.integration\.test\.(ts|tsx)$/;
const HELPERS_DIR = 'helpers';

interface MisnamedFile {
  file: string;
  suggestedName: string;
}

async function scanIntegrationTests(): Promise<MisnamedFile[]> {
  const misnamed: MisnamedFile[] = [];

  try {
    const entries = await readdir(INTEGRATION_DIR, { withFileTypes: true });

    for (const entry of entries) {
      // Skip directories (including helpers/)
      if (entry.isDirectory()) {
        continue;
      }

      // Skip non-test files
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) {
        continue;
      }

      // Check if file matches required pattern
      if (!REQUIRED_SUFFIX_PATTERN.test(entry.name)) {
        const suggestedName = entry.name.replace(
          /\.test\.(ts|tsx)$/,
          '.integration.test.$1',
        );
        misnamed.push({
          file: entry.name,
          suggestedName,
        });
      }
    }
  } catch (error) {
    console.error(`❌ Failed to scan ${INTEGRATION_DIR}:`, error);
    process.exit(1);
  }

  return misnamed;
}

async function main() {
  console.log('🔍 Checking integration test naming convention...');

  const misnamed = await scanIntegrationTests();

  if (misnamed.length === 0) {
    console.log('✅ All integration tests correctly named');
    process.exit(0);
  }

  console.error('\n❌ Found misnamed integration tests:\n');
  console.error(
    'Integration tests must match *.integration.test.ts|tsx to be discovered by vitest.integration.config.ts\n',
  );

  for (const { file, suggestedName } of misnamed) {
    console.error(`  ❌ ${file}`);
    console.error(`  ✅ Should be: ${suggestedName}\n`);
  }

  console.error(`\n💡 Fix with:\n`);
  for (const { file, suggestedName } of misnamed) {
    console.error(
      `  git mv apps/web/__tests__/integration/${file} apps/web/__tests__/integration/${suggestedName}`,
    );
  }

  process.exit(1);
}

main();
