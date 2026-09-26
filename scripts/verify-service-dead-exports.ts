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
 * ── Tree enumeration ────────────────────────────────────────────────────────
 * BOTH sides enumerate from `git ls-files --cached --others --exclude-standard`
 * (see `listCodeFiles`): one deterministic listing per tree state, immune to
 * symlink-loop recursion, silent partial-directory reads, and gitignored
 * generated assets (`apps/web/public/pdfjs/`) that made the same commit scan
 * different corpora in CI and on built machines. A git failure refuses.
 *
 * ── Scan scope (service files — the DEFINING side) ─────────────────────────
 * `.ts`/`.tsx` under `apps/web/src/lib/services/` (recursive — the `sms/`,
 * `export/` and `support-inbox/` subdirectories hold real services), EXCLUDING
 * `.d.ts` files, `__tests__/` directories and colocated `*.test.*` / `*.spec.*`
 * files of any extension (tests define nothing here; they are reference corpus,
 * below). Counted exports: TOP-LEVEL `export function` / `export async function`
 * declarations, extracted with the TypeScript parser, de-duplicated per name
 * (an overloaded export is ONE name). NOT counted, deliberately:
 *   - `export default function` — anonymous by convention, not importable by name;
 *   - `export declare function` — ambient surface, no runtime body, no caller;
 *   - `export { x } from './y'` re-export lines — no barrels exist under
 *     `apps/web/src/lib` (verified at seed time) and a re-export is a reference
 *     to the real defining file, which the corpus scan already sees;
 *   - `export const fn = (…) => …` arrows — outside the plan's stated scope
 *     ("top-level export function / export async function"); ~16 exist at seed
 *     time. Widening to them is a deliberate follow-up, not a silent gap. Note
 *     the corollary: converting a baselined dead export to an arrow MOVES it
 *     out of jurisdiction, which reads as a drain — the stale message says so.
 *
 * ── Reference rule (the corpus — the CALLING side) ─────────────────────────
 * An export counts as REFERENCED when its identifier appears, as a whole
 * word and OUTSIDE comments, in ANY git-listed `.ts`/`.tsx`/`.js`/`.jsx`/
 * `.mjs`/`.cjs`/`.mts`/`.cts` file under `apps/`, `packages/` or `scripts/`
 * OTHER THAN its defining file — including test files (a test-referenced
 * export is covered, not dead; same rule S8 applied). Sub-rules, each a
 * deliberate direction:
 *   - COMMENTS DO NOT COUNT. A docblock mention is prose, not a caller — the
 *     2026-09-22 audit's dead exports were all prose-mentioned somewhere.
 *     Comments are blanked with the TypeScript parser, not a regex, for the
 *     reason recorded in `scripts/lib/comment-ranges.ts`: a regex cannot
 *     tell a comment from a string literal or JSX text. The blanking walks
 *     TOKENS and queries BOTH trivia buckets — see `scripts/lib/comment-ranges.ts`;
 *     a corpus file that fails to parse REFUSES the run (exit 2) rather than
 *     silently counting its comment prose.
 *   - STRING LITERALS DO COUNT. A quoted mention may be a job name, a log key
 *     or a route table entry this scan does not model. Counting it is the
 *     conservative direction: this guard must only red on evidence of death,
 *     never on suspicion of it. The honest corollary: a whole-word string
 *     token ANYWHERE in the corpus is a de facto exemption channel — there is
 *     no exemption MARKER, but there is this. `--write-baseline` warns when a
 *     removed entry is still exported (the masking signature).
 *   - The DEFINING FILE NEVER COUNTS for its own exports — an export only its
 *     own file uses is dead AS AN EXPORT (it should be un-exported or deleted).
 *
 * ── Known blind spots (verified 2026-09-24; re-verify before widening) ─────
 *   - String-built dynamic imports would be invisible. The repo's only
 *     non-literal `import(…)` sites are `apps/web/src/lib/pdfjs/browser.ts` and
 *     `apps/web/src/lib/utils/extract-pdf-text.ts`, and neither targets
 *     services.
 *   - Two service files exporting the SAME name mask each other (a reference
 *     to either keeps both alive). This is LIVE, not hypothetical:
 *     `listTemplates` is exported by both `esign-service.ts` and
 *     `site-portfolio-template-service.ts`, so neither death is reportable
 *     until references become file-qualified.
 *   - Short generic names are permanently unmeasurable: `score`
 *     (support-inbox/naive-bayes.ts) appears as a bare token in ~48 corpus
 *     files (property accesses, unrelated locals). The direction is
 *     false-alive, so `ceiling` reads as tighter coverage than exists for
 *     exactly the population most likely to drift dead unnoticed.
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
 * another. GROWING the ledger requires `--write-baseline --force` (a second,
 * obviously-reviewed edit — the protection `verify-contracts.ts` gets from
 * pinning its ceiling separately from its data); shrinking prints a warning
 * for any removed name that is still exported.
 *
 * Tri-state exits (`.claude/rules/verification.md`): 0 clean · 1 violations ·
 * 2 could-not-check (git enumeration failure, missing scan root, zero
 * population anywhere, unreadable or unparseable file on either side,
 * missing/corrupt baseline, or the parser self-test failing).
 *
 * Bootstrapped per approval decision D27's INTENT — the required Lint job must
 * not be able to red on first merge — by seeding the baseline at the measured
 * count, so first-merge state is measured == baseline == exit 0. It is NOT the
 * literal print-only mode D27 sketched: verification.md is explicit that a
 * guard which cannot fail proves nothing ("vacuously green is as useless as
 * vacuously red"), and the S9 handoff mandates the tri-state shape plus an
 * injected-violation probe (recorded in the S9 commit message). The seed was
 * CORRECTED from 10 to 11 in the review-fix commit: the first collector
 * walked nodes and missed nested-position comments, which kept
 * `findOrphanCommunities` (provisioning-service.ts — its only outside mentions
 * are comments) falsely alive.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { checkCeiling } from './lib/ceiling';
import { collectCommentRanges, parseOrNull } from './lib/comment-ranges';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

/** The defining side: every `.ts`/`.tsx` under here (minus tests) is scanned for exports. */
const SERVICES_ROOT = 'apps/web/src/lib/services';
/** The calling side: identifier tokens in these roots count as references. */
const CORPUS_ROOTS = ['apps', 'packages', 'scripts'] as const;
const BASELINE_PATH = join(scriptDir, 'service-dead-exports-baseline.json');

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
/** Colocated test shapes on the DEFINING side — tests define no services. */
const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

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

/**
 * Top-level `export function` / `export async function` names, or `null` when
 * the file did not parse. Exported for the self-test; main() treats null as
 * could-not-check (exit 2), never as "no exports".
 */
export function extractExportedFunctionNames(fileName: string, source: string): string[] | null {
  const sf = parseOrNull(fileName, source);
  if (sf === null) return null;
  // A Set, not an array: an OVERLOADED export declares one name via N
  // signatures (`help-article-service.ts` declares searchArticles three
  // times). Counting signatures would inflate the printed denominator and, if
  // the name ever went dead, emit N identical DeadExport entries — busting the
  // ceiling for a name the baseline grandfathers once.
  const names = new Set<string>();
  for (const statement of sf.statements) {
    if (!ts.isFunctionDeclaration(statement)) continue;
    if (!statement.name) continue; // `export default function () {}` has no name
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const isExported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    const isDefault = modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
    // `export declare function` is an AMBIENT declaration — no runtime body,
    // no possible call site; counting it would make any type-augmentation file
    // under services/ an instant unfixable violation.
    const isDeclare = modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword) ?? false;
    if (isExported && !isDefault && !isDeclare) names.add(statement.name.text);
  }
  return [...names];
}

