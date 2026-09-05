/**
 * Bans a JS `Date` bound into a `sql` tagged template.
 *
 * ## What this catches, and why nothing else could
 *
 * postgres-js picks a serialiser for an untyped bind parameter from the JS type
 * it is handed, and has **no case for `Date`**. It throws
 * `ERR_INVALID_ARG_TYPE` ("Received an instance of Date") on the CLIENT, before
 * a packet is sent — so a statement Postgres never saw still surfaces through
 * drizzle as ``Failed query: <the SQL>``. That wrapper is why the outage this
 * guard exists to prevent (#1042) was first diagnosed as a missing column.
 *
 * Drizzle's QUERY BUILDER is immune: a column's `timestamp` type tells drizzle
 * to serialise the Date itself. `lt(table.scheduledFor, someDate)` is fine and
 * always was. A raw template has no column to consult, so the value reaches the
 * driver as-is.
 *
 * Three reasons this hid from every existing gate, all measured 2026-09-05:
 *
 *   - **TypeScript cannot see it.** `sql` accepts `unknown`, so binding a Date
 *     type-checks cleanly. `pnpm typecheck` was green throughout the outage.
 *   - **Unit tests cannot see it.** The suite replaced `execute` with a spy, so
 *     every `${value}` was asserted as a captured argument and never reached a
 *     driver. 12,000+ green tests over four dead statements.
 *   - **A grep cannot see it reliably.** Deciding whether `${x}` is a Date means
 *     resolving `x`'s type. Hence the TypeScript type checker below rather than
 *     pattern-matching identifier names — the same reasoning that moved
 *     `guard:class-resolution` off a regex.
 *
 * ## Scope, measured rather than assumed
 *
 * Probed against a real Postgres before this guard was written:
 *
 *   | shape                                          | result |
 *   |------------------------------------------------|--------|
 *   | ``db.execute(sql`… ${dateObj}`)``              | THROWS |
 *   | ``.where(sql`… ${dateObj}`)``                  | THROWS |
 *   | ``db.execute(sql`… ${dateObj}::timestamptz`)`` | THROWS |
 *   | ``db.execute(sql`… ${iso}`)``                  | ok     |
 *   | `.where(lt(col, dateObj))`  (builder)          | ok     |
 *
 * Two consequences encoded here. It is **every `sql` template**, not just
 * `db.execute` — a `.where(sql`…`)` fails identically, which is why the tag is
 * matched rather than the call around it. And an explicit `::timestamptz` cast
 * does **not** rescue it, because the throw precedes parsing, so casts are
 * deliberately not whitelisted.
 *
 * Fix: `.toISOString()`, byte-identical to what drizzle's own `withTimezone`
 * serialiser emits.
 *
 * ## Exit codes
 *
 *   0 — clean
 *   1 — violations found
 *   2 — could not check (missing root, empty population, or a checker this
 *       guard cannot trust); refuses to report success rather than pass
 *       vacuously
 *
 * Escape hatch: `// date-sql:exempt — <reason>` on the offending line.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..');

/** Roots scanned — every tree where a `sql` template can reach a real driver. */
export const SCAN_ROOTS = [
  'apps/web/src',
  'apps/web/__tests__',
  'apps/admin/src',
  'packages/db/src',
  'scripts',
] as const;

const EXEMPT = /\/\/\s*date-sql:exempt\s*—/;

export interface Finding {
  file: string;
  line: number;
  text: string;
  typeText: string;
}

export interface AnalysisResult {
  findings: Finding[];
  templatesScanned: number;
  interpolationsScanned: number;
  interpolationsUnresolved: number;
}

/** True for `Date`, and for a union with a `Date` arm (`Date | null`). */
export function isDateType(type: ts.Type): boolean {
  if (type.isUnion()) return type.types.some(isDateType);
  const symbol = type.getSymbol() ?? type.aliasSymbol;
  return symbol?.getName() === 'Date';
}

/**
 * `sql` as a bare identifier, or any `x.sql` member access.
 *
 * Matched by NAME rather than by resolving the symbol back to drizzle: the tag
 * is re-exported through `@propertypro/db/filters`, and a symbol walk across
 * that re-export is more brittle than the false-positive it would avoid. A
 * local binding named `sql` that is not drizzle's would be flagged; that is an
 * acceptable trade and the escape hatch covers it.
 */
