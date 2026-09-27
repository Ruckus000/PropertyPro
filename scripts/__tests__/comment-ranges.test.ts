/**
 * The shared comment collector behind `guard:legacy-roles` pass 2 and
 * `guard:service-dead-exports`. Both guards' own suites exercise it through
 * their APIs; these cases pin the collector's contract directly.
 */
import { describe, it, expect } from 'vitest';
import { collectCommentRanges, commentRangesWork } from '../lib/comment-ranges';

const texts = (source: string, fileName = 'a.ts'): string[] | null => {
  const found = collectCommentRanges(fileName, source);
  return found === null ? null : found.ranges.map((r) => source.slice(r.pos, r.end));
};

describe('collectCommentRanges', () => {
  it('returns null for a file that does not parse', () => {
    expect(collectCommentRanges('a.ts', 'const a = (((;')).toBeNull();
  });

  it('reports each comment exactly once, even where leading and trailing trivia overlap', () => {
    expect(texts('const x = [\n  1, // one\n  2, /* two */\n];\n// three\n')).toEqual([
      '// one',
      '/* two */',
      '// three',
    ]);
  });

  it('does not report comment-shaped text inside strings, templates or JSX text', () => {
    expect(texts('const s = "// no"; const t = `/* no */`;')).toEqual([]);
    expect(texts('export const A = () => <p>// no</p>;', 'a.tsx')).toEqual([]);
  });

  it('reaches a JSX expression comment', () => {
    expect(texts('export const A = () => <div>{/* yes */}</div>;', 'a.tsx')).toEqual(['/* yes */']);
  });
});

describe('commentRangesWork — parser self-test', () => {
  it('passes on this TypeScript version', () => {
    expect(commentRangesWork()).toBe(true);
  });
});
