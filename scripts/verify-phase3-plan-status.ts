#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type TaskKind = 'base' | 'hardening';

type TaskDefinition = Readonly<{
  id: string;
  kind: TaskKind;
  countsTowardBase: boolean;
}>;

const TASK_DEFINITIONS: readonly TaskDefinition[] = Object.freeze([
  { id: 'P3-45', kind: 'base', countsTowardBase: true },
  { id: 'P3-46', kind: 'base', countsTowardBase: true },
  { id: 'P3-47', kind: 'base', countsTowardBase: true },
  { id: 'P3-48', kind: 'base', countsTowardBase: true },
  { id: 'P3-49', kind: 'base', countsTowardBase: true },
  { id: 'P3-50', kind: 'base', countsTowardBase: true },
  { id: 'P3-51', kind: 'base', countsTowardBase: true },
  { id: 'P3-52', kind: 'base', countsTowardBase: true },
  { id: 'P3-53', kind: 'base', countsTowardBase: true },
  { id: 'P3-54', kind: 'base', countsTowardBase: true },
  { id: 'P3-PRE-01', kind: 'hardening', countsTowardBase: false },
  { id: 'P3-PRE-02', kind: 'hardening', countsTowardBase: false },
  { id: 'P3-PRE-03', kind: 'hardening', countsTowardBase: false },
  { id: 'P3-PRE-04', kind: 'hardening', countsTowardBase: false },
  { id: 'P3-PRE-05', kind: 'hardening', countsTowardBase: false },
]);

const BASE_TASK_IDS = new Set(
  TASK_DEFINITIONS.filter((task) => task.countsTowardBase).map((task) => task.id),
);
const HARDENING_TASK_IDS = new Set(
  TASK_DEFINITIONS.filter((task) => !task.countsTowardBase).map((task) => task.id),
);
const BASE_DENOMINATOR = BASE_TASK_IDS.size;

function collectListEntries(
  lines: string[],
  startMarker: string,
  endMarker: string,
  warnings: string[],
): string[] {
  const startIndex = lines.findIndex((line) => line.trim() === startMarker);
  if (startIndex === -1) {
    throw new Error(`Missing section marker: "${startMarker}"`);
  }

  const entries: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === endMarker) {
      break;
    }

    const match = trimmed.match(/^- `([^`]+)`/);
    if (match) {
      entries.push(match[1]);
    } else if (trimmed.startsWith('- ') && trimmed.length > 2) {
      warnings.push(
        `PHASE3_EXECUTION_PLAN.md line ${i + 1}: list entry "${trimmed}" does not use expected backtick format (- \`ID\`).`,
      );
    }
  }

  return entries;
}

function collectListEntriesUntilHeading(
  lines: string[],
  startMarker: string,
  warnings: string[],
): string[] {
  const startIndex = lines.findIndex((line) => line.trim() === startMarker);
  if (startIndex === -1) {
    throw new Error(`Missing section marker: "${startMarker}"`);
  }

  const entries: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();

    if (trimmed.startsWith('## ')) {
      break;
    }

    const match = trimmed.match(/^- `([^`]+)`/);
    if (match) {
      entries.push(match[1]);
    } else if (trimmed.startsWith('- ') && trimmed.length > 2) {
      warnings.push(
        `PHASE3_EXECUTION_PLAN.md line ${i + 1}: list entry "${trimmed}" does not use expected backtick format (- \`ID\`).`,
      );
    }
  }

  return entries;
}

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

