#!/usr/bin/env tsx
/**
 * Assert that every colour utility class referenced in apps/web/src actually
 * EMITS CSS under apps/web's Tailwind config.
 *
 *   pnpm guard:class-resolution
 *
 * WHY THIS EXISTS
 * ---------------
 * Tailwind does not error on a class it does not recognise. It emits no rule,
 * and the element renders with no background / no ring / an inherited colour.
 * Nothing fails, nothing logs, nothing appears in a diff review. The class name
 * *looks* semantic, so it survives code review indefinitely.
 *
 * `guard:design-tokens` structurally cannot catch this: it checks that RAW
 * palette values are gone (`bg-blue-500`, `#fff`), and has no opinion on whether
 * the semantic-looking class you replaced them with resolves to anything.
 * `guard:token-coverage` checks the other half of the chain — that every
 * `var(--x)` referenced is defined — but a class name never reaches a CSS var
 * if Tailwind drops it first.
 *
 * Two distinct failure shapes, both found in apps/web when this guard was
 * written (2026-09-02), together spanning 84 files:
 *
 *  1. **shadcn orphans.** `components/ui/switch.tsx` was imported from upstream
 *     shadcn, which assumes a `background` / `input` / `ring` colour vocabulary
 *     backed by CSS vars this repo never defined. The Switch therefore rendered
 *     as a solid coral capsule with no visible thumb when ON, and an invisible
 *     pill when OFF — only `data-[state=checked]:bg-primary` resolved. Same
 *     shape in `text-muted-foreground` (64 uses), `border-input`, `ring-ring`,
 *     `ring-offset-background`, `bg-muted`, `text-destructive`.
 *
 *  2. **Semantic near-misses.** The CSS variable is `--interactive-primary`, but
 *     the Tailwind *class* is `bg-interactive` (the family's DEFAULT). Writing
 *     the var name as the class — `bg-interactive-primary`, `text-content-primary`,
 *     `border-default`, `text-danger`, `bg-surface` — produces a plausible name
 *     that emits nothing. 28 such classes were live.
 *
 * WHAT IT DOES NOT COVER
 * ----------------------
 * Slash-opacity on a semantic token (`bg-interactive/10`) also emits zero CSS,
 * because these tokens are bare `var(--x)` with no `<alpha-value>` channel. That
 * is `guard:design-tokens`' `slash-opacity-semantic` rule and is deliberately
 * left there, so a violation is reported once rather than twice. This guard
 * strips a trailing `/N` and checks only whether the FAMILY resolves — so
 * `bg-success/10` (no `success` family at all) is still caught here.
 *
 * Dynamic class construction (`` `bg-${tone}-500` ``) is invisible to this guard,
 * exactly as it is to Tailwind's own extractor.
 *
 * Exit codes:
 *   0 — every referenced colour utility emits CSS
 *   1 — at least one emits nothing
 *   2 — COULD NOT CHECK (missing search root, no candidates found, compile
 *       failed). It refuses to report success from a tree it did not search.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Both roots that apps/web/tailwind.config.ts lists in `content`. packages/ui
// compiles into the web stylesheet, so a class it references that resolves to
// nothing renders as no style in web exactly like one written in apps/web —
// and apps/admin's guard scans only apps/admin/src, so nothing covered it.
// That is where `getStatusClasses` built its classes by interpolation.
const SRC_RELS = ['apps/web/src', 'packages/ui/src'] as const;
const SRC_REL = SRC_RELS.join(' + ');
const srcRoots = SRC_RELS.map((rel) => path.join(repoRoot, rel));

/** Utility prefixes whose value is a colour from `theme.colors`. */
const COLOUR_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'ring-offset',
  'divide', 'placeholder', 'fill', 'stroke',
  'outline', 'caret', 'decoration', 'accent',
] as const;

/**
 * A bare utility with no variant prefix, e.g. `bg-surface-card`. Variants are
 * stripped before this is applied: `data-[state=checked]:bg-interactive` fails
 * only if `bg-interactive` fails, so checking bases avoids reimplementing
 * Tailwind's selector escaping (which is where an earlier draft produced false
 * positives on `bg-stone-950`).
 */
const BASE_UTILITY = new RegExp(
  `^(?:${COLOUR_PREFIXES.join('|')})-[a-z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*$`,
);

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

for (const [i, root] of srcRoots.entries()) {
  if (!fs.existsSync(root)) {
    fail(
      `Search root '${SRC_RELS[i]}' does not exist — refusing to report success from a tree this guard cannot search.`,
    );
  }
}

