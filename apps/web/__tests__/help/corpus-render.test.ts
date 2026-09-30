/**
 * Every help article compiles and renders, for every community type it
 * applies to, through the same path the Help Center and modal use. An MDX
 * syntax slip (an unescaped `{`, an unclosed <Step>) otherwise only surfaces
 * as a broken page in production.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { compileHelpArticle } from '@/lib/help/render-article';
import { getAllArticles, getArticleForReader } from '@/lib/services/help-article-service';

const cases = getAllArticles().flatMap((article) =>
  article.communityTypes.map((communityType) => [
    `${article.section}/${article.category}/${article.slug} (${communityType})`,
    article,
    communityType,
  ] as const),
);

describe('help corpus renders', () => {
  it.each(cases)('%s', async (_label, article, communityType) => {
    // Drafts are hidden from readers; render them directly so they stay valid.
    const reader = { section: article.section, communityType, features: getFeaturesForCommunity(communityType) };
    const source =
      getArticleForReader(article.category, article.slug, reader) ??
      ({ metadata: article, rawContent: (await import('node:fs')).readFileSync(article.filePath, 'utf8') });
    const html = renderToStaticMarkup(await compileHelpArticle(source, reader, 'communityId=1'));

    expect(html.length).toBeGreaterThan(0);
    // No raw MDX leaked through as text.
    expect(html).not.toMatch(/&lt;(Step|StepByStep|Callout|Figure|OnlyFor)\b/);
    expect(html).not.toContain('help:');
  });
});
