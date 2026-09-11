/**
 * Reconcile the migration files against a database's drizzle ledger.
 *
 * Usage:  DATABASE_URL=… pnpm db:ledger:verify
 *         scripts/with-env-local.sh pnpm db:ledger:verify     # against PRODUCTION
 *
 * ## Why this exists
 *
 * `.claude/rules/migration-safety.md` says to "keep `__drizzle_migrations`
 * reconciled with what's actually applied". Nothing checked it. Migrations here
 * are applied to production BY HAND — `apply_migration` does not write drizzle's
 * ledger, so every row is typed in by a person — and the ledger is the input to
 * drizzle's own apply gate. It drifts silently and in four distinct ways, all
 * four of which happened in this repo inside 48 hours in September 2026:
 *
 *   orphan       a ledger row whose hash matches no migration file. 0069's
 *                platform-admin guard was applied to prod from a branch that
 *                was never pushed (fixed by #1068).
 *   mismatch     a row whose `created_at` disagrees with its file's journal
 *                `when`. That same row, after the file was renumbered.
 *   unapplied    a file on main with no ledger row.
 *   stranded     unapplied AND unreachable: drizzle applies a migration only
 *                when `lastApplied.created_at < folderMillis`, so a file whose
 *                `when` sits below the ledger's max can never be applied by
 *                `drizzle-kit migrate` again. It does not error — it does
 *                nothing. `0062_secret_ballot` is in exactly this state.
 *
 * Diagnosing the 0069 collision needed all of this written from scratch. This is
 * that script, kept.
 *
 * ## Why it is NOT a CI guard, and must not become one
 *
 * A freshly-migrated database is reconciled BY CONSTRUCTION: `drizzle-kit
 * migrate` walks the same files this script hashes and writes a row for each.
 * Measured 2026-09-07 — `main` had 70 journal entries; the disposable local test
 * DB had 70 ledger rows including `0062_secret_ballot`, while production had 69.
 *
 * So run against CI's ephemeral Postgres this check passes unconditionally.
 * That is worse than not running it: `.claude/rules/verification.md` calls a
 * check that cannot fail "worse than no guard — it reports green while not
 * guarding anything". Drift only exists in a long-lived, hand-managed database,
 * which means production. It is therefore an operator command, deliberately in
 * the `db:*` namespace rather than `guard:*`, and deliberately absent from
 * `scripts/run-lint-guards.mjs`.
 *
 * What CI *can* check is here too, and does run: `reconcile()` is pure and unit
 * tested, and a `KNOWN_UNAPPLIED_MIGRATIONS` entry naming a file that does not
 * exist is reported as a violation rather than quietly ignored.
 *
 * ## Read-only
 *
 * One SELECT. It never writes, so it is safe against production at any time —
 * the same posture as `scripts/verify-stripe-mode.ts`. That is the point: the
 * only database where the answer means anything is the one you must not break.
 *
 * ## Exit codes
 *
 *   0 — reconciled (possibly with warnings for expected-unapplied migrations)
 *   1 — drift found
 *   2 — could not check (no DATABASE_URL, connection failed, no migration files,
 *       or an empty ledger); refuses to report success from a comparison it
 *       could not make
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { databaseHost } from './lib/stripe-guards';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const MIGRATIONS_DIR = join(repoRoot, 'packages/db/migrations');

/**
 * Migrations deliberately present on `main` and deliberately NOT applied.
 *
 * `{ tag, reason }` rather than a bare string set, following the per-root
 * `exemptions` lists in verify-internal-cron-auth.ts: an exception that
 * cannot say why it exists is indistinguishable from one nobody has revisited.
 * An entry naming a tag with no migration file is itself a violation, so the
 * list cannot rot into a set of names that mean nothing.
 */
export const KNOWN_UNAPPLIED_MIGRATIONS: ReadonlyArray<{ tag: string; reason: string }> = [
  {
    tag: '0062_secret_ballot',
    reason:
      'Secret-ballot elections ship disabled (Wave 6, 2026-08-10) and this is a ' +
      'CONTRACT migration: it drops five live columns from election_ballots ' +
      '(submission_id, unit_id, voter_hash, is_proxy_vote, proxy_id) plus two FK ' +
      'constraints and three indexes. The expand/contract precondition — that the ' +
      'code which stopped reading those columns is live — is now MET, so that is ' +
      'no longer what holds this back: the remaining blocker is that e-voting has ' +
      'not cleared attorney review (legal-risk audit F-08), and applying this ' +
      'buys nothing while the feature is gated off. Note the ordering has ' +
      'inverted — the live code now REQUIRES this migration, so enabling ' +
      'electionsAttorneyReviewed without applying it first 500s the first ballot ' +
      'cast. Recorded as ON HOLD in docs/DEPLOYMENT.md §7.3.',
  },
];