/** Recursively collect .ts/.tsx under a root. */
function collectSources(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Test files are excluded deliberately: they legitimately contain broken
      // class names as fixtures and negative assertions (e.g. help/__tests__/
      // step-by-step.test.tsx asserts `not.toContain('bg-border-default')`),
      // and they render no production UI.
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      if (entry.name === '__tests__' || entry.name === '__mocks__') continue;
      collectSources(full, acc);
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const sources = srcRoots.flatMap((root) => collectSources(root));
if (sources.length === 0) {
  fail(`No .ts/.tsx files under ${SRC_REL} — the source layout moved.`);
}

/** Strip leading Tailwind variant prefixes (`hover:`, `data-[x=y]:`, `[&>svg]:`). */
function stripVariants(token: string): string {
  let prev: string;
  let out = token;
  do {
    prev = out;
    out = out.replace(/^(?:\[[^\]]*\]|[a-z0-9_&>[\]=.-]+(?:\[[^\]]*\])?)?:/, '');
  } while (out !== prev);
  return out.replace(/^[!-]/, '');
}

/**
 * CSS VALUES that collide with the colour-utility SHAPE. `boxSizing:
 * "border-box"` is a style-object value, not a class, but `border-box` matches
 * `BASE_UTILITY` and Tailwind emits nothing for it (the class is `box-border`).
 */
const NOT_A_CLASS = new Set(['border-box']);

/** Helpers that take class strings as arguments. */
const CLASS_CALLS = new Set(['cn', 'cva', 'clsx', 'cx', 'twMerge', 'twJoin', 'classNames']);

/**
 * Identifiers that hold class strings — `sizeClasses`, `getStatusClasses`. The
 * `(?![a-z])` is load-bearing: without it `classifyRequest()` reads as
 * class-holding.
 */
const CLASS_IDENT_RE = /[Cc]lass(?:es|Name|Names)?(?![a-z])/;

/** Last identifier of a callee, so `cn(…)` and `utils.cn(…)` both yield "cn". */
function calleeName(expr: ts.Expression): string | null {
  let current: ts.Expression = expr;
  while (ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  if (ts.isIdentifier(current)) return current.text;
  if (ts.isPropertyAccessExpression(current)) return current.name.text;
  return null;
}

/** Does this node open a region whose strings are class strings? */
function opensClassContext(node: ts.Node): boolean {
  if (ts.isJsxAttribute(node)) {
    const name = ts.isIdentifier(node.name) ? node.name.text : null;
    return name === 'className' || name === 'class';
  }
  if (ts.isCallExpression(node)) {
    const callee = calleeName(node.expression);
    return callee !== null && CLASS_CALLS.has(callee);
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return CLASS_IDENT_RE.test(node.name.text);
  }
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
    return CLASS_IDENT_RE.test(node.name.text);
  }
  return false;
}

export interface ExtractedClasses {
  /** Base colour utilities, variants and slash-opacity already stripped. */
  tokens: string[];
  /** Class names assembled at runtime, which Tailwind can never emit. */
  dynamic: Array<{ line: number; snippet: string; kind: string }>;
  /** `sourceFile.parseDiagnostics.length`, or -1 if the detector is unavailable. */
  syntaxErrors: number;
}

/**
 * Pull colour-utility candidates out of one source file.
 *
 * Uses the TypeScript parser rather than a regex over the raw text. A regex
 * matching quote-delimited runs cannot tell a string from a comment, a REGEX
 * LITERAL, or JSX TEXT. Measured against the regex this replaces: it collected
 * classes named inside COMMENTS as if they were referenced, and it missed four
 * real ones (`bg-no-repeat`, `fill-content-secondary`, `fill-surface-muted`,
 * `stroke-edge`). Its damage from a stray quote was bounded to one line, since
 * the pattern excluded newlines — parsing removes the bound as a concern
 * entirely, and is what lets the runtime-construction check below distinguish
 * a class context from an element id.
 *
 * Exported so scripts/__tests__/verify-web-class-resolution.test.ts can drive
 * it with synthetic sources, per the findViolationsInSource precedent in
 * verify-shared-side-effects.ts.
 */
