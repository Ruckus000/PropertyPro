import { describe, expect, it } from 'vitest';
import { expandQuery } from '@/lib/help/aliases';
import {
  matchesArticleQuery,
  scoreArticleForQuery,
  searchArticles,
} from '@/lib/services/help-article-service';

describe('expandQuery — alias resolution', () => {
  it('expands "fees" to include "assessments" and "dues"', () => {
    const expanded = expandQuery('fees');
    expect(expanded.aliases).toContain('assessments');
    expect(expanded.aliases).toContain('dues');
  });

  it('expands "covenants" to include "rules" and "bylaws"', () => {
    const expanded = expandQuery('covenants');
    expect(expanded.aliases).toContain('rules');
    expect(expanded.aliases).toContain('bylaws');
  });

  it('expands "718.111" to include the §-prefixed forms', () => {
    const expanded = expandQuery('718.111');
    expect(expanded.aliases).toContain('§718.111');
    expect(expanded.aliases).toContain('§718.111(12)(g)');
  });

  it('keeps the literal query in primary terms', () => {
    const expanded = expandQuery('fees');
    expect(expanded.primary).toContain('fees');
  });

  it('returns empty arrays for an empty query', () => {
    const expanded = expandQuery('');
    expect(expanded.primary).toEqual([]);
    expect(expanded.aliases).toEqual([]);
  });

  it('does not put a term in both primary and aliases', () => {
    const expanded = expandQuery('fees');
    const overlap = expanded.aliases.filter((a) => expanded.primary.includes(a));
    expect(overlap).toEqual([]);
  });

  it('does not over-expand a short single-word alias as a substring', () => {
    // Substring matching on the trimmed query would let "camera" trigger
    // the CAM alias group ("camera".includes("cam") is true). Single-word
    // aliases must match on whole-token equality only.
    const expanded = expandQuery('camera setup');
    expect(expanded.aliases).not.toContain('community association manager');
    expect(expanded.aliases).not.toContain('cam');
  });

  it('expands a single-word alias when typed as its own token', () => {
    const expanded = expandQuery('cam responsibilities');
    expect(expanded.aliases).toContain('community association manager');
  });

  it('still substring-matches multi-word aliases inside a longer query', () => {
    // Multi-word terms keep substring semantics — "i need community
    // association manager guidance" should still trigger the CAM group.
    const expanded = expandQuery('community association manager handbook');
    expect(expanded.aliases).toContain('cam');
  });
});

const article = {
  title: 'How assessments are calculated',
  description: 'Computing the annual budget into per-unit assessments.',
  category: 'finance',
  slug: 'assessments-calculated',
  keywords: ['assessment', 'budget', 'annual'],
  tags: ['finance'],
  excerpt: 'Assessments are based on the budget divided by units.',
} as const;

describe('scoreArticleForQuery — ranking', () => {
  it('scores a literal title hit higher than an alias-only excerpt hit', () => {
    const literal = scoreArticleForQuery(article, expandQuery('assessments'));
    expect(literal).toBeGreaterThan(0);

    // "fees" only matches via alias and only in keywords/etc.
    const aliasOnly = scoreArticleForQuery(
      { ...article, title: 'unrelated', description: 'nothing here' },
      expandQuery('fees'),
    );
    expect(aliasOnly).toBeGreaterThan(0);
    expect(aliasOnly).toBeLessThan(literal);
  });

  it('returns 0 for a term that neither primary nor alias matches anywhere', () => {
    expect(
      scoreArticleForQuery(article, expandQuery('zorblax')),
    ).toBe(0);
  });

  it('matchesArticleQuery is true when score > 0', () => {
    expect(matchesArticleQuery(article, 'assessments')).toBe(true);
    expect(matchesArticleQuery(article, 'fees')).toBe(true);
    expect(matchesArticleQuery(article, 'zorblax')).toBe(false);
  });

  it('matches by slug (URL-style identifiers stay searchable)', () => {
    expect(matchesArticleQuery(article, 'assessments-calculated')).toBe(true);
    // Score should be at least the slug weight (80).
    expect(
      scoreArticleForQuery(
        { ...article, title: 'x', description: 'y', excerpt: 'z', keywords: [], tags: [], category: 'q' },
        expandQuery('assessments-calculated'),
      ),
    ).toBeGreaterThanOrEqual(80);
  });

  it('does not produce cross-element false positives on array fields', () => {
    // Joining ["pro", "active"] into "pro active" would let a search for
    // "o a" match. Array fields must be scored per-element so the
    // boundary between elements isn't searchable.
    const arr = {
      title: 'unrelated',
      description: 'unrelated',
      category: 'q',
      slug: 'unrelated',
      keywords: ['pro', 'active'],
      tags: ['pro', 'active'],
      excerpt: 'unrelated',
    };
    expect(matchesArticleQuery(arr, 'o a')).toBe(false);
    // But matching a whole element still works.
    expect(matchesArticleQuery(arr, 'pro')).toBe(true);
  });
});

describe('searchArticles — ranking + result cap', () => {
  it('returns alias-derived hits in the in-repo corpus (fees → assessments articles)', async () => {
    const results = await searchArticles('fees', 'cam');
    // The corpus has finance/paying-dues-and-assessments.mdx plus payments
    // articles; alias expansion should surface these.
    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map((a) => a.slug);
    expect(
      slugs.some((s) => s.includes('assessment') || s.includes('payment') || s.includes('dues')),
    ).toBe(true);
  });

  it('caps results at 50', async () => {
    // A super-broad query should not exceed the hard cap even if every
    // article matched.
    const broad = await searchArticles('the', 'cam');
    expect(broad.length).toBeLessThanOrEqual(50);
  });

  it('returns no results for an empty query', async () => {
    expect(await searchArticles('', 'cam')).toEqual([]);
  });
});