/**
 * The source with every comment range replaced by spaces (newlines kept, so
 * line numbers survive). `null` when the file did not parse — callers decide
 * whether that is a refusal (service files) or a conservative fallback
 * (corpus files, where an unparseable file keeps its raw tokens and can only
 * ADD references, never remove them).
 */
export function blankComments(fileName: string, source: string): string | null {
  const found = collectCommentRanges(fileName, source);
  if (found === null) return null;
  const { ranges } = found;
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
 *
 * The blanking probes include NESTED token positions deliberately: the first
 * shipped collector walked NODES and passed a leading-comment-only probe while
 * leaking 436 files' worth of nested-position comments (finding 1 of the S9
 * review). A probe that only exercises the positions an extractor happens to
 * handle is not a self-test.
 */
export function commentExtractorWorks(): boolean {
  // 1. broken input must be REFUSED, not silently "clean".
  if (blankComments('probe.ts', 'const a = (((;') !== null) return false;
  // 2. a leading own-line comment must actually be blanked.
  const out = blankComments('probe.ts', '// secretName\nconst b = 1;\n');
  if (out === null || out.includes('secretName') || !out.includes('const b = 1;')) return false;
  // 3. a trailing comment inside an array literal — a token position no node
  //    boundary is adjacent to — must be blanked too.
  const nested = blankComments('probe.ts', 'const x = [\n 1, // nestedSecret\n];\n');
  if (nested === null || nested.includes('nestedSecret')) return false;
  // 4. an end-of-file comment with no following token must be blanked.
  const eof = blankComments('probe.ts', 'const y = 2;\n// eofSecret\n');
  return eof !== null && !eof.includes('eofSecret');
}

