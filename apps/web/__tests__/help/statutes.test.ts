import { describe, expect, it } from 'vitest';
import {
  findArticlesByStatute,
  listAllStatutes,
} from '@/lib/services/help-article-service';

describe('listAllStatutes', () => {
  it('returns at least one statute reference from the in-repo corpus', () => {
    const statutes = listAllStatutes();
    expect(statutes.length).toBeGreaterThan(0);
  });

  it('sorts by count desc then ref asc', () => {
    const statutes = listAllStatutes();
    for (let i = 1; i < statutes.length; i++) {
      const prev = statutes[i - 1]!;
      const curr = statutes[i]!;
      if (curr.count > prev.count) {
        throw new Error(
          `expected count desc but ${curr.ref} (${curr.count}) follows ${prev.ref} (${prev.count})`,
        );
      }
      if (curr.count === prev.count) {
        expect(curr.ref.localeCompare(prev.ref)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('includes both §-statute and HB-bill formats', () => {
    const refs = listAllStatutes().map((s) => s.ref);
    expect(refs.some((r) => r.startsWith('§'))).toBe(true);
    expect(refs.some((r) => /^HB\s*\d+/i.test(r))).toBe(true);
  });
});

describe('findArticlesByStatute', () => {
  it('returns the compliance articles tagged with §718.111(12)(g)', () => {
    const articles = findArticlesByStatute('§718.111(12)(g)');
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.every((a) => (a.statutes ?? []).includes('§718.111(12)(g)'))).toBe(true);
  });

  it('returns the violations articles tagged with HB 1203', () => {
    const articles = findArticlesByStatute('HB 1203');
    expect(articles.length).toBeGreaterThan(0);
    expect(
      articles.every((a) => (a.statutes ?? []).map((s) => s.toLowerCase()).includes('hb 1203')),
    ).toBe(true);
  });

  it('matches case-insensitively', () => {
    const lower = findArticlesByStatute('hb 1203');
    const upper = findArticlesByStatute('HB 1203');
    expect(lower.map((a) => a.slug).sort()).toEqual(upper.map((a) => a.slug).sort());
  });

  it('returns empty for an unknown reference', () => {
    expect(findArticlesByStatute('§999.999')).toEqual([]);
    expect(findArticlesByStatute('')).toEqual([]);
  });
});
