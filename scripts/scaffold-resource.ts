/**
 * Resource scaffolder — Plan A4.
 *
 * Usage:  pnpm new:resource <plural-name> [--singular <singular>] [--target <dir>]
 * Example: pnpm new:resource gadgets
 *          pnpm new:resource categories --singular category
 *
 * Generates the canonical CRUD slice for a new resource:
 *
 *   packages/db/src/schema/<plural>.ts
 *   packages/db/migrations/<NNNN>_create_<plural>.sql              (+ journal entry)
 *   apps/web/src/lib/services/<plural>-service.ts
 *   apps/web/src/app/api/v1/<plural>/contract.ts
 *   apps/web/src/app/api/v1/<plural>/route.ts                       (wrapped in runRoute)
 *   apps/web/src/hooks/use<PluralPascal>.ts
 *   apps/web/src/app/(authenticated)/<plural>/page.tsx
 *   apps/web/src/app/(authenticated)/<plural>/<plural>-list.tsx
 *   apps/web/src/app/(authenticated)/<plural>/[id]/page.tsx
 *   apps/web/__tests__/api/<plural>/route.test.ts
 *   apps/web/__tests__/integration/<plural>.integration.test.ts
 *
 * Plus side effects: appends a re-export to packages/db/src/schema/index.ts
 * and a new entry to packages/db/migrations/meta/_journal.json.
 *
 * Implementation notes (kept boring on purpose):
 *
 *   - Templates live at scripts/scaffold-resource.test/fixtures/widgets/, as
 *     real working files for the canonical `widgets` resource. The scaffolder
 *     copies those bytes verbatim and substitutes the four name variants:
 *
 *         Widgets → PluralPascal     widgets → pluralLower
 *         Widget  → SingularPascal   widget  → singularLower
 *
 *     Order: replace longer variants first so substring overlap (widget vs
 *     widgets) doesn't silently corrupt output. Case-sensitive.
 *
 *   - Migration filename + journal entry pick up the next NNNN by reading
 *     the highest entry idx in meta/_journal.json and adding 1.
 *
 *   - We refuse to overwrite anything: every target path must be free
 *     before writing. Any collision aborts with a clear message.
 *
 *   - The new resource's RBAC entry is NOT auto-edited (the scaffold uses
 *     `permission: { resource: 'documents', action: 'read' }` as a
 *     placeholder). The author MUST add the resource to RBAC_RESOURCES in
 *     packages/shared/src/rbac-matrix.ts and tighten the permission. See
 *     docs/contributing/new-resource.md.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

interface CliOptions {
  plural: string;
  singular?: string;
  target?: string;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const positional: string[] = [];
  let singular: string | undefined;
  let target: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--singular') {
      singular = argv[++i];
      if (!singular) throw new Error('--singular requires a value');
    } else if (arg === '--target') {
      target = argv[++i];
      if (!target) throw new Error('--target requires a value');
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0);
    } else if (arg && arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (arg) {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    printUsageAndExit(1);
  }

  const plural = positional[0] as string;
  return { plural, ...(singular ? { singular } : {}), ...(target ? { target } : {}) };
}

function printUsageAndExit(code: number): never {
  const msg =
    'Usage: pnpm new:resource <plural-name> [--singular <singular>] [--target <dir>]\n' +
    '\n' +
    'Generates a full resource slice (schema, migration, service, contract, route,\n' +
    'hook, pages, and tests) for the new plural lowercase name. See\n' +
    'docs/contributing/new-resource.md for the recipe and required follow-ups.';
  if (code === 0) {
    console.log(msg);
  } else {
    console.error(msg);
  }
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Name derivation
// ---------------------------------------------------------------------------

interface ResourceNames {
  pluralLower: string;     // widgets
  singularLower: string;   // widget
  pluralPascal: string;    // Widgets
  singularPascal: string;  // Widget
}

const PLURAL_NAME_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function validatePlural(plural: string): void {
  if (!PLURAL_NAME_REGEX.test(plural)) {
    throw new Error(
      `Invalid resource name "${plural}". Use plural lowercase kebab-case ` +
        `(letters, digits, dashes; must start with a letter), e.g. "widgets", ` +
        `"document-categories", "work-orders".`,
    );
  }
  if (!plural.endsWith('s')) {
    throw new Error(
      `Resource name "${plural}" should be plural (end in 's'). Pass an ` +
        `explicit --singular if your plural is irregular ` +
        `(e.g. --singular category for categories).`,
    );
  }
}

function deriveSingular(plural: string, override: string | undefined): string {
  if (override) {
    if (!PLURAL_NAME_REGEX.test(override)) {
      throw new Error(
        `Invalid --singular "${override}". Use lowercase kebab-case (letters, ` +
          `digits, dashes; must start with a letter).`,
      );
    }
    return override;
  }
  // Drop trailing 's'. Crude but handles widgets→widget, residents→resident,
  // documents→document, units→unit. Irregular plurals (categories→category,
  // people→person) need --singular.
  return plural.slice(0, -1);
}

function toPascal(name: string): string {
  return name
    .split('-')
    .map((part) => (part.length === 0 ? '' : part[0]!.toUpperCase() + part.slice(1)))
    .join('');
}

function buildResourceNames(opts: CliOptions): ResourceNames {
  validatePlural(opts.plural);
  const singularLower = deriveSingular(opts.plural, opts.singular);
  return {
    pluralLower: opts.plural,
    singularLower,
    pluralPascal: toPascal(opts.plural),
    singularPascal: toPascal(singularLower),
  };
}

// ---------------------------------------------------------------------------
// Token substitution
//
// Single-pass regex replacement so a substituted value is never re-scanned.
// A chained `.replaceAll` sequence would corrupt names whose target string
// contains a later fixture token as a substring — e.g. `awidgets` would
// trigger `widget → awidget` AFTER `widgets → awidgets` and produce
// `aawidgets`. The single-pass form visits each position exactly once.
//
// Alternation order matters within the regex literal (longest variants
// first) so the engine prefers `Widgets`/`widgets` over `Widget`/`widget`
// at the same offset.
// ---------------------------------------------------------------------------

const FIXTURE_NAMES: ResourceNames = {
  pluralLower: 'widgets',
  singularLower: 'widget',
  pluralPascal: 'Widgets',
  singularPascal: 'Widget',
};

const FIXTURE_TOKEN_REGEX = /Widgets|widgets|Widget|widget/g;

function substituteNames(input: string, target: ResourceNames): string {
  return input.replace(FIXTURE_TOKEN_REGEX, (match) => {
    if (match === FIXTURE_NAMES.pluralPascal) return target.pluralPascal;
    if (match === FIXTURE_NAMES.pluralLower) return target.pluralLower;
    if (match === FIXTURE_NAMES.singularPascal) return target.singularPascal;
    return target.singularLower; // 'widget'
  });
}

// ---------------------------------------------------------------------------
// Migration index + journal handling
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

function readJournal(journalPath: string): Journal {
  const raw = readFileSync(journalPath, 'utf8');
  try {
    return JSON.parse(raw) as Journal;
  } catch {
    throw new Error(
      `Migration journal at ${journalPath} is not valid JSON. ` +
        `Check for merge conflict markers or a partial write.`,
    );
  }
}

function nextMigrationIndex(journal: Journal): number {
  let maxIdx = -1;
  for (const entry of journal.entries) {
    if (entry.idx > maxIdx) maxIdx = entry.idx;
  }
  return maxIdx + 1;
}

function padIndex(idx: number): string {
  return String(idx).padStart(4, '0');
}

// ---------------------------------------------------------------------------
// Fixture discovery + target path mapping
// ---------------------------------------------------------------------------

const scriptDir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(scriptDir, 'scaffold-resource.test/fixtures/widgets');

interface ScaffoldedFile {
  /** Path relative to repo root, with fixture name (`widgets`) substituted. */
  targetRel: string;
  /** Fully substituted file contents. */
  contents: string;
}