// ---------------------------------------------------------------------------
// Reference scan
// ---------------------------------------------------------------------------

const IDENTIFIER_TOKEN = /[$A-Za-z_][$A-Za-z0-9]*/g;

/** Whole-word identifier tokens in a source text (includes strings, by design). */
function extractIdentifierTokens(source: string): Set<string> {
  return new Set(source.match(IDENTIFIER_TOKEN) ?? []);
}

export interface DeadExportScan {
  dead: DeadExport[];
  /**
   * Corpus files whose comment-blanking parse FAILED. Their tokens were
   * counted raw (conservative: a comment mention in them keeps an export
   * alive), which silently switches off the "comments do not count" rule for
   * that file — an exemption channel (proved in the S9 review: a broken .mjs
   * with `// zzProbeDeadFn` resurrected an injected dead export). Callers
   * must treat a non-empty list as could-not-check; main() refuses (exit 2).
   */
  unparseableCorpusFiles: string[];
}

/**
 * The dead exports: every scanned service export whose name appears in no
 * corpus file (comment-blanked) other than its defining file.
 *
 * Pure over in-memory files — exported so the self-test can exercise both
 * directions without a repo-wide scan. Service files are union-ed into the
 * reference corpus automatically (a cross-service import is a real reference),
 * de-duplicated by path.
 *
 * THROWS on an unparseable service file: the contract is could-not-check,
 * never a silent "no exports" (which would report a mid-refactor file clean —
 * the reuse hazard when DC-03/Phase 3.11 points this scanner at
 * packages/shared).
 */