export interface MigrationFile {
  idx: number;
  tag: string;
  /** The journal `when`, which is what a correct ledger row records as created_at. */
  when: number;
  sha256: string;
  /**
   * Tables the migration's DDL names. Used to say WHICH tables a held migration
   * leaves CI and production disagreeing about — the fork below is abstract
   * until it names the tables whose tests are lying to you.
   */
  tables: readonly string[];
}

export interface LedgerRow {
  hash: string;
  /** `bigint` in Postgres and NULLABLE, so a row can genuinely have none. */
  createdAt: number | null;
}

export interface ReconcileResult {
  filesScanned: number;
  ledgerRows: number;
  /** Highest created_at in the ledger — the value drizzle's apply gate compares against. */
  ledgerTip: number | null;
  applied: string[];
  orphans: LedgerRow[];
  /** Unapplied and NOT in the allowlist. These are errors. */
  unapplied: MigrationFile[];
  /** Unapplied and allowlisted. Reported, not failed. */
  expectedUnapplied: Array<{ file: MigrationFile; reason: string }>;
  /** Unapplied AND below the ledger tip — drizzle can never apply these. */
  stranded: MigrationFile[];
  timestampMismatches: Array<{ tag: string; journalWhen: number; ledgerCreatedAt: number | null }>;
  /** Allowlist entries naming a tag that has no migration file. */
  deadAllowlistEntries: string[];
}

/**
 * Tables a migration's DDL names.
 *
 * Deliberately a scan for the handful of statement shapes this repo writes, not
 * a SQL parser — the output is prose for a human, so a missed exotic form costs
 * a less specific sentence, never a wrong verdict. Comments are stripped first
 * because every migration here carries a long prose header that names tables.
 */
