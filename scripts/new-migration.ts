/**
 * Hand-authored migration scaffolder.
 *
 * Usage:  pnpm db:migration:new <snake_case_name>
 * Example: pnpm db:migration:new close_rls_gaps
 *
 * Creates the three files a hand-written migration needs, so nobody has to edit
 * meta/_journal.json by hand:
 *
 *   packages/db/migrations/NNNN_<name>.sql
 *   packages/db/migrations/meta/_journal.json   (appended entry)
 *   packages/db/migrations/meta/NNNN_snapshot.json
 *
 * WHY THIS EXISTS
 *
 * WHY THE INDEX IS NOT SIMPLY `local maxIdx + 1`
 *
 * It was, and that is how migration 0069 came to be claimed twice. A branch cut
 * before `0068_support_inbox` merged had a local journal topping out at 67, so
 * this scaffolder would have said 0068 — a number main had already taken.
 * `.claude/rules/migration-safety.md` tells authors to consult main and the prod
 * ledger instead, which is right for avoiding a PROD collision and is precisely
 * what manufactures a BRANCH collision: the number it yields is a snapshot of a
 * moving target. 0069 was free at 23:38 and taken at 00:03.
 *
 * So the floor is `max(local journal, origin/main journal) + 1`. That cannot
 * hand out a number main already owns, and it is the same baseline
 * `verify-migration-ordering.ts` checks against — a scaffolded migration is now
 * clean by construction rather than caught after the fact.
 *
 * It still cannot see an unpushed sibling branch or a number applied to prod
 * ahead of main, so it prints the reminder to check both. Prod runs AHEAD of
 * main; that part remains a human step.
 *
 * The journal entry's `when` used to be hand-derived by adding 60000 to the
 * previous entry. Two branches cut from the same commit therefore computed the
 * SAME value: PRs #852 and #853 both landed on when=1784511314576 (and idx 40),
 * which surfaced as a merge conflict rather than a check. `when` is now stamped
 * with Date.now() at authoring time, which cannot collide across branches.
 *
 * That is not just tidiness. drizzle records `created_at = journal when` and
 * gates applies on `lastApplied.created_at < migration.folderMillis`, so a
 * migration whose `when` is <= the newest applied value is SILENTLY SKIPPED —
 * no error, no output. Ascending wall-clock timestamps are what keep that gate
 * honest.
 *
 * WHEN NOT TO USE THIS
 *
 * Only for migrations that change no drizzle-tracked schema: RLS policies,
 * grants, triggers, functions, CHECK constraints, data backfills. It copies the
 * current tip snapshot verbatim, which is correct precisely because the tracked
 * schema is unchanged.
 *
 * If you are adding or altering a TABLE, use `pnpm --filter @propertypro/db
 * db:generate` instead — it writes a real snapshot diff. Copying the tip
 * snapshot for a schema change is how the chain rots: 0033_snapshot lost
 * storm_damage_reports that way, and db:generate then emitted a bogus migration
 * re-creating a table that already existed in production.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

// Shared with the guard deliberately: the scaffolder must pick its number
// against the SAME baseline the guard later checks against, or the two can
// disagree and a scaffolded migration fails the check that follows it.
import { readBaselineJournal } from './verify-migration-ordering';

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

export interface CreateMigrationResult {
  /** Repo-relative paths written. Empty when the tag already existed. */
  filesWritten: string[];
  idx: number;
  tag: string;
  when: number;
  /** True when an entry for this tag already existed and nothing was written. */
  skipped: boolean;
}

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

function padIndex(idx: number): string {
  return String(idx).padStart(4, '0');
}

function readJournal(journalPath: string): Journal {
  const raw = readFileSync(journalPath, 'utf8');
  const journal = JSON.parse(raw) as Journal;
  if (!Array.isArray(journal.entries)) {
    throw new Error(`Malformed journal (no entries array): ${journalPath}`);
  }
  return journal;
}

function stubSql(tag: string): string {
  return `-- ${tag}
--
-- WHY: <one paragraph. What was wrong or missing, and what this changes. The
-- migrations in this repo are read months later by someone deciding whether it
-- is safe to touch the same objects — 0037 and 0039 are the house style.>
--
-- SAFETY: <is this expand or contract? Per .claude/rules/migration-safety.md,
-- expand migrations are applied BEFORE the code that needs them, contract
-- migrations AFTER the code that stopped reading them. Pure policy/grant/trigger
-- repairs are order-independent — say which this is.>
--
-- Idempotent: <state why re-applying is safe, e.g. IF EXISTS guards, CREATE OR
-- REPLACE, or a REVOKE/GRANT that no-ops when already in the target state.>

-- Statements below. Separate them with \`;--> statement-breakpoint\` so drizzle
-- splits them the way the rest of the migrations do.
`;
}

/**
 * Append a migration to the journal and create its files.
 *
 * Idempotent by tag: if the journal already has this tag, nothing is written and
 * `skipped` is true. Refuses to overwrite any existing file otherwise.
 */
