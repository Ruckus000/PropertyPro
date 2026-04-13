/**
 * Help Article Service — reads MDX articles from the filesystem,
 * caches metadata, and provides search/filter/contextual lookup.
 *
 * Platform articles are MDX files in apps/web/src/content/help/.
 * Frontmatter parsed by gray-matter. Content compiled by next-mdx-remote
 * at render time in page components (not here).
 *
 * Cache: module-level singleton, lazy-initialized.
 * In dev mode: cache bypassed, re-reads from disk every call.
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArticleMetadata {
  title: string;
  description: string;
  category: string;
  slug: string;
  roles: string[];
  keywords: string[];
  relatedArticles: string[];
  featured: boolean;
  contextPaths: string[];
  readTimeMinutes: number;
  filePath: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'help');
const WORDS_PER_MINUTE = 200;

// ---------------------------------------------------------------------------
// Frontmatter parsing (exported for testing)
// ---------------------------------------------------------------------------

export function parseArticleFrontmatter(
  filePath: string,
  rawContent: string,
): ArticleMetadata {
  const { data, content } = matter(rawContent);
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    title: data.title ?? '',
    description: data.description ?? '',
    category: data.category ?? '',
    slug: data.slug ?? '',
    roles: data.roles ?? [],
    keywords: data.keywords ?? [],
    relatedArticles: data.relatedArticles ?? [],
    featured: data.featured ?? false,
    contextPaths: data.contextPaths ?? [],
    readTimeMinutes: Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
    filePath,
  };
}

// ---------------------------------------------------------------------------
// Context path matching (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Match a context path pattern against a URL pathname.
 * Supports single-segment wildcards (e.g. "/communities/STAR/compliance"
 * matches "/communities/123/compliance" where STAR represents the wildcard).
 */
export function matchContextPath(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) return false;

  return patternParts.every(
    (part, i) => part === '*' || part === pathParts[i],
  );
}

// ---------------------------------------------------------------------------
// Filesystem scanning
// ---------------------------------------------------------------------------

function scanArticles(): ArticleMetadata[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const categories = fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  const articles: ArticleMetadata[] = [];

  for (const catDir of categories) {
    const catPath = path.join(CONTENT_DIR, catDir.name);
    const files = fs.readdirSync(catPath).filter((f) => f.endsWith('.mdx'));

    for (const file of files) {
      const articleFilePath = path.join(catPath, file);
      const raw = fs.readFileSync(articleFilePath, 'utf-8');
      articles.push(parseArticleFrontmatter(articleFilePath, raw));
    }
  }

  return articles;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let articlesCache: ArticleMetadata[] | null = null;

function getArticlesFromCache(): ArticleMetadata[] {
  if (process.env.NODE_ENV === 'development') {
    return scanArticles();
  }
  if (!articlesCache) {
    articlesCache = scanArticles();
  }
  return articlesCache;
}

/** Reset cache — useful for testing. */
export function resetArticleCache(): void {
  articlesCache = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get all article metadata (cached). */
export function getAllArticles(): ArticleMetadata[] {
  return getArticlesFromCache();
}

/** Get a single article's raw MDX content + metadata by slug. */
export function getArticleBySlug(
  slug: string,
): { metadata: ArticleMetadata; rawContent: string } | null {
  const all = getAllArticles();
  const meta = all.find((a) => a.slug === slug);
  if (!meta) return null;

  const raw = fs.readFileSync(meta.filePath, 'utf-8');
  const { content } = matter(raw);
  return { metadata: meta, rawContent: content };
}

/** Get articles filtered and sorted by role (role-matched first). */
export function getArticlesByRole(
  role: string | null,
): ArticleMetadata[] {
  const all = getAllArticles();
  if (!role) return all;

  const matched = all.filter((a) => a.roles.length === 0 || a.roles.includes(role));
  const unmatched = all.filter((a) => a.roles.length > 0 && !a.roles.includes(role));
  return [...matched, ...unmatched];
}

/** Get featured articles filtered by role, max 4. */
export function getFeaturedForRole(role: string | null): ArticleMetadata[] {
  const all = getAllArticles();
  return all
    .filter((a) => a.featured)
    .filter((a) => a.roles.length === 0 || (role && a.roles.includes(role)))
    .slice(0, 4);
}

/** Search articles by query against title, description, and keywords. */
export function searchArticles(
  articles: ArticleMetadata[],
  query: string,
): ArticleMetadata[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  return articles.filter((article) => {
    const haystack = [
      article.title,
      article.description,
      ...article.keywords,
    ].join(' ').toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}

/** Get category tree: articles grouped by category name. */
export function getCategoryTree(): Record<string, ArticleMetadata[]> {
  const all = getAllArticles();
  const tree: Record<string, ArticleMetadata[]> = {};
  for (const article of all) {
    const cat = article.category || 'uncategorized';
    if (!tree[cat]) tree[cat] = [];
    tree[cat].push(article);
  }
  return tree;
}

/** Get articles relevant to a given route path. */
export function getContextualArticles(
  pathname: string,
  role: string | null,
  limit = 3,
): ArticleMetadata[] {
  const all = getAllArticles();
  return all
    .filter((a) => a.contextPaths.some((pattern) => matchContextPath(pattern, pathname)))
    .filter((a) => a.roles.length === 0 || (role && a.roles.includes(role)))
    .slice(0, limit);
}
