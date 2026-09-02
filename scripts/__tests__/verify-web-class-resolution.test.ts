import { describe, expect, it } from 'vitest';

import { extractClasses, parserSelfTest } from '../verify-web-class-resolution';

/**
 * Unit tests for the class extractor behind `pnpm guard:class-resolution`.
 *
 * WHY THIS FILE EXISTS. The guard originally hand-rolled a lexer that masked
 * strings and comments with index arithmetic. It modelled neither REGEX
 * LITERALS nor JSX TEXT, so a single quote or apostrophe in either
 * desynchronised it for the remainder of the file — silently, with no error and
 * no missing-coverage signal. Measured before the fix: 8 of 1803 scanned files
 * desynced, and `apps/web/src/components/shared/csv-export-button.tsx` yielded
 * ZERO class sites for its two real `className=` attributes because of `/"/g`
 * on its line 17. The guard reported "files scanned: 1803" over that hole.
 *
 * It was found by a code review, not by a test, because there was no test. The
 * extractor now uses the TypeScript parser, and every mechanism the review
 * proved could break independently gets its own case below — per
 * .claude/rules/verification.md, "one probe does not cover four cases".
 *
 * The guard only collects COLOUR utilities (bg-, text-, border-, ring-, …) with
 * variants and slash-opacity stripped, so the fixtures below use real colour
 * classes rather than the p-4/h-5 spacing utilities that shape would drop.
 */
const classesOf = (source: string, fileName = 'probe.tsx'): string[] => [
  ...new Set(extractClasses(fileName, source).tokens),
];

const dynamicOf = (source: string, fileName = 'probe.tsx') =>
  extractClasses(fileName, source).dynamic;

describe('class-authoring contexts', () => {
  it('reads a plain className attribute', () => {
    expect(classesOf('export const A = () => <div className="p-4 bg-status-success" />;')).toEqual([
      'bg-status-success',
    ]);
  });

  it('reads a bare class attribute too', () => {
    expect(classesOf('export const A = () => <div class="p-6 bg-status-info" />;')).toEqual([
      'bg-status-info',
    ]);
  });

  it('reads every argument of a cn() call, without duplicating the nested attribute', () => {
    const src =
      'export const A = ({ x }) => <div className={cn("p-1 flex-1", x && "bg-status-danger")} />;';
    expect(classesOf(src)).toEqual(['bg-status-danger']);
  });

  it('reads a member-form callee, which the old `\\bcn\\(` regex also matched', () => {
    expect(classesOf('export const A = utils.cn("p-3 text-status-brand");')).toEqual([
      'text-status-brand',
    ]);
  });

  it('reads a cva variants object', () => {
    const src = 'const v = cva("bg-surface-card", { variants: { tone: { warn: "text-status-warning" } } });';
    expect(classesOf(src)).toEqual(['bg-surface-card', 'text-status-warning']);
  });

  it('reads a class-holding declaration', () => {
    expect(classesOf('const sizeClasses = { sm: "bg-status-info", lg: "bg-status-brand" };')).toEqual([
      'bg-status-info',
      'bg-status-brand',
    ]);
  });

  it('reads both branches of a class-holding arrow function', () => {
    // The old lexer opened its region on the PARAMETER LIST for this shape and
    // read the body not at all.
    const src = 'const getStatusClasses = (v) => { if (v) return "bg-status-info"; return "bg-status-neutral"; };';
    expect(classesOf(src)).toEqual(['bg-status-info', 'bg-status-neutral']);
  });

  it('does NOT treat classify*() as class-holding', () => {
    // The `(?![a-z])` boundary. Without it every status string this kind of
    // function returns is collected as a Tailwind class.
    const src = "function classifyRequest() { return 'esign-sign'; }";
    expect(classesOf(src)).toEqual([]);
  });
});

