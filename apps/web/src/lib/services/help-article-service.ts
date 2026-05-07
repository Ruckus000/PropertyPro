import * as fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import matter from 'gray-matter';
import type { CommunityFeatures } from '@propertypro/shared';

/**
 * Shape acceptable to feature-gate helpers.
 *
 * `CommunityFeatures` is a typed interface with named boolean properties
 * (`hasLeaseTracking`, `hasCompliance`, …) and no index signature, so it is
 * not directly assignable to `Record<string, boolean>`. The union here lets
 * callers pass either the typed flag object straight from
 * `getFeaturesForCommunity()` or a plain record (useful for tests).
 */
type FeatureFlagSource = CommunityFeatures | Readonly<Record<string, boolean>>;

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
  tags: string[];
  relatedArticles: string[];
  featured: boolean;
  excerpt?: string;
  filePath: string;
  contextPaths?: string[];
  statutes?: string[];
  featureGates?: string[];
  updatedAt?: string;
  readTimeMinutes?: number;
  contentHash: string;
}

export type ArticleMetadata = HelpArticleMetadata;

export interface HelpArticleSource {
  metadata: HelpArticleMetadata;
  rawContent: string;
}

export interface FeatureGateEvaluator {
  (gate: string): boolean;
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
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    relatedArticles: Array.isArray(data.relatedArticles)
      ? data.relatedArticles.map(String)
      : [],
    featured: Boolean(data.featured ?? false),
    excerpt: extractExcerpt(content),
    filePath,
    contextPaths: Array.isArray(data.contextPaths) ? data.contextPaths.map(String) : [],
    statutes: Array.isArray(data.statutes) ? data.statutes.map(String) : [],
    featureGates: Array.isArray(data.featureGates) ? data.featureGates.map(String) : [],
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    readTimeMinutes: Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
    contentHash: crypto.createHash('sha256').update(rawContent).digest('hex').slice(0, 16),
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

export function isArticleAvailableForFeatures(
  article: Pick<HelpArticleMetadata, 'featureGates'>,
  hasFeature: FeatureGateEvaluator,
): boolean {
  const gates = article.featureGates ?? [];
  if (!gates.length) {
    return true;
  }
  return gates.every((gate) => hasFeature(gate));
}

/**
 * Builds a FeatureGateEvaluator from a CommunityFeatures-shaped object.
 *
 * `featureGates` strings in MDX frontmatter map directly to keys on
 * `CommunityFeatures` (e.g. `hasLeaseTracking`). This helper lets callers
 * convert that flag object into the predicate `isArticleAvailableForFeatures`
 * expects, without leaking the cast at every call site.
 */
export function buildFeatureEvaluator(features: FeatureFlagSource): FeatureGateEvaluator {
  const record = features as Readonly<Record<string, boolean>>;
  return (gate) => Boolean(record[gate]);
}

/**
 * Filters a list of articles to those whose featureGates are all satisfied
 * by the given community feature flags. Articles without featureGates pass
 * through unchanged.
 */
export function filterArticlesByFeatures<T extends Pick<HelpArticleMetadata, 'featureGates'>>(
  articles: readonly T[],
  features: FeatureFlagSource,
): T[] {
  const hasFeature = buildFeatureEvaluator(features);
  return articles.filter((article) => isArticleAvailableForFeatures(article, hasFeature));
}

export function matchesArticleQuery(
  article: Pick<
    HelpArticleMetadata,
    'title' | 'description' | 'keywords' | 'category' | 'slug' | 'excerpt' | 'tags'
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
    ...(article.tags ?? []),
  ].some((value) => String(value).toLowerCase().includes(normalized));
}

export function getArticlesByTag(tag: string): HelpArticleMetadata[] {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  return getAllArticles().filter((article) =>
    article.tags.some((entry) => entry.toLowerCase() === normalized),
  );
}

export function getAllTags(): string[] {
  const tags = new Set<string>();
  for (const article of getAllArticles()) {
    for (const tag of article.tags) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort();
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
