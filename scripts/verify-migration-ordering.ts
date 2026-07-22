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

/**
 * Verify the snapshot chain in meta/ is in lockstep with the journal:
 *
 *   1. Count of NNNN_snapshot.json files == journal entry count.
 *   2. For each journal idx N, meta/NNNN_snapshot.json must exist (zero-padded
 *      to 4 digits, matching drizzle-kit's output).
 *
 * Drizzle-kit advances the snapshot chain on every `generate`. If the chain
 * stops being updated while new SQL files keep landing, `drizzle-kit generate`
 * starts producing duplicate-content migrations because it has no fresh
 * baseline to diff against. That is exactly how we ended up with idx 0021–
 * 0024 being byte-identical copies of 0020 and required a full re-baseline
 * of 114 SQL files. See project_drizzle_snapshot_collision.md.
 */
function checkSnapshotChainIntact(entries: JournalEntry[]): Problem[] {
  const problems: Problem[] = [];
  const metaDir = join(migrationsDir, 'meta');

  let metaFiles: string[];
  try {
    metaFiles = readdirSync(metaDir);
  } catch {
    problems.push({
      severity: 'error',
      message: `Cannot read migrations meta directory: ${metaDir}`,
    });
    return problems;
  }

  const snapshotFiles = metaFiles.filter((f) => /^\d{4}_snapshot\.json$/.test(f));

  if (snapshotFiles.length !== entries.length) {
    problems.push({
      severity: 'error',
      message:
        `Snapshot/journal drift: ${snapshotFiles.length} snapshot file(s) in meta/ ` +
        `but journal has ${entries.length} entries. ` +
        `Drizzle-kit must advance the snapshot chain on every generate; if these ` +
        `diverge, future generate runs produce duplicate-content migrations against ` +
        `a stale baseline (see project_drizzle_snapshot_collision.md).`,
    });
  }

  for (const entry of entries) {
    const expected = `${String(entry.idx).padStart(4, '0')}_snapshot.json`;
    if (!metaFiles.includes(expected)) {
      problems.push({
        severity: 'error',
        message: `Journal idx ${entry.idx} (${entry.tag}) is missing meta/${expected}`,
      });
    }
  }

  return problems;
}

/**
 * Verify that the table CONTENT of the snapshot chain is continuous — not just
 * that the right number of snapshot files exist (checkSnapshotChainIntact) or
 * that prevId pointers line up.
 *
 * For each consecutive journal pair (prev → curr), every table present in the
 * prev snapshot must still be present in the curr snapshot UNLESS curr's own
 * migration SQL actually drops it (`DROP TABLE ["public".]"name"`). A table
 * that silently vanishes from a snapshot without a matching DROP is metadata
 * rot: `drizzle-kit generate` will then re-`CREATE TABLE` an object that is
 * already live in prod, and the spurious migration fails or duplicates objects.
 *
 * This is exactly the class of bug that parallel-developed migrations reintroduce:
 * two branches generate snapshots off the same pre-baseline, and when the second
 * merges its prevId is reconciled but the first branch's new table is dropped
 * from the tip snapshot's `tables` map. checkSnapshotChainIntact cannot see it —
 * it only validates entry count and per-idx file existence, not table continuity.
 */
function extractDroppedTables(sql: string): Set<string> {
  const dropped = new Set<string>();
  // Match: DROP TABLE [IF EXISTS] ["public".]"table_name" — quoted or bare.
  const re = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?public"?\s*\.\s*)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    dropped.add(m[1]);
  }
  return dropped;
}

function snapshotTableNames(snapshotPath: string): Set<string> {
  const raw = readFileSync(snapshotPath, 'utf-8');
  const snap = JSON.parse(raw) as { tables?: Record<string, unknown> };
  const names = new Set<string>();
  for (const key of Object.keys(snap.tables ?? {})) {
    // Keys are "schema.table" (e.g. "public.storm_damage_reports"); take the
    // final dotted segment as the bare table name.
    names.add(key.split('.').pop() as string);
  }
  return names;
}

function checkSnapshotTableContinuity(entries: JournalEntry[]): Problem[] {
  const problems: Problem[] = [];
  const metaDir = join(migrationsDir, 'meta');

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];

    const prevSnap = join(metaDir, `${String(prev.idx).padStart(4, '0')}_snapshot.json`);
    const currSnap = join(metaDir, `${String(curr.idx).padStart(4, '0')}_snapshot.json`);
    const currSql = join(migrationsDir, `${curr.tag}.sql`);

    let prevTables: Set<string>;
    let currTables: Set<string>;
    let droppedTables: Set<string>;
    try {
      prevTables = snapshotTableNames(prevSnap);
      currTables = snapshotTableNames(currSnap);
      droppedTables = extractDroppedTables(readFileSync(currSql, 'utf-8'));
    } catch {
      // Missing files are already reported by checkSnapshotChainIntact /
      // checkMigrationFilesExist — skip so we don't double-report.
      continue;
    }

    for (const table of prevTables) {
      if (currTables.has(table)) continue;
      if (droppedTables.has(table)) continue;
      problems.push({
        severity: 'error',
        message:
          `Snapshot table rot: "${table}" is present in meta/${String(prev.idx).padStart(4, '0')}_snapshot.json ` +
          `but missing from meta/${String(curr.idx).padStart(4, '0')}_snapshot.json (${curr.tag}), ` +
          `yet that migration's SQL contains no DROP TABLE for it. ` +
          `The tip snapshot lost a live table — \`drizzle-kit generate\` will re-CREATE it. ` +
          `Repair the snapshot's tables map (union of the predecessor plus this migration's additions). ` +
          `This is the parallel-migration-merge drift class from project_drizzle_snapshot_collision.md.`,
      });
    }
  }

  return problems;
}

