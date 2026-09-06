/**
 * Phase 5 Migration Ordering Guard
 *
 * Validates that Drizzle migration journal entries maintain strict ordering:
 *   1. Journal `when` timestamps are strictly ascending (ties are called out
 *      separately — a shared `when` makes drizzle's apply order undefined)
 *   2. No duplicate migration indices
 *   3. Migration files on disk match journal entries
 *   4. No new entry reuses an idx or `when` already taken on the baseline ref —
 *      the parallel-PR collision that checks 1-2 structurally cannot see
 *
 * This prevents the migration drift issues documented in AGENTS.md:
 *   - [2026-02-12]: duplicate table generation from journal/snapshot mismatch
 *   - [2026-02-14]: shared-env schema drift despite green tests
 *   - [2026-02-22]: drizzle-kit generating older-than-existing timestamps
 */
import { spawnSync } from 'node:child_process';
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
    // Both indices are inside the array by the loop bounds (1 <= i < length).
    const prev = entries[i - 1]!;
    const curr = entries[i]!;

    // Equality is called out separately from mis-ordering. Two entries sharing a
    // `when` is the signature of a parallel-PR collision (both branches derived
    // their timestamp from the same predecessor), and drizzle orders by `when`,
    // so a tie makes the apply order of those two migrations undefined.
    if (curr.when === prev.when) {
      problems.push({
        severity: 'error',
        message: `Duplicate journal when=${curr.when}: idx ${prev.idx} (${prev.tag}) `
          + `and idx ${curr.idx} (${curr.tag}). Drizzle orders by \`when\`, so their `
          + `apply order is undefined — give the later migration a strictly greater value.`,
      });
    } else if (curr.when < prev.when) {
      problems.push({
        severity: 'error',
        message: `Journal timestamp not strictly ascending: idx ${curr.idx} (${curr.tag}) `
          + `has when=${curr.when} but idx ${prev.idx} (${prev.tag}) has when=${prev.when}`,
      });
    }
  }

  return problems;
}

/**
 * Reject a migration that reuses an `idx` or `when` already taken on the base
 * branch.
 *
 * checkTimestampOrdering and checkDuplicateIndices only see ONE journal, so they
 * catch collisions within a branch. They cannot catch the case that actually
 * bites: two branches open at once, each appending what looks locally like the
 * next free slot. Both journals are internally valid, both pass CI, and the
 * clash only surfaces as a merge conflict — or, worse, as a silent git
 * auto-merge that leaves two entries sharing an idx.
 *
 * That is not hypothetical. PRs #852 and #853 both took idx 40 AND both derived
 * `when` 1784511314576 by adding 60000 to 0039's, because the repo's
 * hand-authored migrations copied that pattern rather than using wall-clock. It
 * was caught by a merge conflict, not by a check. `pnpm db:migration:new` now
 * stamps `when` with Date.now(), which cannot collide across branches.
 *
 * Three things are rejected: an idx already on the baseline, a `when` already on
 * the baseline, and a `when` OLDER than the baseline's newest — the last because
 * drizzle silently skips a migration whose `when` does not exceed the newest
 * applied one, so a long-lived branch can otherwise merge into oblivion.
 *
 * Compares against the baseline ref (default `origin/main`, override with
 * MIGRATION_BASELINE_REF). Entries already on the baseline under the same tag
 * are skipped — only what this branch ADDS is checked.
 */
