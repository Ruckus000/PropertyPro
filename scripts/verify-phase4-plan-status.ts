#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE_TASK_IDS = new Set([
  'P4-55',
  'P4-56',
  'P4-57',
  'P4-58',
  'P4-59',
  'P4-60',
  'P4-61',
  'P4-62',
  'P4-63',
  'P4-64',
]);

const BASE_DENOMINATOR = BASE_TASK_IDS.size;

function findDuplicates(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function collectBaseTaskIds(lines: string[], warnings: string[]): string[] {
  const startIndex = lines.findIndex((line) => line.trim() === 'Phase 4 base tasks:');
  if (startIndex === -1) {
    throw new Error('PHASE4_EXECUTION_PLAN.md: missing "Phase 4 base tasks:" list.');
  }

  const ids: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('Count check:')) {
      break;
    }

    const match = trimmed.match(/^- `([^`]+)`/);
    if (match) {
      ids.push(match[1]);
      continue;
    }

    if (trimmed.startsWith('- ') && trimmed.length > 2) {
      warnings.push(
        `PHASE4_EXECUTION_PLAN.md line ${i + 1}: list entry "${trimmed}" does not use expected backtick format (- \`ID\`).`,
      );
    }
  }

  return ids;
}

function verifyPhase4ExecutionPlan(content: string, errors: string[], warnings: string[]): void {
  const lines = content.split(/\r?\n/);

  const ratioMatchLine = lines.find((line) => /(\d+)\/(\d+)\s+base Phase 4 tasks complete/.test(line));
  if (!ratioMatchLine) {
    errors.push(
      'PHASE4_EXECUTION_PLAN.md: missing status ratio pattern "<completed>/<denominator> base Phase 4 tasks complete".',
    );
    return;
  }

  const ratioMatch = ratioMatchLine.match(/(\d+)\/(\d+)\s+base Phase 4 tasks complete/);
  if (!ratioMatch) {
    errors.push('PHASE4_EXECUTION_PLAN.md: unable to parse status ratio.');
    return;
  }

  const completedInStatus = Number.parseInt(ratioMatch[1], 10);
  const denominatorInStatus = Number.parseInt(ratioMatch[2], 10);

  if (denominatorInStatus !== BASE_DENOMINATOR) {
    errors.push(
      `PHASE4_EXECUTION_PLAN.md: status denominator is ${denominatorInStatus}, expected ${BASE_DENOMINATOR}.`,
    );
  }

  if (completedInStatus < 0 || completedInStatus > BASE_DENOMINATOR) {
    errors.push(
      `PHASE4_EXECUTION_PLAN.md: completed count ${completedInStatus} is outside expected range 0-${BASE_DENOMINATOR}.`,
    );
  }

  let baseTaskIds: string[] = [];
  try {
    baseTaskIds = collectBaseTaskIds(lines, warnings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown base task list parsing failure.';
    errors.push(message);
  }

  const invalidBaseIds = baseTaskIds.filter((id) => !BASE_TASK_IDS.has(id));
  if (invalidBaseIds.length > 0) {
    errors.push(
      `PHASE4_EXECUTION_PLAN.md: Phase 4 base task list contains unknown IDs: ${[
        ...new Set(invalidBaseIds),
      ].join(', ')}.`,
    );
  }

  const baseTaskDuplicates = findDuplicates(baseTaskIds);
  if (baseTaskDuplicates.length > 0) {
    errors.push(
      `PHASE4_EXECUTION_PLAN.md: duplicate Phase 4 base task IDs: ${baseTaskDuplicates.join(', ')}.`,
    );
  }

  const missingBaseIds = [...BASE_TASK_IDS].filter((id) => !baseTaskIds.includes(id)).sort();
  if (missingBaseIds.length > 0) {
    errors.push(`PHASE4_EXECUTION_PLAN.md: missing Phase 4 base task IDs: ${missingBaseIds.join(', ')}.`);
  }

  if (baseTaskIds.length !== BASE_DENOMINATOR) {
    errors.push(
      `PHASE4_EXECUTION_PLAN.md: Phase 4 base task list has ${baseTaskIds.length} entries, expected ${BASE_DENOMINATOR}.`,
    );
  }

  const countCheckLine = lines.find((line) => line.trim().startsWith('Count check:'));
  if (!countCheckLine) {
    errors.push('PHASE4_EXECUTION_PLAN.md: missing "Count check:" line.');
  } else {
    const countMatch = countCheckLine.match(
      /Count check:\s+(\d+)\s+completed\s+\+\s+(\d+)\s+remaining\s+=\s+(\d+)\s+base tasks\.?/,
    );
    if (!countMatch) {
      errors.push('PHASE4_EXECUTION_PLAN.md: unable to parse "Count check:" line.');
    } else {
      const completed = Number.parseInt(countMatch[1], 10);
      const remaining = Number.parseInt(countMatch[2], 10);
      const total = Number.parseInt(countMatch[3], 10);

      if (total !== BASE_DENOMINATOR) {
        errors.push(
          `PHASE4_EXECUTION_PLAN.md: count-check total is ${total}, expected ${BASE_DENOMINATOR}.`,
        );
      }

      if (completed + remaining !== total) {
        errors.push(
          `PHASE4_EXECUTION_PLAN.md: count-check arithmetic mismatch (${completed} + ${remaining} != ${total}).`,
        );
      }

      if (completed !== completedInStatus) {
        errors.push(
          `PHASE4_EXECUTION_PLAN.md: status says ${completedInStatus} completed, but count-check says ${completed}.`,
        );
      }
    }
  }

  if (!lines.some((line) => line.trim() === '## Gate 4 Checklist (Canonical Owner)')) {
    errors.push('PHASE4_EXECUTION_PLAN.md: missing "## Gate 4 Checklist (Canonical Owner)" section.');
  }

  const signoffBundleStart = lines.findIndex(
    (line) => line.trim() === 'Recommended pre-signoff command bundle (to finalize when Batch D/E land):',
  );
  if (signoffBundleStart === -1) {
    errors.push('PHASE4_EXECUTION_PLAN.md: missing recommended pre-signoff command bundle.');
  } else {
    const signoffWindow = lines.slice(signoffBundleStart, signoffBundleStart + 32).join('\n');
    if (signoffWindow.includes('set -a; source .env.local; set +a')) {
      errors.push(
        'PHASE4_EXECUTION_PLAN.md: pre-signoff command bundle must use `scripts/with-env-local.sh` instead of raw inline `.env.local` sourcing.',
      );
    }
    if (signoffWindow.includes('pnpm test:integration:preflight -- --coverage')) {
      errors.push(
        'PHASE4_EXECUTION_PLAN.md: avoid `pnpm test:integration:preflight -- --coverage`; `--coverage` only reaches the final chained command.',
      );
    }
    if (!signoffWindow.includes('scripts/with-env-local.sh pnpm --filter @propertypro/db db:migrate')) {
      errors.push(
        'PHASE4_EXECUTION_PLAN.md: pre-signoff command bundle must run DB migrate via `scripts/with-env-local.sh`.',
      );
    }
    if (!signoffWindow.includes('scripts/with-env-local.sh pnpm --filter @propertypro/db test:integration')) {
      errors.push(
        'PHASE4_EXECUTION_PLAN.md: pre-signoff command bundle must run DB integration tests via `scripts/with-env-local.sh`.',
      );
    }
    if (
      !signoffWindow.includes(
        'scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts --coverage',
      )
    ) {
      errors.push(
        'PHASE4_EXECUTION_PLAN.md: pre-signoff command bundle must run web integration coverage via `scripts/with-env-local.sh`.',
      );
    }
  }

  const exitSectionStart = lines.findIndex((line) => line.trim() === '## Phase 4 Exit Verification (Internal)');
  if (exitSectionStart === -1) {
    errors.push('PHASE4_EXECUTION_PLAN.md: missing "## Phase 4 Exit Verification (Internal)" section.');
  } else {
    const exitSection = lines.slice(exitSectionStart, exitSectionStart + 100).join('\n');
    if (exitSection.includes('set -a; source .env.local; set +a')) {
      errors.push(
        'PHASE4_EXECUTION_PLAN.md: Phase 4 exit verification must use `scripts/with-env-local.sh` instead of raw inline `.env.local` sourcing.',
      );
    }
    if (!exitSection.includes('scripts/with-env-local.sh')) {
      errors.push('PHASE4_EXECUTION_PLAN.md: exit verification must reference `scripts/with-env-local.sh`.');
    }
    if (!exitSection.includes('pnpm plan:verify:phase4')) {
      errors.push('PHASE4_EXECUTION_PLAN.md: exit verification must include `pnpm plan:verify:phase4`.');
    }
    if (!exitSection.includes('pnpm audit --audit-level=high')) {
      errors.push('PHASE4_EXECUTION_PLAN.md: exit verification must include `pnpm audit --audit-level=high`.');
    }
    if (!exitSection.includes('docs/audits/')) {
      errors.push('PHASE4_EXECUTION_PLAN.md: exit verification must reference `docs/audits/` evidence capture.');
    }
  }
}

function verifyPackageScripts(packageJson: string, errors: string[]): void {
  let parsed: { scripts?: Record<string, string> };
  try {
    parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
  } catch {
    errors.push('package.json: failed to parse JSON.');
    return;
  }

  const scripts = parsed.scripts ?? {};
  if (!scripts['plan:verify:phase4']) {
    errors.push('package.json: missing `plan:verify:phase4` script.');
  }
}

function main(): void {
  const root = process.cwd();
  const phase4PlanPath = join(root, 'PHASE4_EXECUTION_PLAN.md');
  const packageJsonPath = join(root, 'package.json');
  const strictWarnings = process.env.PHASE4_PLAN_VERIFY_STRICT === '1';

  const phase4Plan = readFileSync(phase4PlanPath, 'utf8');
  const packageJson = readFileSync(packageJsonPath, 'utf8');

  const errors: string[] = [];
  const warnings: string[] = [];
  verifyPhase4ExecutionPlan(phase4Plan, errors, warnings);
  verifyPackageScripts(packageJson, errors);

  if (warnings.length > 0) {
    console.warn('Warnings:');
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
    console.warn('');

    if (strictWarnings) {
      errors.push(
        `PHASE4_PLAN_VERIFY_STRICT=1 is set and ${warnings.length} warning(s) were emitted.`,
      );
    }
  }

  if (errors.length > 0) {
    console.error('Phase 4 plan consistency verification failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  const completedCountMatch = phase4Plan.match(/(\d+)\/(\d+)\s+base Phase 4 tasks complete/);
  const completedCount = completedCountMatch ? Number.parseInt(completedCountMatch[1], 10) : 0;

  console.log('Phase 4 plan consistency verification passed.');
  console.log(`- Completed tasks: ${completedCount}/${BASE_DENOMINATOR}`);
  console.log('- Task inventory/count checks: VERIFIED');
  console.log('- Exit verification section: VERIFIED');
  console.log('- Package scripts: VERIFIED');
}

main();
