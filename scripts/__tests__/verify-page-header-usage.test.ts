import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFile } from '../verify-page-header-usage';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../__fixtures__/page-header');
const fixture = (name: string) => resolve(fixtures, name);

describe('verifyFile (page-header guard)', () => {
  it('passes a file that uses <PageHeader title=...> and no literal <h1>', () => {
    expect(verifyFile(fixture('uses-page-header.tsx'))).toEqual([]);
  });

  it('flags a literal <h1> with its line number', () => {
    const violations = verifyFile(fixture('literal-h1.tsx'));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ line: 4 });
    expect(violations[0]!.text).toContain('<h1');
  });

  it('flags every <h1>, including one that opens across lines', () => {
    const lines = verifyFile(fixture('two-h1s.tsx')).map((v) => v.line);
    expect(lines).toEqual([3, 7]);
  });

  it('ignores <h1> that appears only in a docblock, a line comment, or a JSX comment', () => {
    // The whole point of comment stripping: prose about the h1 is not an h1.
    expect(verifyFile(fixture('comment-only.tsx'))).toEqual([]);
  });

  it('skips a file carrying a page-header:exempt line, even with a literal <h1>', () => {
    expect(verifyFile(fixture('exempt.tsx'))).toEqual([]);
  });
});
