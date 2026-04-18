import { describe, expect, it } from 'vitest';
import {
  getAllArticles,
  getFeaturedForRole,
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
});