/**
 * SQL files known to exist on disk without a corresponding journal entry.
 *
 * Historical artifacts from before the migration journal was strictly
 * enforced. Adding new entries here is NOT acceptable — any new migration
 * MUST go through `drizzle-kit generate` so the journal is updated
 * atomically.
 *
 * The 2026-05-06 drizzle re-baseline (PR #191) moved every pre-baseline SQL
 * file into `packages/db/migrations/_archive/`, so this set is currently
 * empty. The strengthened orphan check below only scans `migrations/` root
 * and ignores `_archive/`, which means archived files cannot trip it. The
 * set is kept as a future escape hatch for legitimately grandfathered
 * cases.
 */
const KNOWN_ORPHAN_MIGRATION_FILES = new Set<string>([]);

/**
 * Allowlist of historical 4-digit migration prefixes that are knowingly
 * duplicated. Empty by design: the 2026-05-06 re-baseline moved every
 * pre-baseline SQL file into `_archive/` (which this check does not scan),
 * so the live `migrations/` root has unique prefixes today. New duplicates
 * must NOT be added — pick a fresh number.
 */
const DUPLICATE_FILE_PREFIX_ALLOWLIST = new Set<string>([]);

function checkDuplicateFilePrefixes(): Problem[] {
  let sqlFiles: string[];
  try {
    sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  } catch {
    return [];
  }

  const prefixToFiles = new Map<string, string[]>();
  for (const file of sqlFiles) {
    const match = file.match(/^(\d{4})_/);
    if (!match) continue;
    const prefix = match[1];
    const existing = prefixToFiles.get(prefix);
    if (existing) {
      existing.push(file);
    } else {
      prefixToFiles.set(prefix, [file]);
    }
  }

  const problems: Problem[] = [];
  for (const [prefix, files] of prefixToFiles.entries()) {
    if (files.length <= 1) continue;
    if (DUPLICATE_FILE_PREFIX_ALLOWLIST.has(prefix)) {
      problems.push({
        severity: 'warning',
        message: `Allowlisted historical duplicate prefix ${prefix}: ${files.join(', ')}`,
      });
      continue;
    }
    problems.push({
      severity: 'error',
      message: `Duplicate migration file prefix ${prefix}: ${files.join(', ')}. Pick a fresh number.`,
    });
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

  const journalTags = new Set(entries.map(e => e.tag));

  // STRICT: every SQL file in the migrations directory must correspond to a
  // journal entry (matched by tag = filename minus `.sql`). The previous
  // version of this guard only checked for SQL files *beyond* the last
  // journal index, missing orphan files at lower indices — that is exactly
  // the drift class we want to prevent.
  const orphanFiles = sqlFiles.filter((file) => {
    const tag = file.replace(/\.sql$/, '');
    if (journalTags.has(tag)) return false;
    if (KNOWN_ORPHAN_MIGRATION_FILES.has(file)) return false;
    return true;
  });

  if (orphanFiles.length > 0) {
    problems.push({
      severity: 'error',
      message:
        `${orphanFiles.length} SQL file(s) exist on disk without a journal entry: ` +
        orphanFiles.join(', ') +
        '. Generate migrations via `drizzle-kit generate` so the journal stays ' +
        'authoritative. To grandfather a historical file, add it to ' +
        'KNOWN_ORPHAN_MIGRATION_FILES with a comment explaining why.',
    });
  }

  // Also surface known orphans as a warning each run so they don't get
  // forgotten — the goal is to drain this set, not grow it.
  if (KNOWN_ORPHAN_MIGRATION_FILES.size > 0) {
    problems.push({
      severity: 'warning',
      message:
        `${KNOWN_ORPHAN_MIGRATION_FILES.size} grandfathered orphan migration file(s) ` +
        `still present (see KNOWN_ORPHAN_MIGRATION_FILES). These need DB-side ` +
        `reconciliation to either be added to the journal or removed.`,
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

  console.log('Checking for duplicate file prefixes...');
  allProblems.push(...checkDuplicateFilePrefixes());

  console.log('Checking reserved range overlaps...');
  allProblems.push(...checkRangeOverlaps());

  console.log('Checking snapshot chain integrity...');
  allProblems.push(...checkSnapshotChainIntact(journal.entries));

  console.log('Checking snapshot table continuity...');
  allProblems.push(...checkSnapshotTableContinuity(journal.entries));

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
