/**
 * Service dead-export guard (SVC-07 — Phase 1.7 of the 2026-09-22 refactor
 * roadmap). A shrink-only ratchet over exported service functions that nothing
 * in the repo references.
 *
 * WHY THIS EXISTS: the 2026-09-22 audit found 5 exported service functions
 * with zero references anywhere; S7/S8 deleted them. Without a ratchet the
 * population can only drift back up — the same failure mode recorded in
 * `scripts/lib/ceiling.ts` for the contract allowlist (37 → 46) and the
 * tenantScope backlog (121 → 150), both while every gate was green.
 *
 * ── Scan scope (service files — the DEFINING side) ─────────────────────────
 * `apps/web/src/lib/services/**\/*.ts`, recursive (the `sms/`, `export/` and
 * `support-inbox/` subdirectories hold real services too), EXCLUDING
 * `__tests__/` directories and `*.test.ts` files (tests define nothing here;
 * they are reference corpus, below). Counted exports: TOP-LEVEL
 * `export function` / `export async function` declarations, extracted with the
 * TypeScript parser. NOT counted, deliberately:
 *   - `export default function` — anonymous by convention, not importable by name;
 *   - `export { x } from './y'` re-export lines — no barrels exist under
 *     `apps/web/src/lib` (verified at seed time) and a re-export is a reference
 *     to the real defining file, which the corpus scan already sees;
 *   - `export const fn = (…) => …` arrows — outside the plan's stated scope
 *     ("top-level export function / export async function"); ~16 exist at seed
 *     time. Widening to them is a deliberate follow-up, not a silent gap.
 *
 * ── Reference rule (the corpus — the CALLING side) ─────────────────────────
 * An export counts as REFERENCED when its identifier appears, as a whole
 * word and OUTSIDE comments, in ANY `.ts`/`.tsx`/`.js`/`.jsx`/`.mjs` file under
 * `apps/`, `packages/` or `scripts/` OTHER THAN its defining file — including
 * test files (a test-referenced export is covered, not dead; same rule S8
 * applied). Sub-rules, each a deliberate direction:
 *   - COMMENTS DO NOT COUNT. A docblock mention is prose, not a caller — the
 *     2026-09-22 audit's dead exports were all prose-mentioned somewhere.
 *     Comments are blanked with the TypeScript parser, not a regex, for the
 *     reason recorded in `scripts/lib/legacy-role-comments.ts`: a regex cannot
 *     tell a comment from a string literal or JSX text.
 *   - STRING LITERALS DO COUNT. A quoted mention may be a job name, a log key
 *     or a route table entry this scan does not model. Counting it is the
 *     conservative direction: this guard must only red on evidence of death,
 *     never on suspicion of it.
 *   - The DEFINING FILE NEVER COUNTS for its own exports — an export only its
 *     own file uses is dead AS AN EXPORT (it should be un-exported or deleted).
 *
 * ── Known blind spots (each verified at seed time, 2026-09-24 @ fdc2958ad) ──
 *   - String-built dynamic imports would be invisible. The repo's only
 *     non-literal `import(…)` sites are `apps/web/src/lib/pdfjs/browser.ts` and
 *     `apps/web/src/lib/utils/extract-pdf-text.ts`, and neither targets
 *     services. Re-verify before widening this guard's scope.
 *   - Two service files exporting the SAME name mask each other (any reference
 *     to either keeps both alive). Conservative direction; none exist at seed.
 *   - Name-based matching does not resolve import shadowing/renaming
 *     (`import { listFaqs as faqs }` still references the token `listFaqs` on
 *     the import line, so renames are safe; a LOCAL variable that shadows a
 *     dead export's name in another file would falsely keep it alive —
 *     conservative direction).
 *
 * ── Baseline & exits ────────────────────────────────────────────────────────
 * `scripts/service-dead-exports-baseline.json` maps service file → the exact
 * export names grandfathered at seed. Shrink-only, PER NAME: a dead export not
 * in its file's baseline list fails (exit 1) even if another file's count went
 * down — counts alone would let a fix in one file launder a new death in
 * another. Baseline entries that are no longer dead are reported stale; ratchet
 * down with `pnpm exec tsx scripts/verify-service-dead-exports.ts
 * --write-baseline` in a reviewed commit.
 *
 * Tri-state exits (`.claude/rules/verification.md`): 0 clean · 1 violations ·
 * 2 could-not-check (missing scan root, zero population anywhere, unparseable
 * service file, missing/corrupt baseline, or the parser self-test failing).
 *
 * Bootstrapped per approval decision D27's INTENT — the required Lint job must
 * not be able to red on first merge — by seeding the baseline at the measured
 * count, so first-merge state is measured == baseline == exit 0. It is NOT the
 * literal print-only mode D27 sketched: verification.md is explicit that a
 * guard which cannot fail proves nothing ("vacuously green is as useless as
 * vacuously red"), and the S9 handoff mandates the tri-state shape plus an
 * injected-violation probe (recorded in the S9 commit message).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { checkCeiling } from './lib/ceiling';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

/** The defining side: every `.ts` under here (minus tests) is scanned for exports. */
const SERVICES_ROOT = 'apps/web/src/lib/services';
/** The calling side: identifier tokens in these roots count as references. */
const CORPUS_ROOTS = ['apps', 'packages', 'scripts'] as const;
const BASELINE_PATH = join(scriptDir, 'service-dead-exports-baseline.json');

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
/** Generated/vendored trees — never references, never services. */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  '.git',
  '.swc',
  'dist',
  'build',
  'out',
  'coverage',
  'test-results',
  'playwright-report',
]);

