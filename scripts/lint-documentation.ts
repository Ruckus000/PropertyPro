import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

interface ValidationError {
  file: string;
  severity: 'error' | 'warning';
  message: string;
  suggestion?: string;
}

interface ValidationContext {
  phase2Plan: string;
  implementationPlan: string;
  claudeMd: string;
  packageJson: any;
  gate3Protocol: string;
  rootPath: string;
}

interface ValidatorFunction {
  name: string;
  run: (ctx: ValidationContext, errors: ValidationError[]) => void;
}

// ---------------------------------------------------------------------------
// File Reading Layer
// ---------------------------------------------------------------------------

function loadAllDocuments(root: string): ValidationContext {
  try {
    const phase2Plan = readFileSync(join(root, 'PHASE2_EXECUTION_PLAN.md'), 'utf8');
    const implementationPlan = readFileSync(join(root, 'IMPLEMENTATION_PLAN.md'), 'utf8');
    const claudeMd = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const gate3Protocol = readFileSync(join(root, 'docs/audits/GATE3_EVIDENCE_PROTOCOL.md'), 'utf8');

    return { phase2Plan, implementationPlan, claudeMd, packageJson, gate3Protocol, rootPath: root };
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Fatal error loading documentation files: ${err.message}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Validator Implementations
// ---------------------------------------------------------------------------

// Category 1: Cross-File Consistency

function validatePhase2StatusConsistency(
  ctx: ValidationContext,
  errors: ValidationError[],
): void {
  const phase2Match = ctx.phase2Plan.match(/(\d+)\/(\d+)\s+base Phase 2 tasks complete/);
  if (!phase2Match) {
    errors.push({
      file: 'PHASE2_EXECUTION_PLAN.md',
      severity: 'error',
      message: 'Missing Phase 2 status ratio pattern',
      suggestion: 'Add "X/Y base Phase 2 tasks complete" to status line',
    });
    return;
  }

  const phase2Completed = parseInt(phase2Match[1], 10);
  const phase2Total = parseInt(phase2Match[2], 10);

  // Check IMPLEMENTATION_PLAN.md - should reference, not duplicate
  const implMatch = ctx.implementationPlan.match(/(\d+)\/(\d+)\s+base (Phase 2 )?tasks/);
  if (implMatch) {
    const implCompleted = parseInt(implMatch[1], 10);
    const implTotal = parseInt(implMatch[2], 10);

    if (implCompleted !== phase2Completed || implTotal !== phase2Total) {
      errors.push({
        file: 'IMPLEMENTATION_PLAN.md',
        severity: 'error',
        message: `Phase 2 status mismatch: shows ${implCompleted}/${implTotal} but PHASE2_EXECUTION_PLAN.md shows ${phase2Completed}/${phase2Total}`,
        suggestion: 'Update to match PHASE2_EXECUTION_PLAN.md or reference it instead of duplicating',
      });
    }
  }

  // Check CLAUDE.md
  const claudeStatusMatch = ctx.claudeMd.match(/Phase 2[^(]*\((\d+)\/(\d+)/);
  if (claudeStatusMatch) {
    const claudeCompleted = parseInt(claudeStatusMatch[1], 10);
    const claudeTotal = parseInt(claudeStatusMatch[2], 10);

    if (claudeCompleted !== phase2Completed || claudeTotal !== phase2Total) {
      errors.push({
        file: 'CLAUDE.md',
        severity: 'error',
        message: `Phase 2 status shows ${claudeCompleted}/${claudeTotal} but PHASE2_EXECUTION_PLAN.md shows ${phase2Completed}/${phase2Total}`,
      });
    }
  }
}

function validateGateStatusAlignment(ctx: ValidationContext, errors: ValidationError[]): void {
  // Extract Gate 3 status from all files
  const gate3InPhase2 = ctx.phase2Plan.match(/Gate 3[:\s]+([\w\s]+)/i);
  const gate3InClaude = ctx.claudeMd.match(/Gate 3[:\s]+([\w\s]+)/i);

  if (gate3InPhase2 && gate3InClaude) {
    const status1 = gate3InPhase2[1].toLowerCase().trim();
    const status2 = gate3InClaude[1].toLowerCase().trim();

    // Normalize "in progress" vs "verification in progress"
    const normalize = (s: string) => s.replace(/verification\s+/, '').replace(/\s+/g, ' ');

    if (normalize(status1) !== normalize(status2)) {
      errors.push({
        file: 'CLAUDE.md',
        severity: 'warning',
        message: `Gate 3 status inconsistent: PHASE2_EXECUTION_PLAN.md says "${status1}" but CLAUDE.md says "${status2}"`,
      });
    }
  }
}

function validateTestCountAccuracy(ctx: ValidationContext, errors: ValidationError[]): void {
  const expectedDbTests = 31;
  const expectedWebTests = 71;
  const expectedTotal = 102;

  const docs = [
    { name: 'PHASE2_EXECUTION_PLAN.md', content: ctx.phase2Plan },
    { name: 'IMPLEMENTATION_PLAN.md', content: ctx.implementationPlan },
    { name: 'CLAUDE.md', content: ctx.claudeMd },
    { name: 'GATE3_EVIDENCE_PROTOCOL.md', content: ctx.gate3Protocol },
  ];

  for (const doc of docs) {
    // Check for "102 tests" references
    if (doc.content.includes('102 tests')) {
      const match = doc.content.match(/102 tests[^(]*\((\d+)\s+DB[^+]*\+[^0-9]*(\d+)\s+web\)/i);
      if (match) {
        const dbCount = parseInt(match[1], 10);
        const webCount = parseInt(match[2], 10);

        if (dbCount !== expectedDbTests || webCount !== expectedWebTests) {
          errors.push({
            file: doc.name,
            severity: 'error',
            message: `Test count breakdown incorrect: shows ${dbCount} DB + ${webCount} web, expected ${expectedDbTests} DB + ${expectedWebTests} web`,
          });
        }
      }
    }
  }
}

function validatePackageJsonCommands(ctx: ValidationContext, errors: ValidationError[]): void {
  // Extract commands from CLAUDE.md "Development Commands" section
  const commandSection = ctx.claudeMd.match(/## Development Commands.*?```bash(.*?)```/s);
  if (!commandSection) return;

  const commandBlock = commandSection[1];
  const pnpmCommands = commandBlock.match(/pnpm\s+([a-z:]+)/g) || [];

  const availableScripts = Object.keys(ctx.packageJson.scripts || {});

  for (const fullCmd of pnpmCommands) {
    const scriptName = fullCmd.replace('pnpm ', '');

    // Skip special commands like "pnpm install"
    if (['install', 'add', 'remove', 'dev', 'build'].includes(scriptName)) continue;

    // Handle --filter commands
    if (scriptName.startsWith('--filter')) continue;

    if (!availableScripts.includes(scriptName)) {
      errors.push({
        file: 'CLAUDE.md',
        severity: 'error',
        message: `Command 'pnpm ${scriptName}' documented but script '${scriptName}' not found in package.json`,
        suggestion: `Add "${scriptName}: ..." to package.json scripts or remove from documentation`,
      });
    }
  }
}

// Category 2: Stale Reference Validators

function validateCompletedTaskReferences(ctx: ValidationContext, errors: ValidationError[]): void {
  // Extract completed task IDs from PHASE2_EXECUTION_PLAN.md
  const completedSection = ctx.phase2Plan.match(
    /Completed base Phase 2 tasks on `main`:(.*?)Remaining base implementation tasks:/s,
  );
  if (!completedSection) return;

  const completedIds: string[] = [];
  const matches = completedSection[1].matchAll(/`(P2-\d+[a-z]?)`/g);
  for (const match of matches) {
    completedIds.push(match[1]);
  }

  // Check if any completed IDs appear in "Current cursor" section (errors only)
  const cursorSection = ctx.phase2Plan.match(/## Current cursor(.*?)(?:##|$)/s);
  if (cursorSection) {
    const cursorText = cursorSection[1];
    for (const id of completedIds) {
      // Skip false positives: allow references in completion announcements
      if (cursorText.includes(id) && !cursorText.includes('complete')) {
        errors.push({
          file: 'PHASE2_EXECUTION_PLAN.md',
          severity: 'error',
          message: `${id} is marked complete but mentioned in 'Current cursor' section`,
          suggestion: `Remove ${id} reference from Current cursor section`,
        });
      }
    }
  }

  // Skip "Remaining tasks" validation - too many false positives from cross-references
}

function validateStaleStatusLabels(ctx: ValidationContext, errors: ValidationError[]): void {
  // Check if CLAUDE.md status claims Phase 2 is complete
  const statusMatch = ctx.claudeMd.match(/\*\*Status:\*\*\s+(.+)/);
  if (!statusMatch) return;

  const statusText = statusMatch[1].toLowerCase();

  // If Phase 2 is complete, status shouldn't say "Pre-Development Planning"
  if (statusText.includes('phase 2 complete') && statusText.includes('pre-development')) {
    errors.push({
      file: 'CLAUDE.md',
      severity: 'error',
      message: "Status is 'Pre-Development Planning' but Phase 2 is complete",
      suggestion: 'Update status to reflect Phase 2 completion',
    });
  }
}

// Category 3: Tech Stack Accuracy

function validateNoPrismaReferences(ctx: ValidationContext, errors: ValidationError[]): void {
  const prismaPatterns = ['Prisma', 'prisma migrate', 'prisma studio', 'npx prisma'];

  const docs = [
    { name: 'CLAUDE.md', content: ctx.claudeMd },
    { name: 'IMPLEMENTATION_PLAN.md', content: ctx.implementationPlan },
  ];

  for (const doc of docs) {
    for (const pattern of prismaPatterns) {
      if (doc.content.includes(pattern)) {
        errors.push({
          file: doc.name,
          severity: 'error',
          message: `Found reference to "${pattern}" but project uses Drizzle ORM`,
          suggestion: 'Replace Prisma references with Drizzle ORM equivalents',
        });
      }
    }
  }
}

function validateCorrectOrmReferences(ctx: ValidationContext, errors: ValidationError[]): void {
  // Check that Tech Stack ORM field mentions Drizzle
  const ormMatch = ctx.claudeMd.match(/\*\*ORM:\*\*\s+(.+)/);
  if (ormMatch && !ormMatch[1].includes('Drizzle')) {
    errors.push({
      file: 'CLAUDE.md',
      severity: 'error',
      message: 'Tech Stack ORM field missing "Drizzle" reference',
      suggestion: 'Update to "Drizzle ORM"',
    });
  }
}

function validateCorrectMigrationCommands(ctx: ValidationContext, errors: ValidationError[]): void {
  // Check for incorrect migration commands
  const incorrectPatterns = ['prisma migrate dev', 'prisma db push', 'npx prisma'];

  const docs = [
    { name: 'CLAUDE.md', content: ctx.claudeMd },
    { name: 'IMPLEMENTATION_PLAN.md', content: ctx.implementationPlan },
  ];

  for (const doc of docs) {
    for (const pattern of incorrectPatterns) {
      if (doc.content.includes(pattern)) {
        errors.push({
          file: doc.name,
          severity: 'error',
          message: `Found "${pattern}" but should use Drizzle migration command`,
          suggestion: 'Use "pnpm --filter @propertypro/db db:migrate"',
        });
      }
    }
  }
}

function validateProjectStructureAccuracy(ctx: ValidationContext, errors: ValidationError[]): void {
  // Check that CLAUDE.md project structure doesn't reference prisma/ directory
  const structureMatch = ctx.claudeMd.match(/## Project Structure(.*?)##/s);
  if (structureMatch && structureMatch[1].includes('prisma/')) {
    errors.push({
      file: 'CLAUDE.md',
      severity: 'error',
      message: "Project structure shows 'prisma/' directory but project uses packages/db/src/schema/",
      suggestion: 'Update project structure to show packages/db/ instead of prisma/',
    });
  }
}

// Category 4: Command Accuracy

function validateScriptExistence(ctx: ValidationContext, errors: ValidationError[]): void {
  // This is already handled by validatePackageJsonCommands
  // Keeping as separate validator for clarity and future expansion
}

function validateIntegrationTestFormat(ctx: ValidationContext, errors: ValidationError[]): void {
  // Check that integration test commands include environment loading
  const integrationCmdMatch = ctx.claudeMd.match(/pnpm test:integration:preflight/);
  if (integrationCmdMatch) {
    // Look for the command in context
    const cmdSection = ctx.claudeMd.match(/```bash(.*?)pnpm test:integration:preflight(.*?)```/s);
    if (cmdSection) {
      const fullBlock = cmdSection[0];
      if (!fullBlock.includes('set -a') && !fullBlock.includes('source .env.local')) {
        errors.push({
          file: 'CLAUDE.md',
          severity: 'warning',
          message: 'Integration test command missing environment variable loading pattern',
          suggestion: 'Add "set -a; source .env.local; set +a" before pnpm test:integration:preflight',
        });
      }
    }
  }
}

// Category 5: Phase Status Validators

function validatePhaseCompletionClaims(ctx: ValidationContext, errors: ValidationError[]): void {
  // If CLAUDE.md claims "Phase 2 Complete", verify completed list supports this
  const phase2CompleteMatch = ctx.claudeMd.match(/Phase 2[^(]*Complete/i);
  if (!phase2CompleteMatch) return;

  // Extract completed count from PHASE2_EXECUTION_PLAN.md
  const completedMatch = ctx.phase2Plan.match(/(\d+)\/(\d+)\s+base Phase 2 tasks complete/);
  if (completedMatch) {
    const completed = parseInt(completedMatch[1], 10);
    const total = parseInt(completedMatch[2], 10);

    if (completed !== total) {
      errors.push({
        file: 'CLAUDE.md',
        severity: 'error',
        message: `Claims 'Phase 2 Complete' but PHASE2_EXECUTION_PLAN.md shows ${completed}/${total}`,
      });
    }
  }
}

function validateBaseTaskDenominator(ctx: ValidationContext, errors: ValidationError[]): void {
  // Extract all Phase 2 ratios and ensure denominators match
  const docs = [
    { name: 'PHASE2_EXECUTION_PLAN.md', content: ctx.phase2Plan },
    { name: 'IMPLEMENTATION_PLAN.md', content: ctx.implementationPlan },
    { name: 'CLAUDE.md', content: ctx.claudeMd },
  ];

  const denominators: Map<string, number> = new Map();

  for (const doc of docs) {
    const matches = doc.content.matchAll(/(\d+)\/(\d+)\s+base Phase 2 tasks/gi);
    for (const match of matches) {
      const denominator = parseInt(match[2], 10);
      denominators.set(doc.name, denominator);
    }
  }

  const uniqueDenominators = new Set(denominators.values());
  if (uniqueDenominators.size > 1) {
    const details = Array.from(denominators.entries())
      .map(([file, denom]) => `${file}: ${denom}`)
      .join(', ');
    errors.push({
      file: 'Multiple Files',
      severity: 'error',
      message: `Phase 2 base task denominators inconsistent: ${details}`,
      suggestion: 'Ensure all files use the same denominator (should be 16)',
    });
  }
}

function validateRemainingTaskList(ctx: ValidationContext, errors: ValidationError[]): void {
  // Extract completed/total from status line
  const statusMatch = ctx.phase2Plan.match(/(\d+)\/(\d+)\s+base Phase 2 tasks complete/);
  if (!statusMatch) return;

  const completed = parseInt(statusMatch[1], 10);
  const total = parseInt(statusMatch[2], 10);
  const expectedRemaining = total - completed;

  // Count remaining task list items
  const remainingSection = ctx.phase2Plan.match(
    /Remaining base implementation tasks:(.*?)Remaining mandatory/s,
  );
  if (remainingSection) {
    const remainingItems = (remainingSection[1].match(/- `/g) || []).length;

    if (remainingItems !== expectedRemaining) {
      errors.push({
        file: 'PHASE2_EXECUTION_PLAN.md',
        severity: 'error',
        message: `Says ${completed}/${total} complete but 'Remaining tasks' section lists ${remainingItems} items (expected ${expectedRemaining})`,
      });
    }
  }
}

// Category 6: Gate Checklist Validators

function validateGate3TestCount(ctx: ValidationContext, errors: ValidationError[]): void {
  // Check that Gate 3 references 102 tests (31 DB + 71 web)
  const gate3Match = ctx.phase2Plan.match(/Gate 3(.*?)##/s);
  if (!gate3Match) return;

  const gate3Text = gate3Match[1];
  if (gate3Text.includes('102 tests')) {
    // Check for proper breakdown
    if (!gate3Text.match(/\(31\s+DB[^+]*\+[^0-9]*71\s+web\)/i)) {
      errors.push({
        file: 'PHASE2_EXECUTION_PLAN.md',
        severity: 'warning',
        message: "Gate 3 mentions '102 tests' but missing breakdown '(31 DB + 71 web)'",
        suggestion: 'Add test count breakdown for clarity',
      });
    }
  }
}

function validateGate3CommandAccuracy(ctx: ValidationContext, errors: ValidationError[]): void {
  // Check that Gate 3 uses full preflight command, not just DB tests
  const gate3Sections = [
    { name: 'PHASE2_EXECUTION_PLAN.md', content: ctx.phase2Plan },
    { name: 'GATE3_EVIDENCE_PROTOCOL.md', content: ctx.gate3Protocol },
  ];

  for (const doc of gate3Sections) {
    const gate3Match = doc.content.match(/Gate 3(.*?)(?:##|$)/s);
    if (!gate3Match) continue;

    const gate3Text = gate3Match[1];
    // Check for DB-only test command
    if (
      gate3Text.includes('pnpm --filter @propertypro/db test:integration') &&
      !gate3Text.includes('test:integration:preflight')
    ) {
      errors.push({
        file: doc.name,
        severity: 'error',
        message: 'Gate 3 references DB-only tests instead of full preflight command',
        suggestion: 'Use "pnpm test:integration:preflight" for complete test coverage',
      });
    }
  }
}

function validateGate3ProtocolReference(ctx: ValidationContext, errors: ValidationError[]): void {
  // Check that PHASE2_EXECUTION_PLAN.md references the Gate 3 evidence protocol
  const gate3Section = ctx.phase2Plan.match(/## Gate 3[^#]+(.*?)(?:##|$)/s);
  if (!gate3Section) return;

  const gate3Text = gate3Section[1];
  // Check for evidence protocol reference (with or without full path)
  if (!gate3Text.includes('GATE3_EVIDENCE_PROTOCOL') && !gate3Text.toLowerCase().includes('evidence protocol')) {
    errors.push({
      file: 'PHASE2_EXECUTION_PLAN.md',
      severity: 'warning',
      message: 'Gate 3 section missing reference to /docs/audits/GATE3_EVIDENCE_PROTOCOL.md',
      suggestion: 'Add reference to evidence protocol for standardized Gate 3 verification',
    });
  }
}

// ---------------------------------------------------------------------------
// Validator Registry
// ---------------------------------------------------------------------------

const VALIDATORS: ValidatorFunction[] = [
  // Cross-file consistency
  { name: 'phase2-status-consistency', run: validatePhase2StatusConsistency },
  { name: 'gate-status-alignment', run: validateGateStatusAlignment },
  { name: 'test-count-accuracy', run: validateTestCountAccuracy },
  { name: 'package-json-commands', run: validatePackageJsonCommands },

  // Stale references
  { name: 'completed-task-references', run: validateCompletedTaskReferences },
  { name: 'stale-status-labels', run: validateStaleStatusLabels },

  // Tech stack
  { name: 'no-prisma-references', run: validateNoPrismaReferences },
  { name: 'correct-orm-references', run: validateCorrectOrmReferences },
  { name: 'correct-migration-commands', run: validateCorrectMigrationCommands },
  { name: 'project-structure-accuracy', run: validateProjectStructureAccuracy },

  // Command accuracy
  { name: 'script-existence', run: validateScriptExistence },
  { name: 'integration-test-format', run: validateIntegrationTestFormat },

  // Phase status
  { name: 'phase-completion-claims', run: validatePhaseCompletionClaims },
  { name: 'base-task-denominator', run: validateBaseTaskDenominator },
  { name: 'remaining-task-list', run: validateRemainingTaskList },

  // Gate checklists
  { name: 'gate3-test-count', run: validateGate3TestCount },
  { name: 'gate3-command-accuracy', run: validateGate3CommandAccuracy },
  { name: 'gate3-protocol-reference', run: validateGate3ProtocolReference },
];

// ---------------------------------------------------------------------------
// Error Reporting
// ---------------------------------------------------------------------------

function groupBy<T, K extends string | number>(
  items: T[],
  keyFn: (item: T) => K,
): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}

function formatErrors(errors: ValidationError[]): void {
  if (errors.length === 0) {
    console.log('✓ Documentation validation passed.');
    console.log(`  ${VALIDATORS.length} validators executed`);
    return;
  }

  console.error('✗ Documentation validation failed:\n');

  // Group by file
  const byFile = groupBy(errors, (e) => e.file);

  for (const [file, fileErrors] of byFile.entries()) {
    console.error(`\n${file}:`);
    for (const err of fileErrors) {
      const icon = err.severity === 'error' ? '✗' : '⚠';
      console.error(`  ${icon} ${err.message}`);
      if (err.suggestion) {
        console.error(`    → ${err.suggestion}`);
      }
    }
  }

  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warningCount = errors.filter((e) => e.severity === 'warning').length;

  console.error(`\nTotal errors: ${errorCount}`);
  console.error(`Total warnings: ${warningCount}`);
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

function main(): void {
  const root = process.cwd();

  try {
    const ctx = loadAllDocuments(root);
    const errors: ValidationError[] = [];

    for (const validator of VALIDATORS) {
      try {
        validator.run(ctx, errors);
      } catch (err) {
        errors.push({
          file: 'validator',
          severity: 'error',
          message: `Validator "${validator.name}" threw exception: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    formatErrors(errors);

    const hasErrors = errors.some((e) => e.severity === 'error');
    process.exit(hasErrors ? 1 : 0);
  } catch (err) {
    console.error('Fatal error:');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

main();