function verifyPhase3ExecutionPlan(content: string, errors: string[], warnings: string[]): void {
  const lines = content.split(/\r?\n/);

  const ratioMatchLine = lines.find((line) => /(\d+)\/(\d+)\s+base Phase 3 tasks complete/.test(line));
  if (!ratioMatchLine) {
    errors.push(
      'PHASE3_EXECUTION_PLAN.md: missing status ratio pattern "<completed>/<denominator> base Phase 3 tasks complete".',
    );
    return;
  }

  const ratioMatch = ratioMatchLine.match(/(\d+)\/(\d+)\s+base Phase 3 tasks complete/);
  if (!ratioMatch) {
    errors.push('PHASE3_EXECUTION_PLAN.md: unable to parse status ratio.');
    return;
  }

  const completedInStatus = Number.parseInt(ratioMatch[1], 10);
  const denominatorInStatus = Number.parseInt(ratioMatch[2], 10);

  if (denominatorInStatus !== BASE_DENOMINATOR) {
    errors.push(
      `PHASE3_EXECUTION_PLAN.md: status denominator is ${denominatorInStatus}, expected ${BASE_DENOMINATOR}.`,
    );
  }

  if (completedInStatus < 0 || completedInStatus > BASE_DENOMINATOR) {
    errors.push(
      `PHASE3_EXECUTION_PLAN.md: completed count ${completedInStatus} is outside expected range 0-${BASE_DENOMINATOR}.`,
    );
  }

  const completedRaw = collectListEntries(
    lines,
    'Completed base Phase 3 tasks on `main`:',
    'Remaining base implementation tasks:',
    warnings,
  );
  const remainingRaw = collectListEntries(
    lines,
    'Remaining base implementation tasks:',
    'Remaining mandatory hardening tasks:',
    warnings,
  );
  const hardeningRaw = collectListEntriesUntilHeading(lines, 'Remaining mandatory hardening tasks:', warnings);

  const completedInvalid = completedRaw.filter((id) => !BASE_TASK_IDS.has(id));
  if (completedInvalid.length > 0) {
    errors.push(
      `PHASE3_EXECUTION_PLAN.md: completed list contains non-base IDs: ${[...new Set(completedInvalid)].join(', ')}.`,
    );
  }

  const remainingInvalid = remainingRaw.filter((id) => !BASE_TASK_IDS.has(id));
  if (remainingInvalid.length > 0) {
    errors.push(
      `PHASE3_EXECUTION_PLAN.md: remaining list contains non-base IDs: ${[...new Set(remainingInvalid)].join(', ')}.`,
    );
  }

  const completedDuplicates = findDuplicates(completedRaw);
  if (completedDuplicates.length > 0) {
    errors.push(
      `PHASE3_EXECUTION_PLAN.md: duplicate completed base task IDs: ${completedDuplicates.join(', ')}.`,
    );
  }

  const remainingDuplicates = findDuplicates(remainingRaw);
  if (remainingDuplicates.length > 0) {
    errors.push(
      `PHASE3_EXECUTION_PLAN.md: duplicate remaining base task IDs: ${remainingDuplicates.join(', ')}.`,
    );
  }

  const overlap = completedRaw.filter((id) => remainingRaw.includes(id));
  if (overlap.length > 0) {
    errors.push(
      `PHASE3_EXECUTION_PLAN.md: base task IDs appear in both completed and remaining lists: ${[...new Set(overlap)].sort().join(', ')}.`,
    );
  }

  const combined = new Set<string>([...completedRaw, ...remainingRaw]);
  const missing = [...BASE_TASK_IDS].filter((id) => !combined.has(id)).sort();
  if (missing.length > 0) {
    errors.push(`PHASE3_EXECUTION_PLAN.md: missing base task IDs in snapshot lists: ${missing.join(', ')}.`);
  }

  if (combined.size !== BASE_DENOMINATOR) {
    errors.push(
      `PHASE3_EXECUTION_PLAN.md: combined base-task count is ${combined.size}, expected ${BASE_DENOMINATOR}.`,
    );
  }

  if (completedInStatus !== completedRaw.length) {
    errors.push(
      `PHASE3_EXECUTION_PLAN.md: status says ${completedInStatus} completed, but completed list has ${completedRaw.length}.`,
    );
  }

  const invalidHardening = hardeningRaw.filter((id) => !HARDENING_TASK_IDS.has(id));
  if (invalidHardening.length > 0) {
    errors.push(
      `PHASE3_EXECUTION_PLAN.md: hardening list contains unknown IDs: ${[...new Set(invalidHardening)].join(', ')}.`,
    );
  }

  const hardeningDuplicates = findDuplicates(hardeningRaw);
  if (hardeningDuplicates.length > 0) {
    errors.push(
      `PHASE3_EXECUTION_PLAN.md: duplicate hardening IDs: ${hardeningDuplicates.join(', ')}.`,
    );
  }

  const exitSectionStart = lines.findIndex((line) => line.trim() === '## Phase 3 Exit Verification (Internal)');
  if (exitSectionStart === -1) {
    errors.push('PHASE3_EXECUTION_PLAN.md: missing "## Phase 3 Exit Verification (Internal)" section.');
  } else {
    const exitSection = lines.slice(exitSectionStart, exitSectionStart + 80).join('\n');
    if (!exitSection.includes('pnpm plan:verify:phase3')) {
      errors.push('PHASE3_EXECUTION_PLAN.md: exit verification must include `pnpm plan:verify:phase3`.');
    }
    if (!exitSection.includes('pnpm perf:check')) {
      errors.push('PHASE3_EXECUTION_PLAN.md: exit verification must include `pnpm perf:check`.');
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
  if (!scripts['plan:verify:phase3']) {
    errors.push('package.json: missing `plan:verify:phase3` script.');
  }
  if (!scripts['perf:check']) {
    errors.push('package.json: missing `perf:check` script.');
  }
}

function main(): void {
  const root = process.cwd();
  const phase3PlanPath = join(root, 'PHASE3_EXECUTION_PLAN.md');
  const packageJsonPath = join(root, 'package.json');
  const strictWarnings = process.env.PHASE3_PLAN_VERIFY_STRICT === '1';

  const phase3Plan = readFileSync(phase3PlanPath, 'utf8');
  const packageJson = readFileSync(packageJsonPath, 'utf8');

  const errors: string[] = [];
  const warnings: string[] = [];
  verifyPhase3ExecutionPlan(phase3Plan, errors, warnings);
  verifyPackageScripts(packageJson, errors);

  if (warnings.length > 0) {
    console.warn('Warnings:');
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
    console.warn('');

    if (strictWarnings) {
      errors.push(
        `PHASE3_PLAN_VERIFY_STRICT=1 is set and ${warnings.length} warning(s) were emitted.`,
      );
    }
  }

  if (errors.length > 0) {
    console.error('Phase 3 plan consistency verification failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  const completedCountMatch = phase3Plan.match(/(\d+)\/(\d+)\s+base Phase 3 tasks complete/);
  const completedCount = completedCountMatch ? Number.parseInt(completedCountMatch[1], 10) : 0;

  console.log('Phase 3 plan consistency verification passed.');
  console.log(`- Completed tasks: ${completedCount}/${BASE_DENOMINATOR}`);
  console.log('- Snapshot/accounting: VERIFIED');
  console.log('- Package scripts: VERIFIED');
}

main();
