/**
 * Compile a help article for a reader. The full-page route renders the
 * element tree; the modal API renders cached, sanitized HTML. Both go through
 * `createHelpMdxComponents`, so shots, `<OnlyFor>` and `help:` links resolve
 * identically.
 */
import { unstable_cache } from 'next/cache';
import { compileMDX } from 'next-mdx-remote/rsc';
import {
  createHelpMdxComponents,
  type HelpRenderContext,
  type TocItem,
} from '@/components/help/mdx-components';
import { helpArticleCacheKey } from '@/lib/help/render-version';
import { sanitizeHelpHtml } from '@/lib/help/sanitize-help-html';
import { extractTableOfContents } from '@/lib/help/toc';
import {
  findArticleForReader,
  type HelpReaderView,
  type HelpArticleSource,
} from '@/lib/services/help-article-service';

type ReaderView = HelpReaderView;

export function helpArticleBase(article: { section: string; category: string; slug: string }): string {
  return `${article.section}/${article.category}/${article.slug}`;
}

/**
 * `query` is appended to resolved `help:` links (e.g. `communityId=2`). The
 * modal passes none: its links are intercepted and opened in place.
 */
export function buildHelpRenderContext(
  source: HelpArticleSource,
  reader: ReaderView,
  query?: string,
): HelpRenderContext {
  return {
    articleBase: helpArticleBase(source.metadata),
    communityType: reader.communityType,
    resolveLink: (slug) => {
      const target = findArticleForReader(slug, reader);
      if (!target) return null;
      const path = `/help/${target.category}/${target.slug}`;
      return { href: query ? `${path}?${query}` : path, category: target.category, slug: target.slug };
    },
  };
}

export async function compileHelpArticle(
  source: HelpArticleSource,
  reader: ReaderView,
  query?: string,
) {
  const { content } = await compileMDX({
    source: source.rawContent,
    components: createHelpMdxComponents(buildHelpRenderContext(source, reader, query)),
    options: { parseFrontmatter: true },
  });
  return content;
}

export interface CompiledHelpArticleHtml {
  html: string;
  toc: TocItem[];
}

/**
 * Sanitized HTML for the modal, cached per (section, article, content hash,
 * community type, render version). Rendering on the server keeps the modal
 * compatible with production CSP (no client-side MDX eval).
 */
export async function getCompiledHelpArticleHtml(
  source: HelpArticleSource,
  reader: ReaderView,
): Promise<CompiledHelpArticleHtml> {
  const { metadata } = source;
  const key = helpArticleCacheKey(
    metadata.section,
    metadata.category,
    metadata.slug,
    metadata.contentHash,
    reader.communityType,
  );
  return unstable_cache(
    async (): Promise<CompiledHelpArticleHtml> => {
      // compileMDX (RSC-native), NOT the client <MDXRemote/>: in a route
      // handler React resolves under the `react-server` condition, where
      // <MDXRemote/>'s useState throws during renderToStaticMarkup.
      const content = await compileHelpArticle(source, reader);
      const { renderToStaticMarkup } = await import('react-dom/server');
      return {
        html: sanitizeHelpHtml(renderToStaticMarkup(content)),
        toc: extractTableOfContents(source.rawContent),
      };
    },
    ['help-article', key],
    { tags: ['help-article', key] },
  )();
}
