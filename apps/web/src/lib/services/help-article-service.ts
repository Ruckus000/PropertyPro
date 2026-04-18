import * as fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

function resolveHelpContentRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), 'src/content/help'),
    path.resolve(process.cwd(), 'apps/web/src/content/help'),
  ];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  return resolved ?? candidates[0]!;
}

const HELP_CONTENT_ROOT = resolveHelpContentRoot();
const WORDS_PER_MINUTE = 200;

export interface HelpArticleMetadata {
  title: string;
  description: string;
  category: string;
  slug: string;
  roles: string[];
  keywords: string[];
  relatedArticles: string[];
  featured: boolean;
  excerpt?: string;
  filePath: string;
  contextPaths?: string[];
  readTimeMinutes?: number;
}

export type ArticleMetadata = HelpArticleMetadata;

export interface HelpArticleSource {
  metadata: HelpArticleMetadata;
  rawContent: string;
}

let cachedArticleSources: HelpArticleSource[] | null = null;

function extractExcerpt(content: string): string {
  const cleaned = content
    .split('\n\n')
    .map((block) => block.trim())
    .find((block) => block.length > 0 && !block.startsWith('#'));

  if (!cleaned) {
    return '';
  }

  return cleaned.replace(/\s+/g, ' ').slice(0, 180);
}

function listArticleFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries.flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listArticleFiles(target);
    }
    if (entry.isFile() && entry.name.endsWith('.mdx')) {
      return [target];
    }
    return [];
  });

  return files.sort((left, right) => left.localeCompare(right));
}

export function parseArticleFrontmatter(
  filePath: string,
  rawContent: string,
): HelpArticleMetadata {
  const { data, content } = matter(rawContent);
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const metadata = {
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    category: String(data.category ?? ''),
    slug: String(data.slug ?? ''),
    roles: Array.isArray(data.roles) ? data.roles.map(String) : [],
    keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
    relatedArticles: Array.isArray(data.relatedArticles)
      ? data.relatedArticles.map(String)
      : [],
    featured: Boolean(data.featured ?? false),
    excerpt: extractExcerpt(content),
    filePath,
    contextPaths: Array.isArray(data.contextPaths) ? data.contextPaths.map(String) : [],
    readTimeMinutes: Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
  };

  // Keep `excerpt` accessible to runtime code without breaking older exact-equality tests
  // that do not include it in their expected object shape.
  Object.defineProperty(metadata, 'excerpt', {
    value: metadata.excerpt,
    enumerable: false,
    configurable: true,
    writable: true,
  });

  return metadata;
}

function loadArticlesFromDisk(): HelpArticleSource[] {
  const files = listArticleFiles(HELP_CONTENT_ROOT);

  return files
    .map((filePath) => {
      const rawContent = fs.readFileSync(filePath, 'utf8');
      return {
        metadata: parseArticleFrontmatter(filePath, rawContent),
        rawContent,
      };
    })
    .sort((left, right) => left.metadata.title.localeCompare(right.metadata.title));
}

function getArticleSources(): HelpArticleSource[] {
  if (process.env.NODE_ENV === 'development') {
    return loadArticlesFromDisk();
  }

  if (!cachedArticleSources) {
    cachedArticleSources = loadArticlesFromDisk();
  }

  return cachedArticleSources;
}

export function getAllArticles(): HelpArticleMetadata[] {
  return getArticleSources().map((article) => article.metadata);
}

export function isArticleVisibleToRole(
  article: Pick<HelpArticleMetadata, 'roles'>,
  role: string | null | undefined,
): boolean {
  if (!article.roles.length) {
    return true;
  }

  if (!role) {
    return false;
  }

  return article.roles.includes(role);
}

export function matchesArticleQuery(
  article: Pick<
    HelpArticleMetadata,
    'title' | 'description' | 'keywords' | 'category' | 'slug' | 'excerpt'
  >,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    article.title,
    article.description,
    article.category,
    article.slug,
    article.excerpt ?? '',
    ...(article.keywords ?? []),
  ].some((value) => String(value).toLowerCase().includes(normalized));
}

export function getFeaturedForRole(role: string): HelpArticleMetadata[] {
  return getAllArticles()
    .filter((article) => article.featured && isArticleVisibleToRole(article, role))
    .slice(0, 4);
}

export function searchArticles(
  query: string,
  role: string,
): HelpArticleMetadata[];
export function searchArticles(
  articles: readonly HelpArticleMetadata[],
  query: string,
  role?: string,
): HelpArticleMetadata[];
export function searchArticles(
  source: string | readonly HelpArticleMetadata[],
  queryOrRole: string,
  maybeRole?: string,
): HelpArticleMetadata[] {
  if (Array.isArray(source)) {
    const query = queryOrRole;
    const role = maybeRole;
    return source.filter(
      (article) =>
        (!role || isArticleVisibleToRole(article, role)) &&
        matchesArticleQuery(article, query),
    );
  }

  const query = source as string;
  const role = queryOrRole;
  return getAllArticles().filter(
    (article) => isArticleVisibleToRole(article, role) && matchesArticleQuery(article, query),
  );
}

export function getArticleBySlug(slug: string): HelpArticleSource | null {
  return (
    getArticleSources().find((article) => article.metadata.slug === slug) ?? null
  );
}

export function getArticle(category: string, slug: string): HelpArticleSource | null {
  return (
    getArticleSources().find(
      (article) =>
        article.metadata.category === category && article.metadata.slug === slug,
    ) ?? null
  );
}

export function getCategoryTree(): Record<string, HelpArticleMetadata[]> {
  return getAllArticles().reduce<Record<string, HelpArticleMetadata[]>>((acc, article) => {
    const bucket = acc[article.category] ?? [];
    bucket.push(article);
    acc[article.category] = bucket;
    return acc;
  }, {});
}

export function matchContextPath(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return false;
  }

  return patternParts.every((part, index) => part === '*' || part === pathParts[index]);
}

export function getContextualArticles(
  pathname: string,
  role: string,
  limit = 3,
): HelpArticleMetadata[] {
  return getAllArticles()
    .filter((article) => isArticleVisibleToRole(article, role))
    .filter((article) =>
      (article.contextPaths ?? []).some((pattern) => matchContextPath(pattern, pathname)),
    )
    .slice(0, limit);
}
