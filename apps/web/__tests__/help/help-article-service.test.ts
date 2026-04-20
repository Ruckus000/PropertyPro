import { describe, expect, it } from 'vitest';
import {
  getAllArticles,
  getAllTags,
  getArticlesByTag,
  getFeaturedForRole,
  isArticleAvailableForFeatures,
  matchesArticleQuery,
  parseArticleFrontmatter,
  searchArticles,
} from '../../src/lib/services/help-article-service';

describe('help article service', () => {
  it('parses valid frontmatter into article metadata', () => {
    const metadata = parseArticleFrontmatter(
      '/tmp/example.mdx',
      `---
title: "Example"
description: "Example description"
category: "example"
slug: "example"
roles:
  - owner
keywords:
  - sample
relatedArticles: []
featured: true
---

This is the example body.
`,
    );

    expect(metadata).toMatchObject({
      title: 'Example',
      category: 'example',
      slug: 'example',
      featured: true,
      roles: ['owner'],
    });
    expect(metadata.excerpt).toContain('This is the example body.');
  });

  it('loads the in-repo help articles', async () => {
    const articles = await getAllArticles();

    expect(articles.length).toBeGreaterThanOrEqual(5);
    expect(articles.some((article) => article.slug === 'welcome-to-propertypro')).toBe(true);
  });

  it('returns featured articles filtered by role', async () => {
    const tenantArticles = await getFeaturedForRole('tenant');
    const managerArticles = await getFeaturedForRole('manager');

    expect(tenantArticles.length).toBeGreaterThan(0);
    expect(managerArticles.some((article) => article.slug === 'reviewing-the-compliance-dashboard')).toBe(true);
    expect(tenantArticles.some((article) => article.slug === 'reviewing-the-compliance-dashboard')).toBe(false);
  });

  it('searches by title and keywords', async () => {
    const results = await searchArticles('maintenance', 'tenant');

    expect(results.some((article) => article.slug === 'submitting-a-maintenance-request')).toBe(true);
    expect(matchesArticleQuery(results[0]!, 'maintenance')).toBe(true);
  });

  it('parses tags, updatedAt, statutes, and featureGates from frontmatter', () => {
    const metadata = parseArticleFrontmatter(
      '/tmp/example.mdx',
      `---
title: "Statute Example"
description: "demo"
category: "compliance"
slug: "statute-example"
roles: []
keywords: []
relatedArticles: []
featured: false
tags:
  - florida
  - compliance
updatedAt: "2026-04-01"
statutes:
  - "§718.111(12)(g)"
featureGates:
  - hasCompliance
---

## Heading
Body.
`,
    );

    expect(metadata.tags).toEqual(['florida', 'compliance']);
    expect(metadata.updatedAt).toBe('2026-04-01');
    expect(metadata.statutes).toEqual(['§718.111(12)(g)']);
    expect(metadata.featureGates).toEqual(['hasCompliance']);
    expect(metadata.contentHash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('defaults tags/statutes/featureGates to empty arrays when missing', () => {
    const metadata = parseArticleFrontmatter(
      '/tmp/example.mdx',
      `---
title: "Minimal"
description: "demo"
category: "test"
slug: "minimal"
roles: []
keywords: []
relatedArticles: []
featured: false
---

Body.
`,
    );

    expect(metadata.tags).toEqual([]);
    expect(metadata.statutes).toEqual([]);
    expect(metadata.featureGates).toEqual([]);
    expect(metadata.updatedAt).toBeUndefined();
  });

  it('filters articles by feature gates', () => {
    const article = {
      featureGates: ['hasLeaseTracking'],
    };
    expect(isArticleAvailableForFeatures(article, () => true)).toBe(true);
    expect(isArticleAvailableForFeatures(article, () => false)).toBe(false);
    expect(isArticleAvailableForFeatures({ featureGates: [] }, () => false)).toBe(true);
    expect(isArticleAvailableForFeatures({ featureGates: undefined }, () => false)).toBe(true);
  });

  it('returns all unique tags across articles', () => {
    const tags = getAllTags();
    expect(Array.isArray(tags)).toBe(true);
    // Even if no article has tags today, the call should not throw and should return unique values.
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('looks up articles by tag', () => {
    const all = getAllArticles();
    const firstTagged = all.find((article) => article.tags.length > 0);
    if (!firstTagged) return;
    const tag = firstTagged.tags[0]!;
    const matches = getArticlesByTag(tag);
    expect(matches.some((article) => article.slug === firstTagged.slug)).toBe(true);
  });
});
