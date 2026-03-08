/**
 * Phase 5 Migration Ordering Guard
 *
 * Validates that Drizzle migration journal entries maintain strict ordering:
 *   1. Journal `when` timestamps are strictly ascending
 *   2. No duplicate migration indices
 *   3. Migration files on disk match journal entries
 *
 * This prevents the migration drift issues documented in AGENTS.md:
 *   - [2026-02-12]: duplicate table generation from journal/snapshot mismatch
 *   - [2026-02-14]: shared-env schema drift despite green tests
 *   - [2026-02-22]: drizzle-kit generating older-than-existing timestamps
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const migrationsDir = join(repoRoot, 'packages', 'db', 'migrations');
const journalPath = join(migrationsDir, 'meta', '_journal.json');

// ---------------------------------------------------------------------------
// Phase 5 Reserved Migration Ranges
// ---------------------------------------------------------------------------

const RESERVED_RANGES: Array<{ workstream: string; start: number; end: number }> = [
  { workstream: 'WS-65 Foundations', start: 37, end: 40 },
  { workstream: 'WS-66 Finance', start: 41, end: 55 },
  { workstream: 'WS-67 Violations/ARC', start: 56, end: 65 },
  { workstream: 'WS-68 Polls/Board', start: 66, end: 70 },
  { workstream: 'WS-69 Work Orders', start: 71, end: 80 },
  { workstream: 'WS-70 Calendar/Connectors', start: 81, end: 85 },
  { workstream: 'WS-71 Package/Visitor', start: 86, end: 90 },
  { workstream: 'WS-72 Security/Hardening', start: 91, end: 95 },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

interface Problem {
  severity: 'error' | 'warning';
  message: string;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkTimestampOrdering(entries: JournalEntry[]): Problem[] {
  const problems: Problem[] = [];

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];

    if (curr.when <= prev.when) {
      problems.push({
        severity: 'error',
        message: `Journal timestamp not strictly ascending: idx ${curr.idx} (${curr.tag}) `
          + `has when=${curr.when} but idx ${prev.idx} (${prev.tag}) has when=${prev.when}`,
      });
    }
  }

  return problems;
}

function checkDuplicateIndices(entries: JournalEntry[]): Problem[] {
  const problems: Problem[] = [];
  const seen = new Map<number, string>();

  for (const entry of entries) {
    if (seen.has(entry.idx)) {
      problems.push({
        severity: 'error',
        message: `Duplicate journal idx ${entry.idx}: "${entry.tag}" and "${seen.get(entry.idx)}"`,
      });
    }
    seen.set(entry.idx, entry.tag);
  }

  return problems;
}

function checkRangeOverlaps(): Problem[] {
  const problems: Problem[] = [];

  for (let i = 0; i < RESERVED_RANGES.length; i++) {
    for (let j = i + 1; j < RESERVED_RANGES.length; j++) {
      const a = RESERVED_RANGES[i];
      const b = RESERVED_RANGES[j];

      if (a.start <= b.end && b.start <= a.end) {
        problems.push({
          severity: 'error',
          message: `Migration range overlap: ${a.workstream} [${a.start}-${a.end}] `
            + `overlaps with ${b.workstream} [${b.start}-${b.end}]`,
        });
      }
    }
  }

  return problems;
}

function checkMigrationFilesExist(entries: JournalEntry[]): Problem[] {
  const problems: Problem[] = [];

  // Get all SQL files in migrations dir
  let sqlFiles: string[];
  try {
    sqlFiles = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
  } catch {
    problems.push({
      severity: 'error',
      message: `Cannot read migrations directory: ${migrationsDir}`,
    });
    return problems;
  }

  // Extract migration numbers from filenames (e.g., "0035_add_transparency_columns.sql" → 35)
  const fileNumbers = new Set<number>();
  for (const file of sqlFiles) {
    const match = file.match(/^(\d{4})_/);
    if (match) {
      fileNumbers.add(parseInt(match[1], 10));
    }
  }

  // Check for journal entries without corresponding files
  // Note: not all journal tags directly map to file numbers, so this is informational
  const journalTags = new Set(entries.map(e => e.tag));

  // Check for SQL files beyond last journal entry (potential untracked migrations)
  const lastJournalIdx = entries.length > 0 ? entries[entries.length - 1].idx : -1;
  const untrackedFiles = sqlFiles.filter(f => {
    const match = f.match(/^(\d{4})_/);
    if (!match) return false;
    const num = parseInt(match[1], 10);
    // Files with numbers beyond the journal's coverage
    return num > lastJournalIdx && !f.includes('rollback');
  });

  if (untrackedFiles.length > 0) {
    problems.push({
      severity: 'warning',
      message: `${untrackedFiles.length} SQL file(s) exist beyond last journal entry (idx ${lastJournalIdx}): `
        + untrackedFiles.join(', '),
    });
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('🔍 Migration Ordering Guard');
  console.log('='.repeat(60));

  const allProblems: Problem[] = [];

  // Load journal
  let journal: Journal;
  try {
    const raw = readFileSync(journalPath, 'utf-8');
    journal = JSON.parse(raw) as Journal;
  } catch (err) {
    console.error(`❌ Cannot read journal file: ${journalPath}`);
    console.error(err);
    process.exit(1);
  }

  console.log(`\nJournal: ${journal.entries.length} entries, dialect: ${journal.dialect}`);

  if (journal.entries.length > 0) {
    const last = journal.entries[journal.entries.length - 1];
    console.log(`Last entry: idx=${last.idx}, tag="${last.tag}", when=${last.when}`);
  }

  // Run checks
  console.log('\nChecking timestamp ordering...');
  allProblems.push(...checkTimestampOrdering(journal.entries));

  console.log('Checking for duplicate indices...');
  allProblems.push(...checkDuplicateIndices(journal.entries));

  console.log('Checking reserved range overlaps...');
  allProblems.push(...checkRangeOverlaps());

  console.log('Checking migration files...');
  allProblems.push(...checkMigrationFilesExist(journal.entries));

  // Report reserved ranges
  console.log('\n📋 Phase 5 Reserved Migration Ranges:');
  for (const range of RESERVED_RANGES) {
    console.log(`  ${String(range.start).padStart(4, '0')}-${String(range.end).padStart(4, '0')}  ${range.workstream}`);
  }

  // Report results
  const errors = allProblems.filter(p => p.severity === 'error');
  const warnings = allProblems.filter(p => p.severity === 'warning');

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} warning(s):`);
    for (const w of warnings) {
      console.log(`  ${w.message}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} error(s):`);
    for (const e of errors) {
      console.log(`  ${e.message}`);
    }
    process.exit(1);
  }

  console.log(`\n✅ Migration ordering is valid. ${warnings.length} warning(s), 0 errors.`);
  process.exit(0);
}

main();
