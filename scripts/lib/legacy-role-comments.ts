/**
 * Pass 2 of `guard:legacy-roles`: retired role vocabulary in COMMENT PROSE.
 *
 * Pass 1 (in `scripts/verify-legacy-roles.ts`) matches QUOTED literals, so a
 * docblock saying "caller must hold pm_admin" cost nothing — and ~60 of them
 * accumulated across the tree after ADR-006 declared role-v3 fully landed.
 * Several asserted gates the code does not perform (one described a closed
 * vulnerability as the current gate), so this is a correctness check, not a
 * tidiness one.
 *
 * Extracted here as pure functions so `scripts/__tests__/verify-legacy-roles.test.ts`
 * can exercise them without running the repo-wide scan.
 */
import ts from 'typescript';

/**
 * Retired names that must never describe CURRENT behaviour.
 *
 * Bare `cam` is deliberately ABSENT. It has ~50 legitimate hits — the marketing
 * "CAM portfolio" copy (Community Association Manager is the Florida licensure
 * term), the `who-cam` asset filename, a `cam.getpropertypro.com` DNS fixture —
 * so matching it would train people to exempt rather than fix. Coverage here is
 * partial on purpose.
 */
export const COMMENT_TERMS: ReadonlyArray<readonly [string, RegExp]> = [
  ['pm_admin', /\bpm_admin\b/],
  ['property_manager_admin', /\bproperty_manager_admin\b/],
  ['site_manager', /\bsite_manager\b/],
  ['BILINGUAL (role-v3)', /BILINGUAL \(role-v3\)/],
];

export const EXEMPT_MARKER = /legacy-roles:exempt/;

/** How many source lines above a comment an exempt marker may sit. */
export const EXEMPT_LOOKBEHIND = 2;

export interface CommentHit {
  /** 1-based line the comment starts on. */
  line: number;
  text: string;
}

export interface CommentViolation {
  line: number;
  terms: string[];
}

/**
 * Every comment in `source`, or `null` if the file did not parse.
 *
 * Uses the parser rather than a regex because a regex over raw text cannot tell
 * a comment from a string literal or from JSX text — and these terms appear
 * legitimately in both (dev-login aliases, help-frontmatter vocabulary). The
 * same reasoning is recorded in `scripts/verify-web-class-resolution.ts`.
 */
export function collectComments(fileName: string, source: string): CommentHit[] | null {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);

  const diagnostics = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics;
  if (Array.isArray(diagnostics) && diagnostics.length > 0) return null;

  const seen = new Set<number>();
  const out: CommentHit[] = [];
  const add = (ranges: ts.CommentRange[] | undefined): void => {
    for (const r of ranges ?? []) {
      if (seen.has(r.pos)) continue;
      seen.add(r.pos);
      out.push({
        line: sf.getLineAndCharacterOfPosition(r.pos).line + 1,
        text: source.slice(r.pos, r.end),
      });
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
 * Merge a run of adjacent `//` lines into one logical comment.
 *
 * The parser returns one CommentRange PER `//` line, so without this an exempt
 * marker written on the line below the offending one would not apply — they
 * would be two unrelated comments. A `/* *\/` block is already one range.
 */
export function mergeAdjacent(hits: CommentHit[]): CommentHit[] {
  const sorted = [...hits].sort((a, b) => a.line - b.line);
  const merged: CommentHit[] = [];
  for (const hit of sorted) {
    const prev = merged[merged.length - 1];
    const prevEnd = prev ? prev.line + prev.text.split('\n').length - 1 : -1;
    if (prev && hit.line === prevEnd + 1) {
      prev.text = `${prev.text}\n${hit.text}`;
    } else {
      merged.push({ ...hit });
    }
  }
  return merged;
}

/**
 * Violations in one file, or `null` if it did not parse (the caller decides
 * whether an unparseable file is a hard stop).
 *
 * A comment is exempt when `legacy-roles:exempt` appears anywhere in it, or on
 * either of the two source lines immediately above it.
 */
export function findCommentViolations(
  fileName: string,
  source: string,
  /**
   * Comments already collected AND merged for this file. `scanFile` passes what
   * it holds, so neither the parse nor the merge is repeated; omitting it does
   * both, which is what the tests want and what the repo-wide scan must not do.
   */
  premerged?: CommentHit[],
): CommentViolation[] | null {
  let merged = premerged;
  if (!merged) {
    const comments = collectComments(fileName, source);
    if (comments === null) return null;
    merged = mergeAdjacent(comments);
  }

  const lines = source.split('\n');
  const violations: CommentViolation[] = [];

  for (const c of merged) {
    if (!COMMENT_TERMS.some(([, re]) => re.test(c.text))) continue;
    if (EXEMPT_MARKER.test(c.text)) continue;
    const from = Math.max(0, c.line - 1 - EXEMPT_LOOKBEHIND);
    if (EXEMPT_MARKER.test(lines.slice(from, c.line - 1).join('\n'))) continue;

    // Report the line the name is ON, not the line the comment block starts on —
    // a file-header docblock would otherwise always report line 1.
    c.text.split('\n').forEach((commentLine, i) => {
      const terms = COMMENT_TERMS.filter(([, re]) => re.test(commentLine)).map(([name]) => name);
      if (terms.length > 0) violations.push({ line: c.line + i, terms });
    });
  }
  return violations;
}

export interface FileScan {
  /** Logical comments examined — the denominator the guard prints. */
  commentCount: number;
  violations: CommentViolation[];
}

/**
 * One file's scan: the violations plus how many comments were examined.
 * `null` when the file did not parse.
 *
 * Exists so the guard can report a denominator without parsing every file twice;
 * `findCommentViolations` is the simpler API the tests use.
 *
 * That claim was FALSE as first written — this function called `collectComments`
 * and then `findCommentViolations`, which calls it again, so every file got two
 * full `ts.createSourceFile` parses with parent pointers. Measured at ~1.15s of a
 * ~4.8s warm guard run. The merged comments are now computed once and handed down.
 */
export function scanFile(fileName: string, source: string): FileScan | null {
  const comments = collectComments(fileName, source);
  if (comments === null) return null;
  const merged = mergeAdjacent(comments);
  // Non-null: `collectComments` already succeeded above, and the pre-collected
  // path cannot re-fail.
  const violations = findCommentViolations(fileName, source, merged) ?? [];
  return { commentCount: merged.length, violations };
}

/**
 * Prove the parse-failure detector actually detects, before a clean scan is
 * trusted. `parseDiagnostics` is a TS internal; a version that stopped
 * populating it would make every file look parseable and this guard vacuously
 * green. Same self-test `verify-web-class-resolution.ts` performs.
 */
export function parseDetectorWorks(): boolean {
  return collectComments('probe.ts', 'const a = (((;') === null;
}