// Forward coverage, not regressions against the guard as it shipped. Measured:
// the regex extractor this replaced bounded its match at a newline, so a stray
// quote or apostrophe only corrupted the REST OF ITS LINE — these fixtures put
// the class on the next line, and it survived them. What it genuinely got wrong
// is comments (pinned below), and it missed 4 real classes the parser finds
// (`bg-no-repeat`, `fill-content-secondary`, `fill-surface-muted`, `stroke-edge`).
// These cases exist so a future swap back to text scanning fails loudly.
describe('constructs that defeat naive text scanning', () => {
  it('finds classes after a regex literal containing a double quote', () => {
    // csv-export-button.tsx:17 is `/"/g`.
    const src = ['const re = /"/g;', 'export const A = () => <div className="p-4 bg-status-info" />;'].join('\n');
    expect(classesOf(src)).toContain('bg-status-info');
  });

  it('finds classes after a regex literal containing an apostrophe', () => {
    const src = ["const re = /don't/;", 'export const A = () => <div className="p-4 bg-status-info" />;'].join('\n');
    expect(classesOf(src)).toContain('bg-status-info');
  });

  it('finds classes after JSX text containing an apostrophe', () => {
    // MobileNotificationsContent.tsx has "You're all caught up" in JSX text.
    // A same-line class after it is what a line-bounded regex loses.
    const src = [
      'export const C = () => (',
      '  <div>',
      "    <p>Don't stop</p>",
      '    <span className="text-sm bg-status-warning" />',
      '  </div>',
      ');',
    ].join('\n');
    expect(classesOf(src)).toContain('bg-status-warning');
  });
});

describe('comments are not source', () => {
  // The demonstrated defect in the regex extractor: it matched quote-delimited
  // runs anywhere in the file, including inside comments, so a class named in a
  // comment counted as referenced. Verified red against it.
  it('ignores a className in a line comment', () => {
    expect(classesOf('// <span className="bg-status-info" />\nexport const A = 1;')).toEqual([]);
  });

  it('ignores a className in a block comment', () => {
    expect(classesOf('/* preview <img className="bg-status-info" /> */\nexport const A = 1;')).toEqual([]);
  });

  // NOTE: there is deliberately no "ignores classes inside an unrelated string"
  // case. This guard scans EVERY string literal, not just class contexts —
  // `BASE_UTILITY` plus "does it resolve?" is what keeps that tolerable, and it
  // is why a colour class in a non-JSX string (an object of style presets, a
  // prop default) is still checked. Only comments and regex literals are
  // excluded, and that is what the two cases above pin.
});

describe('template literals: fragments are not classes', () => {
  it('reports an interpolated class instead of collecting its fragments', () => {
    const src = 'export const A = ({ v }) => <div className={`bg-status-${v}-bg`} />;';
    expect(classesOf(src)).toEqual([]);
    expect(dynamicOf(src)).toEqual([
      expect.objectContaining({ kind: 'interpolated-class', snippet: 'bg-status-${…}' }),
    ]);
  });

  it('keeps a whole token when whitespace separates it from the interpolation', () => {
    expect(classesOf('export const A = ({ x }) => <div className={`text-status-info ${x}`} />;')).toEqual([
      'text-status-info',
    ]);
  });

  it('keeps a whole token that follows an interpolation after whitespace', () => {
    expect(classesOf('export const A = ({ x }) => <div className={`${x} text-status-info`} />;')).toEqual([
      'text-status-info',
    ]);
  });

  it('still collects ternary branches inside an interpolation', () => {
    const src =
      'export const A = ({ x }) => <div className={`bg-surface-card ${x ? "bg-status-info" : "bg-status-neutral"}`} />;';
    expect(classesOf(src)).toEqual(['bg-surface-card', 'bg-status-info', 'bg-status-neutral']);
  });
});

describe('equality operands are values, not classes', () => {
  it('drops the operand in normal order', () => {
    const src =
      'export const A = ({ s }) => <div className={s === "in-progress" ? "bg-status-info" : "bg-status-neutral"} />;';
    expect(classesOf(src)).toEqual(['bg-status-info', 'bg-status-neutral']);
  });

  it('drops the operand in Yoda order too', () => {
    // The old backward text lookback only handled one order, so `in-progress`
    // — which carries a hyphen and so clears the separator filter — was
    // collected as a class and reported as resolving to nothing.
    const src =
      'export const A = ({ s }) => <div className={"in-progress" === s ? "bg-status-info" : "bg-status-neutral"} />;';
    expect(classesOf(src)).toEqual(['bg-status-info', 'bg-status-neutral']);
  });

  it('drops a case-clause label', () => {
    const src =
      'function getStatusClasses(s) { switch (s) { case "in-progress": return "bg-status-info"; } }';
    expect(classesOf(src)).toEqual(['bg-status-info']);
  });
});

