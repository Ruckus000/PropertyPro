import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type TaskKind = 'base' | 'subtask' | 'hardening';

type TaskDefinition = Readonly<{
  id: string;
  kind: TaskKind;
  countsTowardBase: boolean;
}>;

const TASK_DEFINITIONS: readonly TaskDefinition[] = Object.freeze([
  { id: 'P2-30', kind: 'base', countsTowardBase: true },
  { id: 'P2-31', kind: 'base', countsTowardBase: true },
  { id: 'P2-32', kind: 'base', countsTowardBase: true },
  { id: 'P2-32a', kind: 'base', countsTowardBase: true },
  { id: 'P2-33', kind: 'base', countsTowardBase: true },
  { id: 'P2-34', kind: 'base', countsTowardBase: true },
  { id: 'P2-34a', kind: 'subtask', countsTowardBase: false },
  { id: 'P2-35', kind: 'base', countsTowardBase: true },
  { id: 'P2-36', kind: 'base', countsTowardBase: true },
  { id: 'P2-37', kind: 'base', countsTowardBase: true },
  { id: 'P2-38', kind: 'base', countsTowardBase: true },
  { id: 'P2-39', kind: 'base', countsTowardBase: true },
  { id: 'P2-40', kind: 'base', countsTowardBase: true },
  { id: 'P2-41', kind: 'base', countsTowardBase: true },
  { id: 'P2-42', kind: 'base', countsTowardBase: true },
  { id: 'P2-43', kind: 'base', countsTowardBase: true },
  { id: 'P2-44', kind: 'base', countsTowardBase: true },
  { id: 'P2-33.5', kind: 'hardening', countsTowardBase: false },
  { id: 'P2-PRE-02', kind: 'hardening', countsTowardBase: false },
  { id: 'P2-PRE-03', kind: 'hardening', countsTowardBase: false },
]);

const BASE_TASK_IDS = new Set(
  TASK_DEFINITIONS.filter((task) => task.countsTowardBase).map((task) => task.id),
);
const NON_BASE_TASK_IDS = new Set(
  TASK_DEFINITIONS.filter((task) => !task.countsTowardBase).map((task) => task.id),
);
const BASE_DENOMINATOR = BASE_TASK_IDS.size;

function collectListEntries(lines: string[], startMarker: string, endMarker: string): string[] {
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
    if (match && match[1].startsWith('P2-')) {
      entries.push(match[1]);
    }
  }

  return entries;
}

function extractBaseIds(rawEntries: string[], sectionName: string, errors: string[]): string[] {
  const extracted: string[] = [];

  for (const rawEntry of rawEntries) {
    const ids = rawEntry
      .split('/')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    const hasBaseTask = ids.some((id) => BASE_TASK_IDS.has(id));
    if (!hasBaseTask) {
      errors.push(`${sectionName}: entry "${rawEntry}" does not include a base task ID.`);
      continue;
    }

    if (ids.includes('P2-34a') && !ids.includes('P2-34')) {
      errors.push(
        `${sectionName}: entry "${rawEntry}" lists P2-34a without P2-34. P2-34a cannot stand alone in base-task lists.`,
      );
    }

    for (const id of ids) {
      if (BASE_TASK_IDS.has(id)) {
        extracted.push(id);
        continue;
      }

      if (NON_BASE_TASK_IDS.has(id)) {
        if (id !== 'P2-34a') {
          errors.push(`${sectionName}: non-base task "${id}" is not allowed in base-task lists.`);
        }
        continue;
      }

      errors.push(`${sectionName}: unknown task identifier "${id}" in entry "${rawEntry}".`);
    }
  }

  return extracted;
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

function collectSection(lines: string[], headingPrefix: string): string[] {
  const startIndex = lines.findIndex((line) => line.trim().startsWith(headingPrefix));
  if (startIndex === -1) {
    throw new Error(`Missing heading with prefix: "${headingPrefix}"`);
  }

  const section: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('## ')) {
      break;
    }
    section.push(lines[i]);
  }

  return section;
}

