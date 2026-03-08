/**
 * Phase 5 Audit Evidence Verifier
 *
 * Validates that workstream audit evidence documents contain all required
 * sections per the Phase 5 execution plan.
 *
 * Required sections (from 00-phase5-execution-plan.md, Section 11):
 *   1. Context (commit, branch, date, runner)
 *   2. Pre-Checks (clean tree, frozen lockfile, migrations)
 *   3. Static Checks (build, typecheck, lint)
 *   4. Integration Test Results (with command transcripts)
 *   5. Cross-Tenant Isolation Verification
 *   6. Security Gate Verification
 *   7. Workstream-Specific Evidence
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const auditsDir = join(repoRoot, 'docs', 'audits');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REQUIRED_SECTIONS = [
  { pattern: /#+\s*(?:1[.\s)]*)?context/i, label: 'Section 1: Context' },
  { pattern: /#+\s*(?:2[.\s)]*)?pre[- ]?checks/i, label: 'Section 2: Pre-Checks' },
  { pattern: /#+\s*(?:3[.\s)]*)?static\s+checks/i, label: 'Section 3: Static Checks' },
  { pattern: /#+\s*(?:4[.\s)]*)?integration\s+test/i, label: 'Section 4: Integration Test Results' },
  { pattern: /#+\s*(?:5[.\s)]*)?cross[- ]?tenant/i, label: 'Section 5: Cross-Tenant Isolation' },
  { pattern: /#+\s*(?:6[.\s)]*)?security\s+gate/i, label: 'Section 6: Security Gate Verification' },
  { pattern: /#+\s*(?:7[.\s)]*)?workstream[- ]?specific/i, label: 'Section 7: Workstream-Specific Evidence' },
];

/** Context section must contain these keywords/fields */
const CONTEXT_REQUIRED_FIELDS = [
  { pattern: /commit/i, label: 'commit hash' },
  { pattern: /branch/i, label: 'branch name' },
  { pattern: /date/i, label: 'date' },
];

/** Phase 5 evidence files match this pattern */
const PHASE5_EVIDENCE_PATTERN = /^phase5-\d{2}-\d{4}-\d{2}-\d{2}\.md$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Problem {
  severity: 'error' | 'warning';
  file: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function validateEvidenceFile(filePath: string, fileName: string): Problem[] {
  const problems: Problem[] = [];
  const content = readFileSync(filePath, 'utf-8');

  // Check for each required section
  for (const section of REQUIRED_SECTIONS) {
    if (!section.pattern.test(content)) {
      problems.push({
        severity: 'error',
        file: fileName,
        message: `Missing required section: ${section.label}`,
      });
    }
  }

  // Check context section has required fields
  const contextMatch = content.match(/#+\s*(?:1[.\s)]*)?context[^\n]*\n([\s\S]*?)(?=\n#+\s)/i);
  if (contextMatch) {
    const contextContent = contextMatch[1];
    for (const field of CONTEXT_REQUIRED_FIELDS) {
      if (!field.pattern.test(contextContent)) {
        problems.push({
          severity: 'warning',
          file: fileName,
          message: `Context section missing field: ${field.label}`,
        });
      }
    }
  }

  // Check for command transcripts (code blocks) in integration test section
  const integrationMatch = content.match(
    /#+\s*(?:4[.\s)]*)?integration\s+test[^\n]*\n([\s\S]*?)(?=\n#+\s)/i,
  );
  if (integrationMatch) {
    const integrationContent = integrationMatch[1];
    if (!integrationContent.includes('```')) {
      problems.push({
        severity: 'warning',
        file: fileName,
        message: 'Integration Test Results section has no command transcripts (code blocks)',
      });
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('🔍 Audit Evidence Verifier');
  console.log('='.repeat(60));

  // Find Phase 5 evidence files
  let evidenceFiles: string[];
  try {
    evidenceFiles = readdirSync(auditsDir)
      .filter(f => PHASE5_EVIDENCE_PATTERN.test(f))
      .sort();
  } catch {
    console.log(`\nℹ️  No audits directory found at ${auditsDir}`);
    console.log('   This is expected before any Phase 5 workstream is complete.');
    console.log('\n✅ No evidence files to validate yet.');
    process.exit(0);
  }

  if (evidenceFiles.length === 0) {
    console.log('\nℹ️  No Phase 5 evidence files found (pattern: phase5-XX-YYYY-MM-DD.md)');
    console.log('   This is expected before any Phase 5 workstream is complete.');
    console.log('\n✅ No evidence files to validate yet.');
    process.exit(0);
  }

  console.log(`\nFound ${evidenceFiles.length} Phase 5 evidence file(s):`);

  const allProblems: Problem[] = [];

  for (const file of evidenceFiles) {
    const filePath = join(auditsDir, file);
    console.log(`\n  📄 ${file}`);

    const problems = validateEvidenceFile(filePath, file);
    allProblems.push(...problems);

    if (problems.length === 0) {
      console.log('     ✅ All required sections present');
    } else {
      for (const p of problems) {
        const icon = p.severity === 'error' ? '❌' : '⚠️';
        console.log(`     ${icon} ${p.message}`);
      }
    }
  }

  // Report
  const errors = allProblems.filter(p => p.severity === 'error');
  const warnings = allProblems.filter(p => p.severity === 'warning');

  console.log('\n' + '='.repeat(60));

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} error(s), ${warnings.length} warning(s)`);
    console.log('\nEvidence documents must contain all required sections.');
    console.log('See specs/phase-5-table-stakes/00-phase5-execution-plan.md, Section 11.');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} warning(s), 0 errors`);
  }

  console.log(`\n✅ All ${evidenceFiles.length} evidence file(s) pass structural validation.`);
  process.exit(0);
}

main();
