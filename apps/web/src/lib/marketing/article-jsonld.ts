/**
 * schema.org JSON-LD for public marketing articles.
 *
 * The point of `/resources` is organic discovery, and an `Article` node is what
 * lets a search engine treat a page as a dated, authored piece rather than an
 * anonymous URL. Kept as plain data so the page can `JSON.stringify` it into a
 * script tag — no serialisation surprises, nothing executable.
 */
import type { ResourceMetadata } from '@/lib/services/resource-article-service';

export const PUBLISHER_NAME = 'PropertyPro Florida';

export function buildArticleJsonLd(
  metadata: ResourceMetadata,
  baseUrl: string,
): Record<string, unknown> {
  const url = `${baseUrl}/resources/${metadata.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: metadata.title,
    description: metadata.description,
    datePublished: metadata.publishedAt,
    dateModified: metadata.updatedAt,
    ...(metadata.keywords.length > 0 ? { keywords: metadata.keywords.join(', ') } : {}),
    author: { '@type': 'Organization', name: PUBLISHER_NAME },
    publisher: { '@type': 'Organization', name: PUBLISHER_NAME },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
  };
}