function verifyPhase2ExecutionPlan(content: string, errors: string[]): void {
  const lines = content.split(/\r?\n/);

  let statusRatioFound = false;
  for (const line of lines) {
    const match = line.match(/(\d+)\/(\d+)\s+base Phase 2 tasks complete/);
    if (match) {
      statusRatioFound = true;
      const completedInStatus = Number.parseInt(match[1], 10);
      const denominatorInStatus = Number.parseInt(match[2], 10);

      if (denominatorInStatus !== BASE_DENOMINATOR) {
        errors.push(
          `PHASE2_EXECUTION_PLAN.md: status denominator is ${denominatorInStatus}, expected ${BASE_DENOMINATOR}.`,
        );
      }

      if (completedInStatus < 0 || completedInStatus > BASE_DENOMINATOR) {
        errors.push(
          `PHASE2_EXECUTION_PLAN.md: status completed count ${completedInStatus} is outside expected range 0-${BASE_DENOMINATOR}.`,
        );
      }
      break;
    }
  }

  if (!statusRatioFound) {
    errors.push(
      'PHASE2_EXECUTION_PLAN.md: missing status ratio pattern "<completed>/<denominator> base Phase 2 tasks complete".',
    );
  }

  const completedRaw = collectListEntries(
    lines,
    'Completed base Phase 2 tasks on `main`:',
    'Remaining base implementation tasks:',
  );
  const remainingRaw = collectListEntries(
    lines,
    'Remaining base implementation tasks:',
    'Remaining mandatory hardening tasks:',
  );

  const completedIds = extractBaseIds(completedRaw, 'Completed base tasks', errors);
  const remainingIds = extractBaseIds(remainingRaw, 'Remaining base tasks', errors);

  const completedDuplicates = findDuplicates(completedIds);
  if (completedDuplicates.length > 0) {
    errors.push(
      `PHASE2_EXECUTION_PLAN.md: duplicate completed base task IDs: ${completedDuplicates.join(', ')}.`,
    );
  }

  const remainingDuplicates = findDuplicates(remainingIds);
  if (remainingDuplicates.length > 0) {
    errors.push(
      `PHASE2_EXECUTION_PLAN.md: duplicate remaining base task IDs: ${remainingDuplicates.join(', ')}.`,
    );
  }

  const overlap = completedIds.filter((id) => remainingIds.includes(id));
  const overlapUnique = [...new Set(overlap)].sort();
  if (overlapUnique.length > 0) {
    errors.push(
      `PHASE2_EXECUTION_PLAN.md: base task IDs appear in both completed and remaining lists: ${overlapUnique.join(', ')}.`,
    );
  }

  const combined = new Set<string>([...completedIds, ...remainingIds]);
  const missing = [...BASE_TASK_IDS].filter((id) => !combined.has(id)).sort();
  const unknownCombined = [...combined].filter((id) => !BASE_TASK_IDS.has(id)).sort();

  if (missing.length > 0) {
    errors.push(`PHASE2_EXECUTION_PLAN.md: missing base task IDs in snapshot lists: ${missing.join(', ')}.`);
  }

  if (unknownCombined.length > 0) {
    errors.push(
      `PHASE2_EXECUTION_PLAN.md: snapshot includes non-canonical base IDs: ${unknownCombined.join(', ')}.`,
    );
  }

  if (combined.size !== BASE_DENOMINATOR) {
    errors.push(
      `PHASE2_EXECUTION_PLAN.md: combined base-task count is ${combined.size}, expected ${BASE_DENOMINATOR}.`,
    );
  }

  const statusMatchLine = lines.find((line) =>
    /(\d+)\/(\d+)\s+base Phase 2 tasks complete/.test(line),
  );
  if (statusMatchLine) {
    const match = statusMatchLine.match(/(\d+)\/(\d+)\s+base Phase 2 tasks complete/);
    if (match) {
      const completedInStatus = Number.parseInt(match[1], 10);
      if (completedInStatus !== completedIds.length) {
        errors.push(
          `PHASE2_EXECUTION_PLAN.md: status says ${completedInStatus} completed, but completed list has ${completedIds.length}.`,
        );
      }
    }
  }
}

function verifyImplementationPlan(content: string, errors: string[]): void {
  const lines = content.split(/\r?\n/);
  const section = collectSection(lines, '## Phase 2 Execution Readiness');
  const sectionText = section.join('\n');

  const statusLine = section.find((line) => line.trim().startsWith('- **Status:**'));
  if (!statusLine) {
    errors.push('IMPLEMENTATION_PLAN.md: missing "- **Status:**" line in Phase 2 Execution Readiness.');
  } else if (/\b\d+\/\d+\b/.test(statusLine)) {
    errors.push(
      'IMPLEMENTATION_PLAN.md: Phase 2 status line still contains an independent ratio. Reference PHASE2_EXECUTION_PLAN.md instead.',
    );
  }

  if (/\b\d+\/16\b/.test(sectionText)) {
    errors.push(
      'IMPLEMENTATION_PLAN.md: Phase 2 Execution Readiness section still contains x/16 ratio text.',
    );
  }

  if (!sectionText.includes('`PHASE2_EXECUTION_PLAN.md`')) {
    errors.push(
      'IMPLEMENTATION_PLAN.md: Phase 2 Execution Readiness must reference `PHASE2_EXECUTION_PLAN.md` as canonical source.',
    );
  }

  if (!/canonical/i.test(sectionText)) {
    errors.push(
      'IMPLEMENTATION_PLAN.md: Phase 2 Execution Readiness should explicitly call out canonical count ownership.',
    );
  }

  if (!sectionText.includes('`P2-34/P2-34a`')) {
    errors.push(
      'IMPLEMENTATION_PLAN.md: remaining baseline task list should use combined `P2-34/P2-34a` naming.',
    );
  }
}

function main(): void {
  const root = process.cwd();
  const phase2PlanPath = join(root, 'PHASE2_EXECUTION_PLAN.md');
  const implementationPlanPath = join(root, 'IMPLEMENTATION_PLAN.md');

  const phase2Plan = readFileSync(phase2PlanPath, 'utf8');
  const implementationPlan = readFileSync(implementationPlanPath, 'utf8');

  const errors: string[] = [];

  verifyPhase2ExecutionPlan(phase2Plan, errors);
  verifyImplementationPlan(implementationPlan, errors);

  if (errors.length > 0) {
    console.error('Phase 2 status consistency verification failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Phase 2 status consistency verification passed.');
}

main();