describe('runtime class construction', () => {
  it('flags .replace() used to rewrite a utility prefix', () => {
    const src = 'export const A = ({ c }) => <div className={cn(c.text.replace("text-", "bg-"))} />;';
    expect(dynamicOf(src)).toEqual([
      expect.objectContaining({ kind: 'replace-on-class-string', snippet: '.replace("text-", …)' }),
    ]);
  });

  it('does not flag ordinary text munging', () => {
    const src = 'export const slug = (s) => s.replace("hello", "world");';
    expect(dynamicOf(src)).toEqual([]);
  });

  it('never collects a token ending in a hyphen', () => {
    // Both arguments of `.replace("text-", "bg-")` sit inside the cn() region.
    const src = 'export const A = ({ c }) => <div className={cn(c.text.replace("text-", "bg-"))} />;';
    expect(classesOf(src)).toEqual([]);
  });
});

describe('TypeScript and JSX shapes that must not break extraction', () => {
  it('sees through `as const`', () => {
    expect(classesOf('const sizeClasses = { sm: "bg-status-info" } as const;')).toEqual(['bg-status-info']);
  });

  it('sees through `satisfies`', () => {
    const src = 'const sizeClasses = { sm: "bg-status-brand" } satisfies Record<string, string>;';
    expect(classesOf(src)).toEqual(['bg-status-brand']);
  });

  it('sees through a type annotation containing semicolons', () => {
    // `DECL_RE`'s annotation group was `(?::[^=;\n]*)?`, so a `;` inside an
    // inline object type killed the match and the whole map went unread.
    const src = 'const padClasses: Record<string, { a: string; b: string }> = { sm: { a: "bg-status-info", b: "text-status-info" } };';
    expect(classesOf(src)).toEqual(['bg-status-info', 'text-status-info']);
  });

  it('handles a JSX spread attribute alongside className', () => {
    expect(classesOf('export const A = ({ rest }) => <div {...rest} className="bg-status-info" />;')).toEqual([
      'bg-status-info',
    ]);
  });

  it('handles a namespaced JSX attribute', () => {
    expect(classesOf('export const A = () => <div xlink:href="x" className="bg-status-brand" />;')).toEqual([
      'bg-status-brand',
    ]);
  });

  it('handles a regex literal containing an unbalanced brace', () => {
    // NOT a regression probe: verified against the old hand-rolled lexer, which
    // survived this one (its brace counting only ran over already-masked text).
    // Kept as forward coverage for a construct a future extractor could break.
    const src = ['const re = /[}]/;', 'export const A = () => <div className="p-4 bg-status-info" />;'].join('\n');
    expect(classesOf(src)).toContain('bg-status-info');
  });

  it('parses a .ts file with a generic arrow that would be illegal in TSX', () => {
    const src = 'const getClasses = <T,>(x: T) => "bg-status-brand";';
    const result = extractClasses('probe.ts', src);
    expect(result.syntaxErrors).toBe(0);
    expect(result.tokens).toEqual(['bg-status-brand']);
  });
});

describe('the parse-failure detector', () => {
  it('reports syntax errors for a malformed source', () => {
    expect(extractClasses('probe.tsx', 'const a = <div className="bg-status-info">;').syntaxErrors).toBeGreaterThan(0);
  });

  it('reports none for a clean source', () => {
    expect(extractClasses('probe.tsx', 'const a = <div className="bg-status-info" />;').syntaxErrors).toBe(0);
  });

  it('self-test passes, so the guard may trust the detector', () => {
    // `parseDiagnostics` is a TypeScript internal. If a TS upgrade moved it,
    // every file would read as clean and the guard would vouch for a tree it
    // never parsed — so the guard refuses to run when this returns false.
    expect(parserSelfTest()).toBe(true);
  });
});