export function extractClasses(fileName: string, source: string): ExtractedClasses {
  // ScriptKind.TSX is what makes `<div>` JSX rather than a type assertion, and
  // what lets the scanner tell a regex literal from a division.
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);

  const tokens: string[] = [];
  const dynamic: ExtractedClasses['dynamic'] = [];
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const addFrom = (body: string) => {
    if (!/[a-z]-[a-z]/.test(body)) return;
    for (const raw of body.split(/\s+/)) {
      // Drop slash-opacity: that failure mode belongs to guard:design-tokens.
      // Checking the family alone still catches an undefined family.
      const token = stripVariants(raw).replace(/\/\d+$/, '');
      if (!BASE_UTILITY.test(token) || NOT_A_CLASS.has(token)) continue;
      tokens.push(token);
    }
  };

  const visit = (node: ts.Node, inClassContext: boolean): void => {
    const nowInClass = inClassContext || opensClassContext(node);

    if (ts.isStringLiteralLike(node)) {
      addFrom(node.text);
    } else if (ts.isTemplateExpression(node)) {
      // A fragment touching `${` is a PREFIX, never a whole class:
      // `bg-status-${v}` contributes "bg-status-", which Tailwind never emits
      // whichever branch runs. Report the construction site instead.
      // Only inside a class context. A template literal is far more often an
      // element id or a URL than a class name — `const headingId =
      // \`text-heading-${blockOrder}\`` matches the colour-utility SHAPE
      // exactly and is not a class at all. The token scan below needs no such
      // restriction, because a token still has to RESOLVE to count.
      const head = node.head.text;
      const prefix = head.split(/\s+/).pop() ?? '';
      if (nowInClass && /-$/.test(prefix) && BASE_UTILITY.test(prefix.slice(0, -1) + '-x')) {
        dynamic.push({ line: lineOf(node.getStart(sf)), snippet: `${prefix}\${…}`, kind: 'interpolated-class' });
      } else {
        addFrom(head);
      }
      for (const span of node.templateSpans) addFrom(span.literal.text);
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'replace' &&
      node.arguments.length > 0
    ) {
      // `classes.text.replace("text-", "bg-")` rewrites a utility PREFIX at
      // runtime; the result exists in no source file, so Tailwind never sees it.
      // Guarded by the `node.arguments.length > 0` check in the condition above.
      const arg = node.arguments[0]!;
      if (ts.isStringLiteralLike(arg) && /^[a-z][a-zA-Z0-9]*-$/.test(arg.text)) {
        dynamic.push({
          line: lineOf(node.getStart(sf)),
          snippet: `.replace("${arg.text}", …)`,
          kind: 'replace-on-class-string',
        });
      }
    }
    ts.forEachChild(node, (child) => visit(child, nowInClass));
  };
  visit(sf, false);

  const diagnostics = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
  return { tokens, dynamic, syntaxErrors: Array.isArray(diagnostics) ? diagnostics.length : -1 };
}

/**
 * Prove the parse-failure detector actually detects. `parseDiagnostics` is a TS
 * INTERNAL: if a version bump renamed it, every file would read as clean and
 * this guard would vouch for a tree it never parsed.
 */
export function parserSelfTest(): boolean {
  const broken = extractClasses('selftest.tsx', 'const a = <div className="bg-surface-card">;');
  const clean = extractClasses('selftest.tsx', 'const a = <div className="bg-surface-card" />;');
  return broken.syntaxErrors > 0 && clean.syntaxErrors === 0;
}

if (!parserSelfTest()) {
  fail(
    'The TypeScript parse-failure detector is broken: a deliberately malformed source reported no ' +
      'syntax errors. `sourceFile.parseDiagnostics` is a TS internal and this version may have ' +
      'moved it. Every unparseable file would silently contribute zero classes.',
  );
}

// candidate base utility -> files referencing it
const candidates = new Map<string, Set<string>>();
const runtimeBuilt: Array<{ file: string; line: number; snippet: string; kind: string }> = [];
const unparsed: string[] = [];

for (const file of sources) {
  const rel = path.relative(repoRoot, file);
  const { tokens, dynamic, syntaxErrors } = extractClasses(file, fs.readFileSync(file, 'utf8'));
  if (syntaxErrors !== 0) {
    unparsed.push(`${rel} (${syntaxErrors === -1 ? 'detector unavailable' : `${syntaxErrors} syntax error(s)`})`);
    continue;
  }
  for (const token of tokens) {
    let set = candidates.get(token);
    if (!set) candidates.set(token, (set = new Set()));
    set.add(rel);
  }
  for (const d of dynamic) runtimeBuilt.push({ ...d, file: rel });
}

if (unparsed.length > 0) {
  fail(
    `${unparsed.length} file(s) failed to parse, so they contributed zero classes — which is ` +
      `indistinguishable from a file that legitimately has none:\n   ${unparsed.slice(0, 10).join('\n   ')}`,
  );
}

const referenced = [...candidates.keys()].sort();

// Zero is never a clean result: the two roots reference ~244 colour utilities
// (~190 in apps/web, ~108 in packages/ui, overlapping). Zero -- or a collapse --
// means the extractor, a source root, or the class conventions moved, and every
// downstream check would pass vacuously.
const MIN_EXPECTED = 200;
if (referenced.length < MIN_EXPECTED) {
  fail(
    `Only ${referenced.length} colour utilities found in ${SRC_REL} (expected >= ${MIN_EXPECTED}).\n` +
      'The extractor or the source root has moved. Refusing to pass a check that examined almost nothing.',
  );
}