export function createMigration(options: {
  migrationsDir: string;
  name: string;
  /** Injectable for tests; defaults to wall-clock. */
  now?: () => number;
  /** Injectable for tests; defaults to crypto.randomUUID. */
  newId?: () => string;
  /**
   * Highest idx claimed on the baseline branch (`origin/main`), so the new
   * migration cannot reuse a number main already owns. Omitted means "unknown",
   * which falls back to the local journal alone — see the module docblock.
   */
  baselineMaxIdx?: number;
}): CreateMigrationResult {
  const { migrationsDir, name } = options;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? randomUUID;

  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid migration name "${name}". Use snake_case: lowercase letters, digits and ` +
        `underscores, starting with a letter (e.g. close_rls_gaps).`,
    );
  }

  const metaDir = join(migrationsDir, 'meta');
  const journalPath = join(metaDir, '_journal.json');
  const journal = readJournal(journalPath);

  // Idempotent by NAME, not by tag: the tag embeds the index, and a re-run picks
  // the next free index, so a tag comparison would never match and would happily
  // create a second migration with the same name.
  const existing = journal.entries.find((e) => new RegExp(`^\\d{4}_${name}$`).test(e.tag));
  if (existing) {
    return { filesWritten: [], idx: existing.idx, tag: existing.tag, when: existing.when, skipped: true };
  }

  const localMaxIdx = journal.entries.reduce((max, e) => Math.max(max, e.idx), -1);
  // `baselineMaxIdx` is injected rather than read here so tests stay hermetic —
  // they run against a fixture directory with no git repo behind it.
  const baselineMaxIdx = options.baselineMaxIdx ?? -1;
  const idx = Math.max(localMaxIdx, baselineMaxIdx) + 1;
  const tag = `${padIndex(idx)}_${name}`;

  const sqlPath = join(migrationsDir, `${tag}.sql`);
  const snapshotPath = join(metaDir, `${padIndex(idx)}_snapshot.json`);
  for (const path of [sqlPath, snapshotPath]) {
    if (existsSync(path)) {
      throw new Error(
        `Refusing to overwrite ${path}. The journal has no entry for ${tag}, but the file ` +
          `exists — reconcile by hand before re-running.`,
      );
    }
  }

  // Chain the snapshot off the current tip. Copying it verbatim is only correct
  // because this path is for migrations that change no drizzle-tracked schema
  // (see the module docblock).
  const tipEntry = journal.entries[journal.entries.length - 1];
  if (!tipEntry) {
    throw new Error('Journal has no entries; cannot chain a snapshot off an empty chain.');
  }
  const tipSnapshotPath = join(metaDir, `${padIndex(tipEntry.idx)}_snapshot.json`);
  const tipSnapshot = JSON.parse(readFileSync(tipSnapshotPath, 'utf8')) as Record<string, unknown>;
  const snapshot = { ...tipSnapshot, id: newId(), prevId: tipSnapshot['id'] };

  // Wall-clock, never derived from the previous entry — that derivation is what
  // made two branches collide.
  const when = now();

  writeFileSync(sqlPath, stubSql(tag), 'utf8');
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  journal.entries.push({ idx, version: '7', when, tag, breakpoints: true });
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');

  return {
    filesWritten: [sqlPath, snapshotPath, journalPath],
    idx,
    tag,
    when,
    skipped: false,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(
      [
        'Usage: pnpm db:migration:new <snake_case_name>',
        '',
        'Creates a hand-authored migration: the .sql stub, a journal entry stamped',
        'with wall-clock Date.now(), and a snapshot chained off the current tip.',
        '',
        'Use this for RLS policies, grants, triggers, functions and backfills —',
        'anything that leaves drizzle-tracked schema unchanged.',
        '',
        'Adding or altering a TABLE? Use `pnpm --filter @propertypro/db db:generate`',
        'instead, so the snapshot records a real diff.',
      ].join('\n'),
    );
    return;
  }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const migrationsDir = resolve(repoRoot, 'packages/db/migrations');

  /*
   * Warn and proceed rather than fail: scaffolding has to work on a plane, and
   * `verify-migration-ordering.ts` is the thing that BLOCKS on an unreadable
   * baseline (MIGRATION_BASELINE_REQUIRED=1 in localci's gate). Here the
   * baseline only raises the floor, so its absence degrades to the old
   * behaviour — with the reader told, rather than silently.
   */
  const baseline = readBaselineJournal();
  if (baseline === null) {
    console.warn(
      '⚠️  Could not read origin/main\'s journal, so the new index is based on this\n'
        + '   branch alone. That is how 0069 was claimed twice — run `git fetch origin main`\n'
        + '   and re-check with `pnpm exec tsx scripts/verify-migration-ordering.ts`.',
    );
  }
  const baselineMaxIdx = baseline
    ? baseline.entries.reduce((max, e) => Math.max(max, e.idx), -1)
    : undefined;

  const result = createMigration({ migrationsDir, name: args[0]!, baselineMaxIdx });

  if (result.skipped) {
    console.log(`✅ ${result.tag} already exists in the journal — nothing to do.`);
    return;
  }

  console.log(`✅ Created migration ${result.tag}`);
  for (const path of result.filesWritten) {
    console.log(`   ${relative(repoRoot, path)}`);
  }
  console.log(`\n   when = ${result.when} (${new Date(result.when).toISOString()})`);
  if (baselineMaxIdx !== undefined) {
    console.log(`   idx  = ${result.idx} (highest on ${baseline!.ref} is ${baselineMaxIdx})`);
  }
  console.log(
    '\n⚠️  PROD RUNS AHEAD OF main. This index clears main and this branch, but not a\n'
      + '   number already applied to production or claimed by an unpushed branch.\n'
      + '   Check: select max(created_at) from drizzle.__drizzle_migrations;',
  );
  console.log('\nNext: write the SQL, then `pnpm exec tsx scripts/verify-migration-ordering.ts`.');
  console.log('Migrations are applied to production MANUALLY — see .claude/rules/migration-safety.md.');
}

// Only run when invoked as a script, so importing createMigration in a test does
// not execute main().
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : 'new-migration failed.'}`);
    process.exit(1);
  }
}