export function checkBaselineCollisions(
  entries: JournalEntry[],
  baselineEntries: JournalEntry[],
): Problem[] {
  const problems: Problem[] = [];

  const baselineTags = new Set(baselineEntries.map(e => e.tag));
  const baselineByIdx = new Map(baselineEntries.map(e => [e.idx, e.tag] as const));
  const baselineByWhen = new Map(baselineEntries.map(e => [e.when, e.tag] as const));

  // Newest entry on the baseline, for the staleness check below.
  let baselineMax: JournalEntry | undefined;
  for (const e of baselineEntries) {
    if (baselineMax === undefined || e.when > baselineMax.when) baselineMax = e;
  }

  for (const entry of entries) {
    // Already on the baseline under this tag — not a new migration.
    if (baselineTags.has(entry.tag)) continue;

    const idxOwner = baselineByIdx.get(entry.idx);
    if (idxOwner !== undefined) {
      problems.push({
        severity: 'error',
        message: `Migration idx ${entry.idx} ("${entry.tag}") is already used on the baseline `
          + `by "${idxOwner}". Renumber this migration (and its NNNN_snapshot.json, `
          + `re-chaining prevId) to the next free slot.`,
      });
    }

    const whenOwner = baselineByWhen.get(entry.when);
    if (whenOwner !== undefined) {
      problems.push({
        severity: 'error',
        message: `Migration when=${entry.when} ("${entry.tag}") is already used on the baseline `
          + `by "${whenOwner}". Re-stamp it with \`Date.now()\` — deriving the timestamp from `
          + `the previous entry is what makes two branches collide.`,
      });
    } else if (baselineMax !== undefined && entry.when < baselineMax.when) {
      // Stale timestamp: nothing collides, but the merged journal would hold a
      // descending pair. drizzle records created_at = when and only applies a
      // migration when `lastApplied.created_at < folderMillis`, so this one would
      // be SILENTLY SKIPPED — no error, no output. Happens whenever a branch is
      // authored before migrations that merge ahead of it.
      problems.push({
        severity: 'error',
        message: `Migration when=${entry.when} ("${entry.tag}") is older than the newest `
          + `baseline entry "${baselineMax.tag}" (when=${baselineMax.when}). drizzle applies `
          + `only migrations whose \`when\` exceeds the last applied one, so this would be `
          + `silently skipped. Re-stamp it with \`Date.now()\` (or re-run `
          + `\`pnpm db:migration:new\`) after rebasing.`,
      });
    }
  }

  return problems;
}

/**
 * Read the journal as it exists on the baseline ref. Returns null (and the
 * caller degrades to a warning) when the ref is unreachable — a shallow
 * checkout, a detached worktree, or a fresh clone with no remote. Never fails
 * the build on its own, because "cannot see main" is an environment problem,
 * not a migration problem.
 */
function readBaselineJournal(): { entries: JournalEntry[]; ref: string } | null {
  const ref = process.env.MIGRATION_BASELINE_REF ?? 'origin/main';
  const result = spawnSync(
    'git',
    ['show', `${ref}:packages/db/migrations/meta/_journal.json`],
    { cwd: repoRoot, encoding: 'utf-8' },
  );

  if (result.status !== 0 || !result.stdout) return null;

  try {
    const parsed = JSON.parse(result.stdout) as Journal;
    if (!Array.isArray(parsed.entries)) return null;
    return { entries: parsed.entries, ref };
  } catch {
    return null;
  }
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
      // Both indices are inside the array by the loop bounds.
      const a = RESERVED_RANGES[i]!;
      const b = RESERVED_RANGES[j]!;

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
    // Group 1 is not optional in `re`, so a successful match always fills it.
    dropped.add(m[1]!);
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
    // Both indices are inside the array by the loop bounds (1 <= i < length).
    const prev = entries[i - 1]!;
    const curr = entries[i]!;

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
    // Group 1 is not optional in the pattern, so a match always fills it.
    const prefix = match[1]!;
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
    const last = journal.entries[journal.entries.length - 1]!;
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

  console.log('Checking for collisions with the baseline branch...');
  const baseline = readBaselineJournal();
  if (baseline === null) {
    allProblems.push({
      severity: 'warning',
      message: 'Skipped baseline-collision check: could not read '
        + `${process.env.MIGRATION_BASELINE_REF ?? 'origin/main'}:packages/db/migrations/meta/_journal.json. `
        + 'A shallow clone (actions/checkout defaults to fetch-depth 1) is the usual cause — '
        + 'this check needs the base branch fetched.',
    });
  } else {
    allProblems.push(...checkBaselineCollisions(journal.entries, baseline.entries));
  }

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

// Only run when invoked as a script. Without this, importing the module to unit
// test an exported check would execute main() and process.exit() out of the test
// runner.
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  main();
}