export function tablesTouchedBy(sql: string): string[] {
  const code = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  const found = new Set<string>();
  const patterns = [
    /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?(?:public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi,
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(?:public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi,
    /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?(?:public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi,
    /\bON\s+"?(?:public"?\.)?"?([a-z_][a-z0-9_]*)"?\s*(?:USING|\()/gi,
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) found.add(m[1]!.toLowerCase());
  }
  return [...found].sort();
}

/**
 * Compare files against ledger rows. Pure — no filesystem, no database, no
 * printing — which is what lets CI test the logic even though CI can never
 * meaningfully run the check itself.
 */
export function reconcile(
  files: readonly MigrationFile[],
  ledger: readonly LedgerRow[],
  knownUnapplied: ReadonlyArray<{ tag: string; reason: string }> = KNOWN_UNAPPLIED_MIGRATIONS,
): ReconcileResult {
  const byHash = new Map(ledger.map((row) => [row.hash, row]));
  const fileHashes = new Set(files.map((f) => f.sha256));
  const allowed = new Map(knownUnapplied.map((e) => [e.tag, e.reason]));

  /*
   * The tip is the ONLY thing drizzle's gate reads: `dialect.js` selects
   * `order by created_at desc limit 1` and applies when that value is less than
   * the migration's folderMillis. A null created_at cannot participate.
   */
  const stamps = ledger.map((r) => r.createdAt).filter((v): v is number => v !== null);
  const ledgerTip = stamps.length > 0 ? Math.max(...stamps) : null;

  const applied: string[] = [];
  const unapplied: MigrationFile[] = [];
  const expectedUnapplied: ReconcileResult['expectedUnapplied'] = [];
  const stranded: MigrationFile[] = [];
  const timestampMismatches: ReconcileResult['timestampMismatches'] = [];

  for (const file of files) {
    const row = byHash.get(file.sha256);
    if (row) {
      applied.push(file.tag);
      if (row.createdAt !== file.when) {
        timestampMismatches.push({
          tag: file.tag,
          journalWhen: file.when,
          ledgerCreatedAt: row.createdAt,
        });
      }
      continue;
    }

    const reason = allowed.get(file.tag);
    if (reason !== undefined) expectedUnapplied.push({ file, reason });
    else unapplied.push(file);

    // Strandedness is orthogonal to whether the absence was expected: a
    // deliberately-held migration is still unreachable, and whoever finally
    // ships it needs to know the tool will silently skip it.
    if (ledgerTip !== null && file.when < ledgerTip) stranded.push(file);
  }

  return {
    filesScanned: files.length,
    ledgerRows: ledger.length,
    ledgerTip,
    applied,
    orphans: ledger.filter((row) => !fileHashes.has(row.hash)),
    unapplied,
    expectedUnapplied,
    stranded,
    timestampMismatches,
    deadAllowlistEntries: knownUnapplied
      .filter((e) => !files.some((f) => f.tag === e.tag))
      .map((e) => e.tag),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function couldNotCheck(msg: string): never {
  console.error(`✖ db:ledger:verify — COULD NOT CHECK\n  ${msg}`);
  process.exit(2);
}

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

/** Read the journal and hash each migration's bytes. */
function readMigrationFiles(): MigrationFile[] {
  const journalPath = join(MIGRATIONS_DIR, 'meta/_journal.json');
  if (!existsSync(journalPath)) {
    couldNotCheck(
      `No journal at ${journalPath} — refusing to report a reconciled ledger from a tree with no migrations.`,
    );
  }

  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: JournalEntry[] };
  return journal.entries.map((entry) => {
    const sqlPath = join(MIGRATIONS_DIR, `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) {
      couldNotCheck(
        `Journal entry idx=${entry.idx} names ${entry.tag}.sql, which does not exist. ` +
          'The tree is inconsistent; fix that before trusting a ledger comparison.',
      );
    }
    // Hash the BYTES, exactly as the manual-apply procedure records them.
    const bytes = readFileSync(sqlPath);
    return {
      idx: entry.idx,
      tag: entry.tag,
      when: entry.when,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      tables: tablesTouchedBy(bytes.toString('utf8')),
    };
  });
}

function summarize(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function run(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    couldNotCheck(
      'Missing DATABASE_URL. This check needs the database whose ledger you want to ' +
        'reconcile — for production, `scripts/with-env-local.sh pnpm db:ledger:verify` ' +
        '(safe: this script issues no writes).',
    );
  }

  const files = readMigrationFiles();
  if (files.length === 0) {
    couldNotCheck('The journal has no entries. An empty population cannot reconcile to anything.');
  }

  console.log(`Migration ledger reconciliation — database host: ${databaseHost(databaseUrl)}`);

  let exitCode = 1;
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    /*
     * `created_at` is bigint, which postgres-js returns as a string to avoid
     * losing precision. Cast in SQL and coerce in JS rather than comparing a
     * string to a number and silently reporting every row as a mismatch.
     */
    const rows = await sql<Array<{ hash: string; created_at: string | null }>>`
      select hash, created_at::text as created_at
        from drizzle.__drizzle_migrations
    `;

    if (rows.length === 0) {
      couldNotCheck(
        'The ledger is empty. That is not "every migration is an orphan" — it is a ' +
          'database this script cannot say anything about. Check DATABASE_URL.',
      );
    }

    const ledger: LedgerRow[] = rows.map((r) => ({
      hash: r.hash,
      createdAt: r.created_at === null ? null : Number(r.created_at),
    }));

    const result = reconcile(files, ledger);
    exitCode = report(result);
  } catch (error) {
    // A query failure is "could not check", not "clean" and not "drift".
    couldNotCheck(`Could not read drizzle.__drizzle_migrations: ${summarize(error)}`);
  } finally {
    try {
      await sql.end({ timeout: 5 });
    } catch (error) {
      console.error(`Could not close the postgres-js client cleanly: ${summarize(error)}`);
      exitCode = 1;
    }
  }

  return exitCode;
}

/**
 * What the run has to say, split by whether it is a FINDING or a DECISION.
 *
 * Pure and exported so the wording itself can be tested, which is not fussiness:
 * an earlier version of this output caused a separate session to open a task
 * called "Apply missing 0062_secret_ballot migration to production" and start
 * working on it. Nothing was wrong with the reconciliation — it was the prose.
 * Two mistakes, both mine:
 *
 *   - A held migration was labelled `⚠️ EXPECTED-UNAPPLIED`. A warning glyph
 *     over a passive noun phrase reads as "something is off here", when the
 *     truth is the opposite: this is the state somebody chose.
 *   - It then ALSO printed a `STRANDED` block ending "Shipping it needs a manual
 *     apply plus a hand-written ledger row" — instructions for doing the exact
 *     thing the line above forbids, printed directly underneath it.
 *
 * So a held entry now gets ONE block that leads with DO NOT APPLY, says outright
 * that there is nothing to do, and subordinates the mechanical note under an
 * explicit precondition. A stranded migration that is NOT held stays a finding
 * and keeps its actionable framing — it is folded into that entry's own problem
 * rather than printed twice.
 */
export interface ReportOutput {
  /** Recorded decisions. Printed to stdout; do not affect the exit code. */
  notes: string[];
  /** Real drift. Printed to stderr; exit 1. */
  problems: string[];
  exitCode: 0 | 1;
}

export function formatReport(r: ReconcileResult): ReportOutput {
  const problems: string[] = [];
  const notes: string[] = [];
  const strandedTags = new Set(r.stranded.map((f) => f.tag));

  for (const row of r.orphans) {
    problems.push(
      `ORPHAN     ledger row hash=${row.hash.slice(0, 16)}… created_at=${row.createdAt} ` +
        'matches no migration file. It was applied from a branch that never landed, or ' +
        'the file was edited after applying.',
    );
  }
  for (const m of r.timestampMismatches) {
    problems.push(
      `MISMATCH   ${m.tag}: ledger created_at=${m.ledgerCreatedAt} but the journal says ` +
        `when=${m.journalWhen}. Drizzle's apply gate reads created_at, so the two must agree.`,
    );
  }
  for (const f of r.unapplied) {
    // Stranding is folded in rather than printed as its own block: one entry per
    // migration, and for an UNHELD migration this genuinely is actionable.
    const stranded = strandedTags.has(f.tag)
      ? ` It is also below the ledger tip (${r.ledgerTip}), so \`drizzle-kit migrate\` would ` +
        'skip it silently rather than erroring — applying it means doing so by hand.'
      : '';
    problems.push(
      `UNAPPLIED  ${f.tag} (when=${f.when}) is on disk with no ledger row, and is not in ` +
        'KNOWN_UNAPPLIED_MIGRATIONS. Either apply it and record the row, or add it to that ' +
        `list with a reason.${stranded}`,
    );
  }
  for (const tag of r.deadAllowlistEntries) {
    problems.push(
      `DEAD ENTRY KNOWN_UNAPPLIED_MIGRATIONS names ${tag}, which has no migration file. ` +
        'Remove it so the list keeps meaning something.',
    );
  }

  for (const { file, reason } of r.expectedUnapplied) {
    const tables = file.tables.length > 0 ? file.tables.join(', ') : '(none parsed)';
    const lines = [
      `🔒 HELD — DO NOT APPLY  ${file.tag}`,
      `    ${reason}`,
      '',
      '    This is a recorded decision, not a finding. There is nothing to do here,',
      '    and this command exits 0 because of it. Do not open a task to "apply the',
      '    missing migration" — it is not missing.',
      '',
      /*
       * The consequence nobody writes down, and the reason a held migration can
       * hide a production defect indefinitely.
       *
       * `db:test-local:reset` and the CI service container apply EVERY migration
       * on disk. Production has only the ones somebody applied. So holding one
       * forks the two schemas, and every test touching its tables validates a
       * shape production does not have — in the feature most likely to be
       * switched on later without re-testing, because it is the one that was
       * gated.
       *
       * Measured on 0062_secret_ballot, 2026-09-07: CI had the five columns
       * dropped and `selection_digest` present; prod was the exact inverse. All
       * 173 election tests passed against a schema prod has never had, which is
       * why an INVERTED dependency — live code needing the held migration —
       * survived undetected until it was read by hand.
       */
      '    CI/PROD SCHEMA FORK. Local and CI apply every migration on disk; production',
      '    has only what was applied to it. So tests run against a schema that INCLUDES',
      `    this migration and production does not. Anything touching ${tables}`,
      '    is validated against a shape prod lacks — a green suite cannot tell you what',
      '    production will do with those tables. Re-test against prod\'s real schema',
      '    before switching the gated feature on.',
    ];
    if (strandedTags.has(file.tag)) {
      lines.push(
        '',
        '    One mechanical note, for whenever that decision is deliberately reversed —',
        `    NOT a step to take now. Its \`when\` (${file.when}) is below the ledger tip`,
        `    (${r.ledgerTip}), so \`drizzle-kit migrate\` would report success and do`,
        '    nothing — it has to be applied by hand and the ledger row written. Note',
        '    which way the dependency runs: the code that stopped reading those columns',
        '    is already live and now depends on this, so whoever reverses the decision',
        '    applies the migration FIRST and only then enables the feature.',
      );
    }
    notes.push(lines.join('\n'));
  }

  return { notes, problems, exitCode: problems.length > 0 ? 1 : 0 };
}

/** Print the findings and decide the exit code. Returns 0 or 1. */
function report(r: ReconcileResult): number {
  const { notes, problems, exitCode } = formatReport(r);

  console.log(
    `\nmigration files: ${r.filesScanned} · ledger rows: ${r.ledgerRows} · ` +
      `applied: ${r.applied.length} · ledger tip: ${r.ledgerTip}`,
  );

  for (const note of notes) console.log(`\n${note}`);

  if (problems.length > 0) {
    console.error(`\n❌ ${problems.length} ledger problem(s):\n`);
    for (const p of problems) console.error(`  ${p}`);
    return exitCode;
  }

  console.log('\n✅ Ledger reconciles with the migration files.');
  return exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run()
    .then((exitCode) => process.exit(exitCode))
    .catch((error) => {
      console.error(`✖ db:ledger:verify — unexpected error: ${summarize(error)}`);
      process.exit(2);
    });
}
