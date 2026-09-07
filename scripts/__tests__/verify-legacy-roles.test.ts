/**
 * Fixture tests for `guard:legacy-roles` pass 2 (retired vocabulary in comment
 * prose).
 *
 * The cases that matter are the ones a REGEX-based guard would get wrong. Pass 2
 * exists because ~60 stale docblocks accumulated where pass 1 (quoted literals)
 * could not see them, and several asserted gates the code does not perform — so
 * a guard that silently under- or over-reports is worse than none.
 *
 * Vacuously red is as useless as vacuously green (`.claude/rules/verification.md`),
 * so both directions are covered: every "must flag" case has a sibling
 * "must not flag" case that would also break if the extractor stopped working.
 */
import { describe, it, expect } from 'vitest';
import {
  findCommentViolations,
  collectComments,
  mergeAdjacent,
  parseDetectorWorks,
  scanFile,
  COMMENT_TERMS,
} from '../lib/legacy-role-comments';

const lines = (v: ReturnType<typeof findCommentViolations>): number[] =>
  (v ?? []).map((x) => x.line);

describe('flags retired vocabulary in comments', () => {
  it('flags a line comment', () => {
    const src = ['const a = 1;', '// caller must hold pm_admin', 'const b = 2;'].join('\n');
    expect(lines(findCommentViolations('a.ts', src))).toEqual([2]);
  });

  it('flags a JSDoc block, reporting the line the name is ON, not the block start', () => {
    const src = ['/**', ' * Docs.', ' * Auth: site_manager required.', ' */', 'export const a = 1;'].join('\n');
    expect(lines(findCommentViolations('a.ts', src))).toEqual([3]);
  });

  it('flags the dead BILINGUAL marker, which contains none of the role names', () => {
    const src = ['// BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup', 'const a = 1;'].join('\n');
    const found = findCommentViolations('a.ts', src);
    expect(found?.[0]?.terms).toEqual(['BILINGUAL (role-v3)']);
  });

  it('flags a trailing comment on a code line', () => {
    expect(lines(findCommentViolations('a.ts', 'const a = 1; // property_manager_admin only'))).toEqual([1]);
  });

  it('reports every retired term on the line', () => {
    const src = '// site_manager and property_manager_admin\nconst a = 1;';
    expect(findCommentViolations('a.ts', src)?.[0]?.terms).toEqual([
      'property_manager_admin',
      'site_manager',
    ]);
  });
});

describe('does NOT flag the same names outside comments', () => {
  // These are the cases a line regex cannot get right, and the whole reason the
  // extractor uses the TypeScript parser. Each is a real shape in this repo.
  it('a string literal — the dev-login alias map', () => {
    const src = "const VALID = new Set(['platform_admin', 'pm_admin']);";
    expect(findCommentViolations('a.ts', src)).toEqual([]);
  });

  it('an object key — the help viewer-role vocabulary', () => {
    const src = 'const R = { property_manager_admin: 1, site_manager: 2 };';
    expect(findCommentViolations('a.ts', src)).toEqual([]);
  });

  it('JSX text', () => {
    const src = 'export const A = () => <p>pm_admin is retired</p>;';
    expect(findCommentViolations('a.tsx', src)).toEqual([]);
  });

  it('a template literal', () => {
    expect(findCommentViolations('a.ts', 'const s = `role is pm_admin`;')).toEqual([]);
  });

  it('an identifier', () => {
    expect(findCommentViolations('a.ts', 'const site_manager = 1;')).toEqual([]);
  });

  it('a JSX file whose text contains an apostrophe — a quote-delimited regex would run on', () => {
    // `Don't` opens an unterminated string to a naive scanner, which would then
    // swallow (or mis-attribute) whatever follows on later lines.
    const src = ["export const A = () => <p>Don't stop</p>;", '// pm_admin here IS a comment'].join('\n');
    expect(lines(findCommentViolations('a.tsx', src))).toEqual([2]);
  });

  it('bare `cam` is deliberately not a term', () => {
    expect(findCommentViolations('a.ts', '// only a cam may do this\nconst a = 1;')).toEqual([]);
    expect(COMMENT_TERMS.map(([n]) => n)).not.toContain('cam');
  });
});

describe('the exempt marker', () => {
  it('suppresses when inside the same block comment', () => {
    const src = ['/**', ' * Auth: pm_admin.', ' * legacy-roles:exempt — historical.', ' */', 'const a = 1;'].join('\n');
    expect(findCommentViolations('a.ts', src)).toEqual([]);
  });

  it('suppresses from an adjacent line comment BELOW (a `//` run is one block)', () => {
    // Each `//` line is its own CommentRange; without mergeAdjacent this fails.
    const src = ['// caller must hold pm_admin', '// legacy-roles:exempt — historical.', 'const a = 1;'].join('\n');
    expect(findCommentViolations('a.ts', src)).toEqual([]);
  });

  it('suppresses from a separated comment up to two lines above', () => {
    const src = ['// legacy-roles:exempt — historical.', '', '// caller must hold pm_admin', 'const a = 1;'].join('\n');
    expect(findCommentViolations('a.ts', src)).toEqual([]);
  });

  it('does NOT suppress from further than the lookbehind allows', () => {
    const src = ['// legacy-roles:exempt — historical.', '', '', '', '// caller must hold pm_admin', 'const a = 1;'].join('\n');
    expect(lines(findCommentViolations('a.ts', src))).toEqual([5]);
  });

  it('does NOT suppress an unrelated comment elsewhere in the file', () => {
    const src = ['// legacy-roles:exempt — for the thing below.', 'const a = 1;', '', 'const b = 2;', '// pm_admin here is not covered'].join('\n');
    expect(lines(findCommentViolations('a.ts', src))).toEqual([5]);
  });
});

describe('could-not-check signalling', () => {
  it('returns null for a file that does not parse, rather than reporting it clean', () => {
    expect(findCommentViolations('a.ts', 'const a = (((;')).toBeNull();
    expect(scanFile('a.ts', 'const a = (((;')).toBeNull();
  });

  it('the parse-failure detector itself fires (parseDiagnostics is a TS internal)', () => {
    expect(parseDetectorWorks()).toBe(true);
  });

  it('a valid file with a syntax-error-looking string still parses', () => {
    expect(findCommentViolations('a.ts', 'const a = "(((;";')).toEqual([]);
  });
});

describe('comment extraction reaches the whole file', () => {
  it('finds a comment after the last statement (the EOF token)', () => {
    expect(lines(findCommentViolations('a.ts', 'const a = 1;\n// trailing pm_admin'))).toEqual([2]);
  });

  it('finds a comment before the first statement', () => {
    expect(lines(findCommentViolations('a.ts', '// leading pm_admin\nconst a = 1;'))).toEqual([1]);
  });

  it('counts a `//` run as ONE comment, so the printed denominator is logical comments', () => {
    const src = ['// one', '// two', '// three', 'const a = 1;'].join('\n');
    expect(scanFile('a.ts', src)?.commentCount).toBe(1);
    expect(collectComments('a.ts', src)).toHaveLength(3);
    expect(mergeAdjacent(collectComments('a.ts', src) ?? [])).toHaveLength(1);
  });

  it('does not merge comments separated by a blank line', () => {
    const src = ['// one', '', '// two', 'const a = 1;'].join('\n');
    expect(mergeAdjacent(collectComments('a.ts', src) ?? [])).toHaveLength(2);
  });
});