export interface ScannedFile {
  /** Repo-relative path. */
  path: string;
  content: string;
}

export interface DeadExport {
  file: string;
  name: string;
}

export interface BaselineEvaluation {
  /** Dead exports NOT covered by the baseline — each one fails the guard. */
  violations: DeadExport[];
  /** Baseline entries that are no longer dead — ratchet the baseline down. */
  stale: DeadExport[];
  /** Total dead exports measured this run. */
  measured: number;
  /** Total names in the baseline (the ceiling). */
  baselineTotal: number;
}

// ---------------------------------------------------------------------------
// TypeScript-parser primitives
// ---------------------------------------------------------------------------

function scriptKindFor(fileName: string): ts.ScriptKind {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (fileName.endsWith('.js') || fileName.endsWith('.mjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parseOrRefuse(fileName: string, source: string): ts.SourceFile | null {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, scriptKindFor(fileName));
  // parseDiagnostics is a TS internal — the same detector legacy-role-comments
  // and class-resolution use, and which commentExtractorWorks() probes below.
  const diagnostics = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
  if (Array.isArray(diagnostics) && diagnostics.length > 0) return null;
  return sf;
}

/**
 * Top-level `export function` / `export async function` names, or `null` when
 * the file did not parse. Exported for the self-test; main() treats null as
 * could-not-check (exit 2), never as "no exports".
 */
export function extractExportedFunctionNames(fileName: string, source: string): string[] | null {
  const sf = parseOrRefuse(fileName, source);
  if (sf === null) return null;
  const names: string[] = [];
  for (const statement of sf.statements) {
    if (!ts.isFunctionDeclaration(statement)) continue;
    if (!statement.name) continue; // `export default function () {}` has no name
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    const isDefault = modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
    if (isExported && !isDefault) names.push(statement.name.text);
  }
  return names;
}

/** Every comment range in the file, or `null` when it did not parse. */
function collectCommentRanges(fileName: string, source: string): ts.CommentRange[] | null {
  const sf = parseOrRefuse(fileName, source);
  if (sf === null) return null;
  const seen = new Set<number>();
  const out: ts.CommentRange[] = [];
  const add = (ranges: ts.CommentRange[] | undefined): void => {
    for (const r of ranges ?? []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      out.push(r);
    }
  };
  const visit = (node: ts.Node): void => {
    add(ts.getLeadingCommentRanges(source, node.pos));
    add(ts.getTrailingCommentRanges(source, node.end));
    node.forEachChild(visit);
  };
  visit(sf);
  // forEachChild does not reach the EOF token, where a trailing file comment lives.
  add(ts.getLeadingCommentRanges(source, sf.endOfFileToken.pos));
  return out;
}

/**
 * The source with every comment range replaced by spaces (newlines kept, so
 * line numbers survive). `null` when the file did not parse — callers decide
 * whether that is a refusal (service files) or a conservative fallback
 * (corpus files, where an unparseable file keeps its raw tokens and can only
 * ADD references, never remove them).
 */
export function blankComments(fileName: string, source: string): string | null {
  const ranges = collectCommentRanges(fileName, source);
  if (ranges === null) return null;
  if (ranges.length === 0) return source;
  const chars = source.split('');
  for (const r of ranges) {
    for (let i = r.pos; i < r.end && i < chars.length; i++) {
      if (chars[i] !== '\n') chars[i] = ' ';
    }
  }
  return chars.join('');
}

/**
 * Prove the parse-failure detector AND the range finder both work before a
 * clean scan is trusted — `parseDiagnostics` is a TS internal, and a version
 * that stopped populating it would make every file look parseable and this
 * guard vacuously green. Same self-test `verify-web-class-resolution.ts` and
 * `legacy-role-comments.ts` perform.
 */
export function commentExtractorWorks(): boolean {
  // 1. broken input must be REFUSED, not silently "clean".
  if (blankComments('probe.ts', 'const a = (((;') !== null) return false;
  // 2. a real comment must actually be blanked.
  const out = blankComments('probe.ts', '// secretName\nconst b = 1;\n');
  return out !== null && !out.includes('secretName') && out.includes('const b = 1;');
}

// ---------------------------------------------------------------------------
// Reference scan
// ---------------------------------------------------------------------------

const IDENTIFIER_TOKEN = /[$A-Za-z_][$A-Za-z0-9]*/g;

/** Whole-word identifier tokens in a source text (includes strings, by design). */
function extractIdentifierTokens(source: string): Set<string> {
  return new Set(source.match(IDENTIFIER_TOKEN) ?? []);
}

/**
 * The dead exports: every scanned service export whose name appears in no
 * corpus file (comment-blanked) other than its defining file.
 *
 * Pure over in-memory files — exported so the self-test can exercise both
 * directions without a repo-wide scan. Service files are union-ed into the
 * reference corpus automatically (a cross-service import is a real reference),
 * de-duplicated by path.
 */
export function findDeadExports(services: ScannedFile[], corpus: ScannedFile[]): DeadExport[] {
  const exportsByFile: { path: string; names: string[] }[] = [];
  const allNames = new Set<string>();
  for (const svc of services) {
    const names = extractExportedFunctionNames(svc.path, svc.content) ?? [];
    if (names.length === 0) continue;
    exportsByFile.push({ path: svc.path, names });
    for (const n of names) allNames.add(n);
  }
  if (allNames.size === 0) return [];

  // Corpus = declared corpus ∪ the service files themselves, de-duplicated.
  const byPath = new Map<string, string>();
  for (const f of corpus) byPath.set(f.path, f.content);
  for (const f of services) if (!byPath.has(f.path)) byPath.set(f.path, f.content);

  const referencers = new Map<string, Set<string>>();
  for (const [path, content] of byPath) {
    const rawTokens = extractIdentifierTokens(content);
    const hits: string[] = [];
    for (const name of allNames) {
      if (rawTokens.has(name)) hits.push(name);
    }
    if (hits.length === 0) continue;

    // Comment-aware second pass, only for files that mention a candidate.
    // A file containing neither comment opener cannot have comments — skip the
    // parse. An UNPARSEABLE file falls back to raw tokens: conservative, it
    // can only add references, never manufacture a dead export.
    let tokens = rawTokens;
    if (content.includes('//') || content.includes('/*')) {
      const blanked = blankComments(path, content);
      if (blanked !== null) tokens = extractIdentifierTokens(blanked);
    }
    for (const name of hits) {
      if (!tokens.has(name)) continue;
      let set = referencers.get(name);
      if (!set) {
        set = new Set();
        referencers.set(name, set);
      }
      set.add(path);
    }
  }

  const dead: DeadExport[] = [];
  for (const svc of exportsByFile) {
    for (const name of svc.names) {
      const refs = referencers.get(name);
      const referenced = refs !== undefined && [...refs].some((p) => p !== svc.path);
      if (!referenced) dead.push({ file: svc.path, name });
    }
  }
  return dead;
}

// ---------------------------------------------------------------------------
// Baseline (shrink-only, per name)
// ---------------------------------------------------------------------------

export function evaluateBaseline(
  dead: DeadExport[],
  baseline: Record<string, string[]>,
): BaselineEvaluation {
  const violations: DeadExport[] = [];
  for (const d of dead) {
    const allowed = baseline[d.file];
    if (!allowed || !allowed.includes(d.name)) violations.push(d);
  }
  const deadByKey = new Set(dead.map((d) => `${d.file}\u0000${d.name}`));
  const stale: DeadExport[] = [];
  let baselineTotal = 0;
  for (const [file, names] of Object.entries(baseline)) {
    for (const name of names) {
      baselineTotal++;
      if (!deadByKey.has(`${file}\u0000${name}`)) stale.push({ file, name });
    }
  }
  return { violations, stale, measured: dead.length, baselineTotal };
}

function isBaselineShape(value: unknown): value is Record<string, string[]> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    (v) => Array.isArray(v) && v.every((n) => typeof n === 'string'),
  );
}

