/**
 * The one comment collector every guard shares.
 *
 * Two guards need "every comment in this file": `guard:legacy-roles` pass 2
 * (retired vocabulary in comment prose) and `guard:service-dead-exports`
 * (comment mentions do not count as references). They used to carry separate
 * collectors, and the legacy-roles one walked NODES — which the S9 review
 * measured as blind to 1,154 of 21,830 comment ranges in its scan scope.
 * Both now call this module, so a fix to the walk lands in both at once.
 *
 * Both guards use the parser rather than a regex because a regex over raw text
 * cannot tell a comment from a string literal, a regex literal or JSX text.
 */
import ts from 'typescript';

export function scriptKindFor(fileName: string): ts.ScriptKind {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (fileName.endsWith('.js') || fileName.endsWith('.mjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * The parsed file, or `null` when it did not parse. Callers decide whether
 * `null` is a refusal (exit 2) — it must never be read as "no comments".
 *
 * setParentNodes is FALSE: nothing here walks upward, and parent pointers
 * roughly double the parse (measured ~1.78s vs ~0.89s over legacy-roles'
 * 2,327 files). `getChildren(sf)` below takes the source file explicitly for
 * exactly that reason.
 */
export function parseOrNull(fileName: string, source: string): ts.SourceFile | null {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, scriptKindFor(fileName));
  // parseDiagnostics is a TS internal — `commentRangesWork()` probes that it
  // still fires before any caller trusts a clean scan.
  const diagnostics = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
  if (Array.isArray(diagnostics) && diagnostics.length > 0) return null;
  return sf;
}

export interface CommentRanges {
  sourceFile: ts.SourceFile;
  /** Every comment range, each exactly once, in walk order (not sorted). */
  ranges: ts.CommentRange[];
}

/**
 * Every comment range in the file, or `null` when it did not parse.
 *
 * TOKEN walk (`getChildren`), not a node walk (`forEachChild`): comments are
 * trivia attached to TOKEN positions, and a node walk only sees comments
 * adjacent to a node boundary. It silently misses trailing comments inside
 * array literals, call arguments and nested blocks — measured on this repo:
 * 436 of 3,851 service-dead-exports corpus files leaked, and the leak kept a
 * genuinely dead export (`findOrphanCommunities`) looking alive. The error
 * direction is always toward a missed finding — vacuously green, the failure
 * `.claude/rules/verification.md` exists to prevent.
 *
 * BOTH trivia buckets must be queried at every token. The TS trivia model
 * assigns a comment on the SAME LINE as a preceding token as that token's
 * TRAILING trivia, and `getLeadingCommentRanges` at the NEXT token's pos
 * returns `undefined` for it (probed on TS 5.9.3: for
 * `const x = [\n 1, // note\n];` the comment appears only in
 * `getTrailingCommentRanges` at the CommaToken's end). The seen-set
 * de-duplicates the overlap. The EndOfFileToken is a child of the SourceFile,
 * so a comment after the last statement is reached without a special case.
 */
export function collectCommentRanges(fileName: string, source: string): CommentRanges | null {
  const sf = parseOrNull(fileName, source);
  if (sf === null) return null;
  const seen = new Set<number>();
  const found: ts.CommentRange[] = [];
  // JSX text is not trivia, but the comment scanners do not know that: at a
  // token followed by `<p>// no</p>`'s text they read `// no</p>;` as a line
  // comment. Record every JsxText span and drop any range starting inside one.
  const jsxText: Array<[number, number]> = [];
  const add = (ranges: ts.CommentRange[] | undefined): void => {
    for (const r of ranges ?? []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      found.push(r);
    }
  };
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      jsxText.push([node.pos, node.end]);
      return;
    }
    // getChildren(sf) materializes TOKENS (forEachChild never yields them);
    // the sourceFile argument is required because we parse without parents.
    const children = node.getChildren(sf);
    if (children.length === 0) {
      add(ts.getLeadingCommentRanges(source, node.pos));
      add(ts.getTrailingCommentRanges(source, node.end));
      return;
    }
    for (const child of children) visit(child);
  };
  visit(sf);
  const ranges =
    jsxText.length === 0 ? found : found.filter((r) => !jsxText.some(([pos, end]) => r.pos >= pos && r.pos < end));
  return { sourceFile: sf, ranges };
}

/**
 * Prove the parse-failure detector AND the walk both work before a clean scan
 * is trusted. The probes include NESTED token positions deliberately: the
 * node-walk collector passed a leading-comment-only probe while leaking
 * nested-position comments. A probe that only exercises the positions an
 * extractor happens to handle is not a self-test.
 */
export function commentRangesWork(): boolean {
  const texts = (source: string): string[] | null => {
    const found = collectCommentRanges('probe.ts', source);
    return found === null ? null : found.ranges.map((r) => source.slice(r.pos, r.end));
  };
  // 1. broken input must be REFUSED, not silently "no comments".
  if (collectCommentRanges('probe.ts', 'const a = (((;') !== null) return false;
  const probes: Array<[string, string]> = [
    ['// ownLine\nconst b = 1;\n', 'ownLine'], // 2. leading, own line
    ['const x = [\n 1, // nested\n];\n', 'nested'], // 3. trailing, inside an array literal
    ['const y = 2;\n// eof\n', 'eof'], // 4. after the last statement
  ];
  if (!probes.every(([source, marker]) => texts(source)?.some((t) => t.includes(marker)) ?? false)) return false;
  // 5. JSX text that LOOKS like a comment must not be reported as one.
  const jsx = collectCommentRanges('probe.tsx', 'const A = () => <p>// notAComment</p>;\n');
  return jsx !== null && jsx.ranges.length === 0;
}
