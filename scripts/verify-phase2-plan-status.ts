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

/**
 * Validates that the "Current cursor" section reflects completion state.
 * Detects stale "Run remaining implementation chain" text when all tasks are complete.
 */
function validateCursorText(content: string, completedCount: number, errors: string[]): void {
  const lines = content.split(/\r?\n/);
  const cursorSection: string[] = [];
  let inCursorSection = false;

  for (const line of lines) {
    if (line.trim() === 'Current cursor:') {
      inCursorSection = true;
      continue;
    }
    if (inCursorSection && line.trim().startsWith('Cross-phase merge guard:')) {
      break;
    }
    if (inCursorSection && line.trim().startsWith('- ')) {
      cursorSection.push(line.trim());
    }
  }

  const cursorText = cursorSection.join('\n');

  // If all tasks complete, cursor should not mention "remaining" or specific task IDs
  if (completedCount === BASE_DENOMINATOR) {
    if (cursorText.includes('remaining') && !cursorText.includes('All Phase 2 base tasks complete')) {
      errors.push(
        `PHASE2_EXECUTION_PLAN.md: "Current cursor" section mentions "remaining" but all ${BASE_DENOMINATOR} tasks are complete.`,
      );
    }

    // Check for stale task ID references
    const taskIdPattern = /P2-\d+[a-z]?/gi;
    const taskIds = cursorText.match(taskIdPattern);
    if (taskIds && taskIds.length > 0) {
      errors.push(
        `PHASE2_EXECUTION_PLAN.md: "Current cursor" references task IDs (${[...new Set(taskIds)].join(', ')}) but all tasks complete.`,
      );
    }
  }
}

/**
 * Validates Gate 3 checklist uses correct integration test command.
 * Prevents false-green by ensuring full 102-test suite is referenced, not just DB tests (31).
 */
function validateGate3Checklist(content: string, errors: string[]): void {
  const lines = content.split(/\r?\n/);
  const gate3StartIdx = lines.findIndex((line) => line.includes('## Gate 3 Verification'));

  if (gate3StartIdx === -1) {
    errors.push('PHASE2_EXECUTION_PLAN.md: missing "## Gate 3 Verification" section.');
    return;
  }

  const gate3Section = lines.slice(gate3StartIdx, gate3StartIdx + 50).join('\n');

  // Must reference the full preflight command
  if (!gate3Section.includes('pnpm test:integration:preflight')) {
    errors.push(
      'PHASE2_EXECUTION_PLAN.md: Gate 3 must reference `pnpm test:integration:preflight` (102 tests), not just DB tests.',
    );
  }

  // Must explain test count
  if (!gate3Section.includes('102 tests')) {
    errors.push(
      'PHASE2_EXECUTION_PLAN.md: Gate 3 should document total test count (102 tests: 31 DB + 71 web).',
    );
  }
}

/**
 * Validates consistency between PHASE2_EXECUTION_PLAN.md and IMPLEMENTATION_PLAN.md.
 * Prevents partial-update edge case where one file is updated but not the other.
 */
function validateCrossFileConsistency(
  phase2Plan: string,
  implementationPlan: string,
  errors: string[],
): void {
  // Extract completed count from PHASE2_EXECUTION_PLAN.md
  const phase2Match = phase2Plan.match(/(\d+)\/(\d+)\s+base Phase 2 tasks complete/);
  if (!phase2Match) {
    errors.push('Cross-file: cannot extract task count from PHASE2_EXECUTION_PLAN.md.');
    return;
  }

  const phase2Completed = Number.parseInt(phase2Match[1], 10);
  const phase2Total = Number.parseInt(phase2Match[2], 10);

  // If Phase 2 is complete, IMPLEMENTATION_PLAN.md should reflect that
  if (phase2Completed === phase2Total) {
    if (implementationPlan.includes('Remaining baseline Phase 2 tasks:')) {
      errors.push(
        'IMPLEMENTATION_PLAN.md: mentions "Remaining baseline Phase 2 tasks" but all tasks complete per PHASE2_EXECUTION_PLAN.md.',
      );
    }
  }
}

/**
 * Validates CLAUDE.md tech stack section matches actual implementation.
 * Detects Prisma vs Drizzle contradictions and stale project structure.
 */
function validateClaudeMd(content: string, errors: string[]): void {
  const lines = content.split(/\r?\n/);

  // Check ORM field
  const ormLine = lines.find((line) => line.includes('**ORM:**'));
  if (ormLine && ormLine.includes('Prisma') && !ormLine.includes('Drizzle')) {
    errors.push('CLAUDE.md: Tech Stack lists "ORM: Prisma" but project uses Drizzle ORM.');
  }

  // Check for stale prisma commands
  if (content.includes('pnpm prisma migrate dev')) {
    errors.push(
      'CLAUDE.md: Contains "pnpm prisma migrate dev" but project uses Drizzle. Correct: "pnpm --filter @propertypro/db db:migrate".',
    );
  }

  // Check project structure for prisma directory
  if (content.includes('└── prisma/')) {
    errors.push(
      'CLAUDE.md: Project Structure shows "└── prisma/" but project uses packages/db/src/schema/ with Drizzle.',
    );
  }

  // Check status field
  const statusLine = lines.find((line) => line.includes('**Status:**'));
  if (statusLine && statusLine.includes('Pre-Development Planning')) {
    errors.push('CLAUDE.md: Project status is "Pre-Development Planning" but Phase 2 is complete.');
  }
}

function main(): void {
  const root = process.cwd();
  const phase2PlanPath = join(root, 'PHASE2_EXECUTION_PLAN.md');
  const implementationPlanPath = join(root, 'IMPLEMENTATION_PLAN.md');
  const claudeMdPath = join(root, 'CLAUDE.md');

  const phase2Plan = readFileSync(phase2PlanPath, 'utf8');
  const implementationPlan = readFileSync(implementationPlanPath, 'utf8');
  const claudeMd = readFileSync(claudeMdPath, 'utf8');

  const errors: string[] = [];

  // Existing validators
  verifyPhase2ExecutionPlan(phase2Plan, errors);
  verifyImplementationPlan(implementationPlan, errors);

  // New validators
  const completedCountMatch = phase2Plan.match(/(\d+)\/(\d+)\s+base Phase 2 tasks complete/);
  const completedCount = completedCountMatch ? Number.parseInt(completedCountMatch[1], 10) : 0;

  validateCursorText(phase2Plan, completedCount, errors);
  validateGate3Checklist(phase2Plan, errors);
  validateCrossFileConsistency(phase2Plan, implementationPlan, errors);
  validateClaudeMd(claudeMd, errors);

  if (errors.length > 0) {
    console.error('Phase 2 status consistency verification failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Phase 2 status consistency verification passed.');
  console.log(`- Completed tasks: ${completedCount}/${BASE_DENOMINATOR}`);
  console.log('- Cross-file consistency: VERIFIED');
  console.log('- Tech stack accuracy: VERIFIED');
  console.log('- Gate 3 checklist: VERIFIED');
}

main();