// ---------------------------------------------------------------------------
// Filesystem walk
// ---------------------------------------------------------------------------

function walkCodeFiles(dir: string, out: string[], opts: { skipTests: boolean }): void {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      if (opts.skipTests && entry === '__tests__') continue;
      walkCodeFiles(full, out, opts);
      continue;
    }
    if (!CODE_EXTENSIONS.has(extname(entry))) continue;
    if (opts.skipTests && entry.endsWith('.test.ts')) continue;
    out.push(full);
  }
}

function readOrFail(file: string): string {
  try {
    return readFileSync(file, 'utf-8');
  } catch (err) {
    console.error(`\n❌ Could not read ${relative(repoRoot, file)}: ${String(err)}`);
    console.error('   Refusing to scan a tree I cannot fully read (exit 2).');
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('🔍 Service dead-export guard (SVC-07 — shrink-only ratchet)');
  console.log('='.repeat(60));

  const writeBaseline = process.argv.includes('--write-baseline');

  if (!commentExtractorWorks()) {
    console.error(
      '\n❌ TypeScript comment-extractor self-test FAILED — parseDiagnostics or ' +
        'comment ranges changed behaviour. Refusing to scan (exit 2).',
    );
    process.exit(2);
  }

  // -- Scan root must exist, and must hold a non-zero population ------------
  const servicesRoot = join(repoRoot, SERVICES_ROOT);
  if (!existsSync(servicesRoot) || !statSync(servicesRoot).isDirectory()) {
    console.error(`\n❌ Scan root ${SERVICES_ROOT} does not exist — refusing to pass (exit 2).`);
    process.exit(2);
  }
  const servicePaths: string[] = [];
  walkCodeFiles(servicesRoot, servicePaths, { skipTests: true });
  if (servicePaths.length === 0) {
    console.error(`\n❌ Found 0 service files under ${SERVICES_ROOT} — refusing to pass (exit 2).`);
    process.exit(2);
  }
  const services: ScannedFile[] = [];
  let exportTotal = 0;
  for (const file of servicePaths) {
    const content = readOrFail(file);
    const names = extractExportedFunctionNames(relative(repoRoot, file), content);
    if (names === null) {
      console.error(`\n❌ ${relative(repoRoot, file)} did not parse — refusing to scan it (exit 2).`);
      process.exit(2);
    }
    exportTotal += names.length;
    services.push({ path: relative(repoRoot, file), content });
  }
  if (exportTotal === 0) {
    console.error(
      `\n❌ Found 0 exported functions across ${servicePaths.length} service files — ` +
        'a scan that examined nothing must not pass (exit 2).',
    );
    process.exit(2);
  }

  // -- Reference corpus ------------------------------------------------------
  const corpus: ScannedFile[] = [];
  for (const root of CORPUS_ROOTS) {
    const abs = join(repoRoot, root);
    if (!existsSync(abs)) {
      console.error(`\n❌ Corpus root ${root}/ does not exist — refusing to pass (exit 2).`);
      process.exit(2);
    }
    const files: string[] = [];
    walkCodeFiles(abs, files, { skipTests: false });
    for (const file of files) {
      corpus.push({ path: relative(repoRoot, file), content: readOrFail(file) });
    }
  }
  if (corpus.length === 0) {
    console.error('\n❌ Reference corpus is empty — refusing to pass (exit 2).');
    process.exit(2);
  }

  // -- Baseline --------------------------------------------------------------
  let baseline: Record<string, string[]> = {};
  if (existsSync(BASELINE_PATH)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
    } catch (err) {
      console.error(`\n❌ Baseline JSON is corrupt: ${String(err)} (exit 2).`);
      process.exit(2);
    }
    if (!isBaselineShape(parsed)) {
      console.error(
        '\n❌ Baseline JSON must be an object mapping file → string[] of export names (exit 2).',
      );
      process.exit(2);
    }
    baseline = parsed;
  } else if (!writeBaseline) {
    console.error(
      `\n❌ Baseline ${relative(repoRoot, BASELINE_PATH)} is missing. Seed it with ` +
        '`pnpm exec tsx scripts/verify-service-dead-exports.ts --write-baseline` in a ' +
        'reviewed commit (exit 2).',
    );
    process.exit(2);
  }

  // -- Scan -------------------------------------------------------------------
  const dead = findDeadExports(services, corpus);

  // The denominators every run — a ceiling nobody prints is a number only the
  // script knows, and CI logs must be able to prove the scan examined a real
  // population (verification.md).
  console.log(
    `\nScanned ${services.length} service files under ${SERVICES_ROOT}/ — ` +
      `${exportTotal} top-level exported functions.`,
  );
  console.log(
    `Reference corpus: ${corpus.length} code files under ${CORPUS_ROOTS.join('/, ')}/ ` +
      '(comments excluded, string literals counted).',
  );

  const evaluation = evaluateBaseline(dead, baseline);
  console.log(
    `dead service exports: ${evaluation.measured} (ceiling ${evaluation.baselineTotal})`,
  );

  if (writeBaseline) {
    const next: Record<string, string[]> = {};
    for (const d of [...dead].sort((a, b) => a.file.localeCompare(b.file))) {
      (next[d.file] ??= []).push(d.name);
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    console.log(
      `\n📝 Baseline written to ${relative(repoRoot, BASELINE_PATH)} ` +
        `(${dead.length} name(s) across ${Object.keys(next).length} file(s)).`,
    );
    return;
  }

  if (evaluation.violations.length > 0) {
    console.error(`\n❌ ${evaluation.violations.length} dead export(s) beyond the baseline:`);
    for (const v of evaluation.violations) {
      console.error(`  ${v.file} → ${v.name}`);
    }
  }

  const ceiling = checkCeiling(
    'service dead exports',
    evaluation.measured,
    evaluation.baselineTotal,
    'Delete the dead export — or the whole function, if nothing calls it (S7/S8 ' +
      'deleted the audited five exactly this way; git history retains it). There ' +
      'is no exemption marker by design: an exempt dead export is just an ' +
      'un-deleted one.',
  );
  if (ceiling.message) {
    console[ceiling.failed ? 'error' : 'log'](`\n${ceiling.failed ? '❌' : 'ℹ️'} ${ceiling.message}`);
  }

  if (evaluation.stale.length > 0 && !ceiling.failed) {
    console.log(
      `\nℹ️ ${evaluation.stale.length} baseline entry(ies) are no longer dead — ratchet down ` +
        'with `pnpm exec tsx scripts/verify-service-dead-exports.ts --write-baseline` ' +
        'in a reviewed commit:',
    );
    for (const s of evaluation.stale) {
      console.log(`  ${s.file} → ${s.name}`);
    }
  }

  if (evaluation.violations.length > 0 || ceiling.failed) {
    process.exit(1);
  }

  console.log('\n✅ No dead service exports beyond the shrink-only baseline.');
}

// ESM main-detection (POSIX only — matches the other guards).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