const run = async () => {
  // Compile Tailwind directly rather than reading a Next build. This keeps the
  // guard runnable in `pnpm lint` (no `next build` prerequisite) and pins the
  // content to exactly the candidates, so JIT emits a rule iff the class resolves.
  // tailwindcss/postcss are dependencies of apps/web, not of the repo root, and
  // pnpm's isolated store means a root-level bare import cannot see them.
  // Resolve them from apps/web explicitly instead of adding root devDependencies.
  const webDir = path.join(repoRoot, 'apps/web');
  const requireFromWeb = createRequire(path.join(webDir, 'package.json'));
  const resolveFromWeb = (id: string) => pathToFileURL(requireFromWeb.resolve(id)).href;

  let postcss: typeof import('postcss').default;
  // Typed as returning a postcss plugin rather than `unknown`: that is what the
  // tailwindcss default export actually produces, and it is what the
  // `postcss([...])` call below requires.
  let tailwind: (cfg: unknown) => import('postcss').AcceptedPlugin;
  try {
    postcss = (await import(resolveFromWeb('postcss'))).default;
    tailwind = (await import(resolveFromWeb('tailwindcss'))).default;
  } catch (err) {
    fail(
      'Could not load tailwindcss/postcss from apps/web — run `pnpm install` first.\n' +
        `Refusing to report success without compiling. (${(err as Error).message})`,
    );
  }
  const { default: userConfig } = await import('../apps/web/tailwind.config');

  const { css } = await postcss([
    tailwind({ ...userConfig, content: [{ raw: referenced.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined });

  if (!css || css.length === 0) {
    fail('Tailwind produced an empty stylesheet — the compile failed, so this guard proves nothing.');
  }

  const emits = (cls: string) =>
    new RegExp(`\\.${cls.replace(/-/g, '\\-')}(?=[{>:,\\s.\\[])`).test(css);

  // Anti-vacuity: a stylesheet that resolves NOTHING would mark every class
  // missing and look like a catastrophic failure of the code under test.
  const resolved = referenced.filter(emits);
  if (resolved.length === 0) {
    fail(
      'No referenced class resolved at all — the compile or the selector match is broken, ' +
        'not the source. Refusing to report every class as a violation.',
    );
  }

  const missing = referenced.filter((c) => !emits(c));

  console.log(`colour utilities referenced in ${SRC_REL}: ${referenced.length} (resolved: ${resolved.length})`);
  console.log(`class names built at runtime: ${runtimeBuilt.length}`);

  if (runtimeBuilt.length > 0) {
    // Distinct from an unresolved class: the name may be perfectly valid, but
    // Tailwind's scanner reads source TEXT, so a name assembled at runtime is
    // never a candidate and never emits. `StatusDot` hit both at once -- it
    // derived its dot class with `.replace("text-", "bg-")` while the config
    // also lacked `owner`/`board`, so 5 of 8 variants rendered no colour.
    console.error(`\n❌ ${runtimeBuilt.length} class name(s) are assembled at runtime and can never be emitted:\n`);
    for (const d of runtimeBuilt) console.error(`   ${d.file}:${d.line}  ${d.snippet}  (${d.kind})`);
    console.error('\nWrite the full class names out statically -- a literal map keyed by variant.\n');
  }

  if (missing.length === 0) {
    if (runtimeBuilt.length > 0) process.exit(1);
    console.log('✅ all emit CSS, none built at runtime');
    return;
  }

  console.error(`\n❌ ${missing.length} class(es) emit NO CSS and render as no style:\n`);
  for (const cls of missing) {
    const where = [...candidates.get(cls)!].slice(0, 3).join(', ');
    const more = candidates.get(cls)!.size > 3 ? ` (+${candidates.get(cls)!.size - 3} more)` : '';
    console.error(`   ${cls}\n      ${where}${more}`);
  }
  console.error(
    '\nUsual causes:\n' +
      "  • the family/shade is missing from `theme.extend.colors` in apps/web/tailwind.config.ts\n" +
      '  • the CSS VAR name was used as the class name — the var is `--interactive-primary`,\n' +
      '    but the class is `bg-interactive` (the family DEFAULT)\n' +
      '  • an upstream shadcn class assuming a `background`/`input`/`ring` vocabulary\n' +
      '    this repo does not define\n',
  );
  process.exit(1);
};

// ESM main-detection (POSIX only -- matches the other guards). Importing this
// module from a unit test must not scan the tree or exit the runner.
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((err) => {
    fail(`Guard could not complete: ${err?.stack ?? err}`);
  });
}