export function findDeadExports(services: ScannedFile[], corpus: ScannedFile[]): DeadExportScan {
  const exportsByFile: { path: string; names: string[] }[] = [];
  const allNames = new Set<string>();
  for (const svc of services) {
    const names = extractExportedFunctionNames(svc.path, svc.content);
    if (names === null) {
      throw new Error(`service file did not parse: ${svc.path}`);
    }
    if (names.length === 0) continue;
    exportsByFile.push({ path: svc.path, names });
    for (const n of names) allNames.add(n);
  }
  const unparseableCorpusFiles: string[] = [];
  if (allNames.size === 0) return { dead: [], unparseableCorpusFiles };

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
    // parse. An UNPARSEABLE file falls back to raw tokens (conservative for
    // the dead set) but is REPORTED so the caller can refuse.
    let tokens = rawTokens;
    if (content.includes('//') || content.includes('/*')) {
      const blanked = blankComments(path, content);
      if (blanked === null) unparseableCorpusFiles.push(path);
      else tokens = extractIdentifierTokens(blanked);
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
  return { dead, unparseableCorpusFiles };
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
// Tree enumeration — the GIT index, not a filesystem walk
// ---------------------------------------------------------------------------

/**
 * Is `path` (repo-relative) a service DEFINITION — the scanned side?
 * TypeScript sources under SERVICES_ROOT, excluding `.d.ts` (ambient
 * surfaces — no runtime body, no possible caller), `__tests__` directories
 * and colocated `*.test.*` / `*.spec.*` files of ANY extension (tests define
 * no services; they are reference corpus). The first shipped version matched
 * only the exact suffix `.test.ts`, so a colocated `.spec.ts` fixture file —
 * this repo's own e2e convention — scanned as a live service and red the
 * gate on a test-only change.
 */
export function isDefinitionFile(path: string): boolean {
  if (!path.startsWith(`${SERVICES_ROOT}/`)) return false;
  if (path.endsWith('.d.ts')) return false;
  const ext = extname(path);
  if (ext !== '.ts' && ext !== '.tsx') return false;
  if (path.split('/').includes('__tests__')) return false;
  return !TEST_FILE_PATTERN.test(path);
}

/**
 * Enumerate code files from the GIT index — never a filesystem walk. Three
 * defect classes die with the walk (all reproduced during the S9 review):
 *  - SYMLINK LOOPS: `statSync` dereferences, so one `ln -s .` inside the scan
 *    root made the walk recurse per PATH_MAX level; every file gained
 *    thousands of repo-relative paths, each path counted as an "other file"
 *    reference for every other, and the guard printed `dead: 0 (ceiling 10)`
 *    while advising the reader to delete the whole baseline. git lists a
 *    symlink as ONE entry and never follows directory links.
 *  - SILENT PARTIAL TREES: the walk's `catch { return }` on readdir made an
 *    unreadable directory indistinguishable from an empty one — a `chmod 000`
 *    on one service subdirectory produced a green run with a shrunken
 *    denominator, and on another produced TWO false-dead violations. Here,
 *    git failure is one non-zero status main() refuses on, and an unreadable
 *    file still dies at `readOrFail`.
 *  - ENVIRONMENT-DEPENDENT CORPUS: `apps/web/public/pdfjs/` (2 MB of minified
 *    vendored JS, gitignored, regenerated by predev/prebuild) entered the
 *    walk's corpus on built machines but not on fresh CI checkouts — the same
 *    commit measured different denominators in CI and locally.
 *    `--exclude-standard` makes .gitignore the single arbiter of the tree.
 * `--others` keeps untracked work-in-progress visible, so the guard scans the
 * developer's actual tree. A git failure refuses (exit 2) — the same
 * could-not-check doctrine as `readOrFail`.
 */
function listCodeFiles(): string[] {
  const res = spawnSync(
    'git',
    [
      '-C', repoRoot, 'ls-files', '-z',
      '--cached', '--others', '--exclude-standard',
      '--', ...CORPUS_ROOTS,
    ],
    { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.error) {
    console.error(`\n❌ Could not run git ls-files: ${String(res.error)} (exit 2).`);
    process.exit(2);
  }
  if (res.status !== 0) {
    console.error(`\n❌ git ls-files exited ${res.status}: ${res.stderr.trim()} (exit 2).`);
    process.exit(2);
  }
  return res.stdout
    .split('\0')
    .filter((p) => p.length > 0 && CODE_EXTENSIONS.has(extname(p)));
}

function readOrFail(relPath: string): string {
  try {
    return readFileSync(join(repoRoot, relPath), 'utf-8');
  } catch (err) {
    console.error(`\n❌ Could not read ${relPath}: ${String(err)}`);
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
  const force = process.argv.includes('--force');

  if (!commentExtractorWorks()) {
    console.error(
      '\n❌ TypeScript comment-extractor self-test FAILED — parseDiagnostics or ' +
        'comment ranges changed behaviour. Refusing to scan (exit 2).',
    );
    process.exit(2);
  }

  // -- One git-based enumeration; assert a non-zero population ---------------
  const codeFiles = listCodeFiles();
  if (codeFiles.length === 0) {
    console.error(
      `\n❌ Enumerated 0 code files under ${CORPUS_ROOTS.join('/, ')}/ — ` +
        'a scan that examined nothing must not pass (exit 2).',
    );
    process.exit(2);
  }
  if (!existsSync(join(repoRoot, SERVICES_ROOT))) {
    console.error(`\n❌ Scan root ${SERVICES_ROOT} does not exist — refusing to pass (exit 2).`);
    process.exit(2);
  }
  const servicePaths = new Set(codeFiles.filter(isDefinitionFile));
  if (servicePaths.size === 0) {
    console.error(`\n❌ Found 0 service files under ${SERVICES_ROOT} — refusing to pass (exit 2).`);
    process.exit(2);
  }

  // -- Read every file ONCE; validate every service file parses ---------------
  const files: ScannedFile[] = codeFiles.map((p) => ({ path: p, content: readOrFail(p) }));
  const services = files.filter((f) => servicePaths.has(f.path));
  let exportTotal = 0;
  for (const svc of services) {
    const names = extractExportedFunctionNames(svc.path, svc.content);
    if (names === null) {
      console.error(`\n❌ ${svc.path} did not parse — refusing to scan it (exit 2).`);
      process.exit(2);
    }
    exportTotal += names.length;
  }
  if (exportTotal === 0) {
    console.error(
      `\n❌ Found 0 exported functions across ${services.length} service files — ` +
        'a scan that examined nothing must not pass (exit 2).',
    );
    process.exit(2);
  }

  // -- Baseline --------------------------------------------------------------
  let baseline: Record<string, string[]> = {};
  const baselineExists = existsSync(BASELINE_PATH);
  if (baselineExists) {
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
  const { dead, unparseableCorpusFiles } = findDeadExports(services, files);
  if (unparseableCorpusFiles.length > 0) {
    console.error(
      `\n❌ ${unparseableCorpusFiles.length} corpus file(s) did not parse — their ` +
        '"comments do not count" rule cannot be enforced, so their comment prose ' +
        'would count as references (exit 2):',
    );
    for (const f of unparseableCorpusFiles.slice(0, 20)) console.error(`  ${f}`);
    if (unparseableCorpusFiles.length > 20) {
      console.error(`  … and ${unparseableCorpusFiles.length - 20} more`);
    }
    process.exit(2);
  }

  // The denominators every run — a ceiling nobody prints is a number only the
  // script knows, and CI logs must be able to prove the scan examined a real
  // population (verification.md).
  console.log(
    `\nScanned ${services.length} service files under ${SERVICES_ROOT}/ — ` +
      `${exportTotal} distinct top-level exported function names.`,
  );
  console.log(
    `Reference corpus: ${files.length} git-listed code files under ` +
      `${CORPUS_ROOTS.join('/, ')}/ (comments excluded, string literals counted).`,
  );

  const evaluation = evaluateBaseline(dead, baseline);
  console.log(
    `dead service exports: ${evaluation.measured} (ceiling ${evaluation.baselineTotal})`,
  );

  if (writeBaseline) {
    const next: Record<string, string[]> = {};
    for (const d of [...dead].sort(
      (a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name),
    )) {
      (next[d.file] ??= []).push(d.name);
    }
    // Growth gate: adding names to the ledger RAISES the shrink-only ceiling,
    // so it requires --force — the same two-obvious-edits protection
    // verify-contracts.ts gets from pinning ALLOWLIST_CEILING separately from
    // its data. Without a gate, an agent under a red Lint job is one command
    // away from silently legalizing new deaths; the review also proved the
    // inverse laundering path (a string token masking a death, then a
    // "ratchet down" that deletes the ledger entry over a still-dead export),
    // so removals that are still exported get a visible warning.
    const additions = evaluation.violations; // dead names not in the baseline
    if (additions.length > 0 && !force && baselineExists) {
      console.error(`\n❌ --write-baseline would RAISE the ledger by ${additions.length} name(s):`);
      for (const a of additions) console.error(`  ${a.file} → ${a.name}`);
      console.error(
        '   Deleting the dead exports is the default path. If the raise is ' +
          'deliberate (e.g. a corrected measurement), re-run with --force and ' +
          'justify it in the commit.',
      );
      process.exit(1);
    }
    const stillExported = new Set<string>();
    for (const svc of services) {
      for (const n of extractExportedFunctionNames(svc.path, svc.content) ?? []) stillExported.add(n);
    }
    const suspectRemovals = evaluation.stale.filter((s) => stillExported.has(s.name));
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    console.log(
      `\n📝 Baseline written to ${relative(repoRoot, BASELINE_PATH)} ` +
        `(${dead.length} name(s) across ${Object.keys(next).length} file(s); ` +
        `+${additions.length} / −${evaluation.stale.length}).`,
    );
    if (suspectRemovals.length > 0) {
      console.log(
        `\n⚠️ ${suspectRemovals.length} removed name(s) are STILL EXPORTED in the scan ` +
          'tree — verify each was genuinely fixed (a real caller appeared), not ' +
          'masked by a string token somewhere in the corpus:',
      );
      for (const s of suspectRemovals) console.log(`  ${s.file} → ${s.name}`);
    }
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
      'deleted the audited five exactly this way; git history retains it). ' +
      'Growing the baseline requires `--write-baseline --force` in a reviewed ' +
      'commit. Note the reference rule is name-based and counts string-literal ' +
      'tokens, so a quoted mention anywhere in the corpus keeps an export ' +
      '"alive" — audit a suspicious drain before ratcheting.',
  );
  if (ceiling.message) {
    console[ceiling.failed ? 'error' : 'log'](`\n${ceiling.failed ? '❌' : 'ℹ️'} ${ceiling.message}`);
  }

  if (evaluation.stale.length > 0 && !ceiling.failed) {
    console.log(
      `\nℹ️ ${evaluation.stale.length} baseline entry(ies) are no longer dead — fixed, moved ` +
        'out of scan scope, converted to an `export const` arrow, or masked by a ' +
        'string token; verify WHICH before ratcheting down with `pnpm exec tsx ' +
        'scripts/verify-service-dead-exports.ts --write-baseline` in a reviewed commit:',
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

// ESM main-detection via realpath + pathToFileURL. `import.meta.url` is
// realpath-resolved AND percent-encoded; `process.argv[1]` is neither, so the
// bare `file://${argv[1]}` template (still used by ~10 sibling guards)
// silently fails whenever the invocation path has a symlink component (macOS
// /tmp → /private/tmp) or a space: main() never runs, the process exits 0
// having checked nothing, and the runner prints ✅ for a guard that examined
// no population. The repo precedent (seed-demo.ts, reset-demo.ts,
// demo-enable-gates.ts) applies pathToFileURL but NOT realpathSync, which
// fixes the encoding class only — this guard resolves both.
if (process.argv[1]) {
  let invokedAs: string | null = null;
  try {
    invokedAs = pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    invokedAs = null; // argv[1] not on disk — imported as a module, not invoked
  }
  if (import.meta.url === invokedAs) main();
}
