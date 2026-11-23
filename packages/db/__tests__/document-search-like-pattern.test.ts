/**
 * Document search's ILIKE fallback must match what the user typed literally.
 * Unescaped, a `%` or `_` in the query is a wildcard (`50%` matched "2050"),
 * and a query of `%`/`_` runs alone would match every row. The pattern is
 * escaped with backslash, Postgres' default LIKE escape character, so no
 * ESCAPE clause is needed.
 *
 * `ilike` is spied so the test reads the exact pattern searchDocuments builds;
 * a small LIKE matcher with Postgres' semantics then shows which titles it
 * admits. The DB-backed version is in document-search.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ilikeSpy } = vi.hoisted(() => ({ ilikeSpy: vi.fn() }));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    ilike: (column: Parameters<typeof actual.ilike>[0], pattern: string) => {
      ilikeSpy(pattern);
      return actual.ilike(column, pattern);
    },
  };
});

vi.mock('../src/scoped-client', () => ({
  createScopedClient: () => ({
    selectFrom: () => ({
      orderBy: () => ({ limit: async () => [] }),
    }),
  }),
}));

vi.mock('../src/queries/document-access', () => ({
  buildDocumentAccessFilter: vi.fn(),
}));

import { searchDocuments } from '../src/queries/document-search';

/** Postgres LIKE semantics, backslash escape: `%` any run, `_` one char, `\x` literal x. */
function likeMatches(pattern: string, text: string): boolean {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '\\' && i + 1 < pattern.length) {
      re += pattern[++i]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (ch === '%') re += '[\\s\\S]*';
    else if (ch === '_') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i').test(text);
}

async function patternFor(query: string): Promise<string> {
  ilikeSpy.mockClear();
  await searchDocuments({ communityId: 1, query });
  // Title and description get the same pattern.
  expect(ilikeSpy).toHaveBeenCalledTimes(2);
  expect(ilikeSpy.mock.calls[0]![0]).toBe(ilikeSpy.mock.calls[1]![0]);
  return ilikeSpy.mock.calls[0]![0] as string;
}

describe('document search ILIKE pattern', () => {
  beforeEach(() => ilikeSpy.mockClear());

  it('a literal % matches only titles containing %', async () => {
    const pattern = await patternFor('50%');
    expect(pattern).toBe('%50\\%%');
    expect(likeMatches(pattern, '50% reserve funding')).toBe(true);
    expect(likeMatches(pattern, 'Budget 2050 plan')).toBe(false);
  });

  it('a literal _ matches only an underscore', async () => {
    const pattern = await patternFor('a_b');
    expect(pattern).toBe('%a\\_b%');
    expect(likeMatches(pattern, 'file a_b.pdf')).toBe(true);
    expect(likeMatches(pattern, 'file axb.pdf')).toBe(false);
  });

  it('a backslash is escaped too', async () => {
    const pattern = await patternFor('C:\\docs');
    expect(pattern).toBe('%C:\\\\docs%');
    expect(likeMatches(pattern, 'saved in C:\\docs today')).toBe(true);
  });

  it('a query of wildcards alone does not match everything', async () => {
    const pattern = await patternFor('%%');
    expect(likeMatches(pattern, 'Board Minutes Q1')).toBe(false);
    expect(likeMatches(pattern, '100%% sure')).toBe(true);
  });
});