function listFixtureFilesRel(): string[] {
  const out: string[] = [];
  const walk = (absDir: string): void => {
    for (const entry of readdirSync(absDir)) {
      const abs = join(absDir, entry);
      const s = statSync(abs);
      if (s.isDirectory()) walk(abs);
      else if (s.isFile()) out.push(relative(FIXTURE_ROOT, abs));
    }
  };
  walk(FIXTURE_ROOT);
  return out.sort();
}

function targetRelFor(
  fixtureRel: string,
  names: ResourceNames,
  migrationIdx: number,
): string {
  // Translate directory + filename pieces — every segment runs through the
  // same name substitution. The migration file ALSO needs its leading
  // `0004_` rewritten to the next index.
  const segments = fixtureRel.split('/').map((seg) => substituteNames(seg, names));
  return segments
    .map((seg) => {
      // Migration filename: rewrite the leading `0004_` to the next index.
      const m = /^0004_(.*\.sql)$/.exec(seg);
      if (m) return `${padIndex(migrationIdx)}_${m[1]}`;
      return seg;
    })
    .join('/');
}

// ---------------------------------------------------------------------------
// Collision check
// ---------------------------------------------------------------------------

function ensureNoCollisions(repoRoot: string, files: ScaffoldedFile[]): void {
  const collisions: string[] = [];
  for (const f of files) {
    if (existsSync(resolve(repoRoot, f.targetRel))) {
      collisions.push(f.targetRel);
    }
  }
  if (collisions.length > 0) {
    throw new Error(
      `Refusing to overwrite ${collisions.length} existing file(s). Resource ` +
        `likely already exists. Delete or rename them, or pick a different ` +
        `resource name.\n\n` +
        collisions.map((p) => `  - ${p}`).join('\n'),
    );
  }
}

// ---------------------------------------------------------------------------
// Schema barrel + journal updates
// ---------------------------------------------------------------------------

function appendSchemaReexport(repoRoot: string, names: ResourceNames): void {
  const barrelPath = resolve(repoRoot, 'packages/db/src/schema/index.ts');
  const current = readFileSync(barrelPath, 'utf8');
  const exportLine = `export * from './${names.pluralLower}';`;
  if (current.includes(exportLine)) return; // idempotent: skip if already present
  const trimmed = current.endsWith('\n') ? current : `${current}\n`;
  writeFileSync(
    barrelPath,
    `${trimmed}\n// ${names.pluralPascal} (scaffolded by \`pnpm new:resource ${names.pluralLower}\` — Plan A4)\n${exportLine}\n`,
    'utf8',
  );
}