export function isSqlTag(tag: ts.Expression): boolean {
  if (ts.isIdentifier(tag)) return tag.text === 'sql';
  if (ts.isPropertyAccessExpression(tag)) return tag.name.text === 'sql';
  return false;
}

/** Scan already-parsed source files. Shared by the CLI and the unit tests. */
export function scan(
  sourceFiles: readonly ts.SourceFile[],
  checker: ts.TypeChecker,
  relativeTo = REPO_ROOT,
): AnalysisResult {
  const result: AnalysisResult = {
    findings: [],
    templatesScanned: 0,
    interpolationsScanned: 0,
    interpolationsUnresolved: 0,
  };

  for (const sourceFile of sourceFiles) {
    const lines = sourceFile.getFullText().split('\n');
    const visit = (node: ts.Node): void => {
      if (ts.isTaggedTemplateExpression(node) && isSqlTag(node.tag)) {
        result.templatesScanned += 1;
        const tpl = node.template;
        if (ts.isTemplateExpression(tpl)) {
          for (const span of tpl.templateSpans) {
            result.interpolationsScanned += 1;
            const type = checker.getTypeAtLocation(span.expression);
            if (type.flags & ts.TypeFlags.Any) result.interpolationsUnresolved += 1;
            if (!isDateType(type)) continue;

            const { line } = sourceFile.getLineAndCharacterOfPosition(span.expression.getStart());
            if (EXEMPT.test(lines[line] ?? '')) continue;

            result.findings.push({
              file: path.isAbsolute(sourceFile.fileName)
                ? path.relative(relativeTo, sourceFile.fileName)
                : sourceFile.fileName,
              line: line + 1,
              text: span.expression.getText().slice(0, 80),
              typeText: checker.typeToString(type),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return result;
}

/**
 * Analyse in-memory sources against the real standard library.
 *
 * The test entry point. Lib files still come from disk, because `Date` has to
 * be the genuine `Date` for the checker's answer to mean anything.
 */
export function analyzeSources(sources: Record<string, string>): AnalysisResult {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts'],
    noEmit: true,
    skipLibCheck: true,
    strict: true,
  };
  const host = ts.createCompilerHost(options, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, langVersion, onError, shouldCreate) =>
    fileName in sources
      ? ts.createSourceFile(fileName, sources[fileName]!, langVersion, true)
      : originalGetSourceFile(fileName, langVersion, onError, shouldCreate);
  const originalFileExists = host.fileExists.bind(host);
  host.fileExists = (fileName) => fileName in sources || originalFileExists(fileName);
  const originalReadFile = host.readFile.bind(host);
  host.readFile = (fileName) =>
    fileName in sources ? sources[fileName] : originalReadFile(fileName);

  const program = ts.createProgram(Object.keys(sources), options, host);
  const files = Object.keys(sources).map((f) => program.getSourceFile(f)!);
  return scan(files, program.getTypeChecker(), '');
}

/**
 * The detector, tested against a known-positive and two known-negatives.
 *
 * The whole guard rests on the checker being able to say "this is a Date". If
 * lib loading or module resolution breaks, every type degrades to `any`,
 * `isDateType` answers false everywhere, and the scan reports a clean tree it
 * never inspected — vacuously green, the exact failure
 * `.claude/rules/verification.md` says a guard must not have. So this runs
 * before any real result is trusted.
 */
export function detectorSelfTest(): { ok: boolean; detail: string } {
  const probe = analyzeSources({
    'probe.ts': [
      'declare function sql(s: TemplateStringsArray, ...v: unknown[]): unknown;',
      'const probeDate: Date = new Date();',
      'const probeText: string = probeDate.toISOString();',
      'const probeNum: number = 1;',
      'export const positive = sql`a ${probeDate}`;',
      'export const negative = sql`b ${probeText} ${probeNum}`;',
    ].join('\n'),
  });
  if (probe.findings.length !== 1) {
    return {
      ok: false,
      detail:
        `the probe binds exactly one Date and two non-Dates, but the detector flagged ` +
        `${probe.findings.length}. The type checker is not answering usefully, so a clean ` +
        `result from the real scan would be meaningless.`,
    };
  }
  if (!/probeDate/.test(probe.findings[0]!.text)) {
    return { ok: false, detail: `flagged the wrong expression: ${probe.findings[0]!.text}` };
  }
  return { ok: true, detail: 'detector distinguishes Date from string and number' };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function couldNotCheck(msg: string): never {
  console.error(`✖ guard:no-date-in-raw-sql — COULD NOT CHECK\n  ${msg}`);
  process.exit(2);
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
}

function main(): never {
  const selfTest = detectorSelfTest();
  if (!selfTest.ok) couldNotCheck(`Detector self-test failed: ${selfTest.detail}`);

  /*
   * A cheap text pre-filter picks the program's ROOT SET. Only a file that
   * mentions a `sql` template can hold a violation, and rooting the program at
   * those keeps this near the cost of the other guards (~5s) instead of
   * type-checking the monorepo. Imports are still pulled in by the compiler, so
   * types resolve normally.
   */
  const candidates: string[] = [];
  let filesSeen = 0;
  for (const rel of SCAN_ROOTS) {
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) {
      couldNotCheck(
        `Search root '${rel}' does not exist — refusing to report success from a tree this guard cannot search.`,
      );
    }
    const files: string[] = [];
    walk(abs, files);
    filesSeen += files.length;
    for (const f of files) {
      if (/\bsql\s*`/.test(fs.readFileSync(f, 'utf8'))) candidates.push(f);
    }
  }
  if (filesSeen === 0) couldNotCheck('Walked every root and found zero TypeScript files.');

  const tsconfigPath = path.join(REPO_ROOT, 'apps/web/tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) couldNotCheck(`Missing ${tsconfigPath}`);
  const parsed = ts.parseJsonConfigFileContent(
    ts.readConfigFile(tsconfigPath, ts.sys.readFile).config,
    ts.sys,
    path.join(REPO_ROOT, 'apps/web'),
  );
  const program = ts.createProgram(candidates, {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
  });

  const sourceFiles: ts.SourceFile[] = [];
  for (const file of candidates) {
    const sf = program.getSourceFile(file);
    if (!sf) {
      couldNotCheck(
        `'${path.relative(REPO_ROOT, file)}' matched the pre-filter but is not in the program.`,
      );
    }
    sourceFiles.push(sf);
  }

  const r = scan(sourceFiles, program.getTypeChecker());

  if (r.templatesScanned === 0) {
    couldNotCheck(
      'Examined zero `sql` templates. This repo has many, so an empty population means the ' +
        'scan is broken, not that the tree is clean.',
    );
  }
  if (r.interpolationsScanned > 0 && r.interpolationsUnresolved === r.interpolationsScanned) {
    couldNotCheck(
      `All ${r.interpolationsScanned} interpolations resolved to \`any\`. The checker is not ` +
        'resolving types, so no violation could ever be detected.',
    );
  }

  const denominator =
    `files scanned: ${filesSeen} · files with a \`sql\` template: ${candidates.length} · ` +
    `templates: ${r.templatesScanned} · interpolations: ${r.interpolationsScanned} ` +
    `(${r.interpolationsUnresolved} untyped)`;

  if (r.findings.length > 0) {
    console.error('✖ guard:no-date-in-raw-sql — a `Date` is bound into a `sql` template\n');
    for (const f of r.findings) {
      console.error(`  ${f.file}:${f.line}`);
      console.error(`    \${${f.text}}  — type ${f.typeText}`);
    }
    console.error(
      `\n  postgres-js cannot serialise a bare Date as a bind parameter: it throws\n` +
        `  ERR_INVALID_ARG_TYPE on the client, so the query never reaches Postgres\n` +
        `  while the error still reads "Failed query: <SQL>".\n\n` +
        `  Fix: call .toISOString() at the binding site, or use drizzle's query\n` +
        `  builder (eq/lt/gte, .set({...})), which serialises Dates from the column\n` +
        `  type. An ::timestamptz cast does NOT help — the throw precedes parsing.\n\n` +
        `  Escape hatch: // date-sql:exempt — <reason>\n\n  ${denominator}`,
    );
    process.exit(1);
  }

  console.log('✅ guard:no-date-in-raw-sql — no Date bound into a `sql` template');
  console.log(`   ${denominator}`);
  process.exit(0);
}

if (require.main === module) main();
