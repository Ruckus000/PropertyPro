import { describe, expect, it } from 'vitest';
import {
  getAllResources,
  getResourceBySlug,
  getResourceSlugs,
  parseResourceFrontmatter,
} from '@/lib/services/resource-article-service';

const VALID = `---
title: 'A title'
description: 'A description.'
slug: 'a-slug'
publishedAt: '2026-01-01'
updatedAt: '2026-02-01'
statutes:
  - '§718.111(12)(g)'
---

First real paragraph, which becomes the excerpt.

## A heading
`;

describe('parseResourceFrontmatter', () => {
  it('parses valid frontmatter and derives excerpt and read time', () => {
    const meta = parseResourceFrontmatter('/content/resources/a-slug.mdx', VALID);

    expect(meta.title).toBe('A title');
    expect(meta.statutes).toEqual(['§718.111(12)(g)']);
    expect(meta.excerpt).toBe('First real paragraph, which becomes the excerpt.');
    expect(meta.readTimeMinutes).toBeGreaterThanOrEqual(1);
    expect(meta.draft).toBe(false);
  });

  it('rejects a slug that disagrees with the filename', () => {
    // The URL comes from the frontmatter slug, so a mismatch means the file an
    // author edits is not the page they see.
    expect(() =>
      parseResourceFrontmatter('/content/resources/different-name.mdx', VALID),
    ).toThrow(/slug mismatch/i);
  });

  it('rejects a description too long to survive as a meta description', () => {
    const longDescription = 'x'.repeat(161);
    const source = VALID.replace("'A description.'", `'${longDescription}'`);

    expect(() => parseResourceFrontmatter('/content/resources/a-slug.mdx', source)).toThrow(
      /description/i,
    );
  });

  it('rejects a malformed statute citation', () => {
    const source = VALID.replace("'§718.111(12)(g)'", "'Chapter 718'");

    expect(() => parseResourceFrontmatter('/content/resources/a-slug.mdx', source)).toThrow(
      /statutes/i,
    );
  });

  it('rejects unknown frontmatter keys rather than silently dropping them', () => {
    const source = VALID.replace("updatedAt: '2026-02-01'", "updatedAt: '2026-02-01'\nfeatured: true");

    expect(() => parseResourceFrontmatter('/content/resources/a-slug.mdx', source)).toThrow(
      /frontmatter/i,
    );
  });
});

describe('resource corpus on disk', () => {
  it('loads every shipped article without a validation error', () => {
    // The loader throws on bad frontmatter, a slug/filename mismatch, or a
    // duplicate slug — so simply reaching an assertion means the corpus is valid.
    const articles = getAllResources();
    expect(articles.length).toBeGreaterThan(0);
  });

  it('orders articles newest first', () => {
    const dates = getAllResources().map((article) => article.publishedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('resolves each listed slug back to a source', () => {
    for (const slug of getResourceSlugs()) {
      expect(getResourceBySlug(slug)?.metadata.slug).toBe(slug);
    }
  });

  it('returns null for an unknown slug', () => {
    expect(getResourceBySlug('no-such-article')).toBeNull();
  });
});