function appendJournalEntry(
  repoRoot: string,
  names: ResourceNames,
  migrationIdx: number,
): void {
  const journalPath = resolve(repoRoot, 'packages/db/migrations/meta/_journal.json');
  const journal = readJournal(journalPath);
  const tag = `${padIndex(migrationIdx)}_create_${names.pluralLower.replaceAll('-', '_')}`;
  // Idempotent: skip if the journal already has an entry for this tag.
  // Protects against a duplicate entry if scaffolded files were manually
  // deleted but the journal/barrel changes were left in place.
  if (journal.entries.some((e) => e.tag === tag)) return;
  journal.entries.push({
    idx: migrationIdx,
    version: '7',
    when: Date.now(),
    tag,
    breakpoints: true,
  });
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export interface ScaffoldResult {
  filesWritten: string[];      // repo-relative paths
  migrationIndex: number;
  schemaBarrelTouched: boolean;
  journalTouched: boolean;
}

export interface ScaffoldOptions {
  plural: string;
  singular?: string;
  /** Repo root to scaffold INTO. Defaults to the working tree root. */
  target?: string;
}

export function scaffoldResource(opts: ScaffoldOptions): ScaffoldResult {
  const repoRoot = opts.target ? resolve(opts.target) : resolve(scriptDir, '..');
  const names = buildResourceNames({ plural: opts.plural, ...(opts.singular ? { singular: opts.singular } : {}) });

  const journalPath = resolve(repoRoot, 'packages/db/migrations/meta/_journal.json');
  if (!existsSync(journalPath)) {
    throw new Error(
      `Cannot find migration journal at ${journalPath}. ` +
        `Pass --target <repo-root> if you're invoking the scaffolder from outside the repo.`,
    );
  }
  const migrationIdx = nextMigrationIndex(readJournal(journalPath));

  // Build the full list of files to emit before touching the filesystem so
  // any failure leaves nothing partially written.
  const fixtureRels = listFixtureFilesRel();
  const files: ScaffoldedFile[] = fixtureRels.map((fixtureRel) => {
    const fixturePath = join(FIXTURE_ROOT, fixtureRel);
    const raw = readFileSync(fixturePath, 'utf8');
    return {
      targetRel: targetRelFor(fixtureRel, names, migrationIdx),
      contents: substituteNames(raw, names),
    };
  });

  ensureNoCollisions(repoRoot, files);

  const written: string[] = [];
  for (const f of files) {
    const targetAbs = resolve(repoRoot, f.targetRel);
    mkdirSync(dirname(targetAbs), { recursive: true });
    writeFileSync(targetAbs, f.contents, 'utf8');
    written.push(f.targetRel);
  }

  appendSchemaReexport(repoRoot, names);
  appendJournalEntry(repoRoot, names, migrationIdx);

  return {
    filesWritten: written,
    migrationIndex: migrationIdx,
    schemaBarrelTouched: true,
    journalTouched: true,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function isInvokedDirectly(): boolean {
  // process.argv[1] is the script being run.
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  return resolve(invokedPath) === fileURLToPath(import.meta.url);
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const result = scaffoldResource(opts);

  console.log(`✅ Scaffolded resource "${opts.plural}" — ${result.filesWritten.length} files written.`);
  for (const f of result.filesWritten) console.log(`   • ${f}`);
  console.log('');
  console.log('Next steps (NOT automated — these are policy decisions):');
  console.log('');
  console.log(`  1. Add "${opts.plural}" to RBAC_RESOURCES in`);
  console.log('     packages/shared/src/rbac-matrix.ts and fill in the matrix cells.');
  console.log('');
  console.log(`  2. Replace the placeholder \`permission: { resource: 'documents', action: 'read' }\``);
  console.log(`     in apps/web/src/app/api/v1/${opts.plural}/contract.ts with`);
  console.log(`     \`{ resource: '${opts.plural}', action: 'read' }\` once step 1 is done.`);
  console.log('');
  console.log('  3. Customize the schema columns in');
  console.log(`     packages/db/src/schema/${opts.plural}.ts and the matching CREATE TABLE in`);
  console.log(`     packages/db/migrations/${padIndex(result.migrationIndex)}_create_${opts.plural.replaceAll('-', '_')}.sql.`);
  console.log('');
  console.log('  4. Apply the migration:  pnpm --filter @propertypro/db db:migrate');
  console.log('  5. Verify:               pnpm typecheck && pnpm lint && pnpm test');
  console.log('');
  console.log('See docs/contributing/new-resource.md for the full recipe.');
}

if (isInvokedDirectly()) {
  try {
    main();
  } catch (err) {
    if (err instanceof Error) {
      console.error(`❌ ${err.message}`);
    } else {
      console.error('❌ scaffold-resource failed with an unknown error.');
    }
    process.exit(1);
  }
}
