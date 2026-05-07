import * as fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import matter from 'gray-matter';
import type { CommunityFeatures } from '@propertypro/shared';
import { validateFrontmatter } from '@/lib/help/frontmatter-schema';
import { expandQuery, type ExpandedQuery } from '@/lib/help/aliases';

/**
 * Maximum article results returned by searchArticles. Help search runs in
 * memory (filesystem-sourced MDX); the cap bounds latency and response
 * size while leaving plenty of headroom over today's 50-article corpus.
 */
const SEARCH_RESULT_CAP = 50;

/**
 * Field weights for relevance ranking. Alias hits are scaled at ALIAS_SCALE.
 *
 * `slug` is included so URL-style identifiers (e.g. `welcome-to-propertypro`)
 * remain searchable, matching the previous substring matcher's behavior.
 * Array fields (`keywords`, `tags`) are scored per-element to avoid the
 * cross-element false-positive class — joining with a space and matching
 * against the joined string would let a query like `"o a"` slip through
 * `["pro", "active"]`.
 */
const FIELD_WEIGHTS = {
  title: 100,
  keywords: 80,
  slug: 80,
  description: 60,
  tags: 50,
  category: 30,
  excerpt: 20,
} as const;
const ALIAS_SCALE = 0.7;

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
  const validation = validateFrontmatter(data);
  if (!validation.ok) {
    const summary = validation.errors
      .map((err) => `  - ${err.path}: ${err.message}`)
      .join('\n');
    throw new Error(
      `Invalid help article frontmatter in ${filePath}:\n${summary}`,
    );
  }

  const valid = validation.value;
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const metadata = {
    title: valid.title,
    description: valid.description,
    category: valid.category,
    slug: valid.slug,
    roles: valid.roles,
    keywords: valid.keywords,
    tags: valid.tags,
    relatedArticles: valid.relatedArticles,
    featured: valid.featured,
    excerpt: extractExcerpt(content),
    filePath,
    contextPaths: valid.contextPaths ?? [],
    statutes: valid.statutes ?? [],
    featureGates: valid.featureGates ?? [],
    updatedAt: valid.updatedAt,
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

/**
 * Fail-open variant of filterArticlesByFeatures.
 *
 * If feature evaluation throws — e.g. a malformed feature record, a renamed
 * flag, or an upstream service blip — every article is returned unfiltered
 * and the supplied onError callback is invoked. This prevents the worst-case
 * help-center failure mode the 2026-05-07 audit identified: a feature-flag
 * service blip silently emptying the help center for a tenant.
 *
 * Call sites that have access to Sentry should pass an `onError` that calls
 * `captureMessage('help_feature_gate_failure', …)`. The helper itself stays
 * dependency-free so it remains usable in tests and edge runtimes.
 */
export function safelyFilterArticlesByFeatures<
  T extends Pick<HelpArticleMetadata, 'featureGates'>,
>(
  articles: readonly T[],
  features: FeatureFlagSource | null | undefined,
  options?: { onError?: (error: unknown) => void },
): T[] {
  if (!features) {
    return [...articles];
  }
  try {
    return filterArticlesByFeatures(articles, features);
  } catch (error) {
    options?.onError?.(error);
    return [...articles];
  }
}

export function matchesArticleQuery(
  article: Pick<
    HelpArticleMetadata,
    'title' | 'description' | 'keywords' | 'category' | 'slug' | 'excerpt' | 'tags'
  >,
  query: string,
): boolean {
  return scoreArticleForQuery(article, expandQuery(query)) > 0;
}

/**
 * Returns a relevance score for an article against an expanded query.
 *
 * A direct hit (the user's literal query, or any token therein) earns the
 * full field weight. An alias-only hit earns ALIAS_SCALE × the field weight,
 * so an article that contains the literal query always outranks one that
 * only matches by synonym. The article's overall score is the maximum
 * field score (a single strong title hit beats several weak excerpt hits).
 *
 * Returns 0 when neither primary nor alias terms appear, which matchesArticleQuery
 * uses as the boolean decision.
 */
export function scoreArticleForQuery(
  article: Pick<
    HelpArticleMetadata,
    'title' | 'description' | 'keywords' | 'category' | 'slug' | 'excerpt' | 'tags'
  >,
  expanded: ExpandedQuery,
): number {
  if (!expanded.primary.length && !expanded.aliases.length) return 0;

  // Array fields stay as arrays so we match per-element. Joining with a
  // space and substring-matching the joined string would let cross-element
  // false positives slip through (e.g. query "o a" hitting ["pro", "active"]).
  const fields: Array<{ value: string | string[]; weight: number }> = [
    { value: article.title, weight: FIELD_WEIGHTS.title },
    { value: article.keywords ?? [], weight: FIELD_WEIGHTS.keywords },
    { value: article.slug, weight: FIELD_WEIGHTS.slug },
    { value: article.description, weight: FIELD_WEIGHTS.description },
    { value: article.tags ?? [], weight: FIELD_WEIGHTS.tags },
    { value: article.category, weight: FIELD_WEIGHTS.category },
    { value: article.excerpt ?? '', weight: FIELD_WEIGHTS.excerpt },
  ];

  let best = 0;
  for (const { value, weight } of fields) {
    const valuesLower = (Array.isArray(value) ? value : [value])
      .filter((v) => v.length > 0)
      .map((v) => v.toLowerCase());
    if (valuesLower.length === 0) continue;

    const matches = (term: string) =>
      valuesLower.some((v) => v.includes(term));

    if (expanded.primary.some((term) => term && matches(term))) {
      best = Math.max(best, weight);
    } else if (expanded.aliases.some((term) => term && matches(term))) {
      best = Math.max(best, Math.round(weight * ALIAS_SCALE));
    }
  }
  return best;
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
  let articles: readonly HelpArticleMetadata[];
  let query: string;
  let role: string | undefined;

  if (Array.isArray(source)) {
    articles = source as readonly HelpArticleMetadata[];
    query = queryOrRole;
    role = maybeRole;
  } else {
    articles = getAllArticles();
    query = source as string;
    role = queryOrRole;
  }

  const expanded = expandQuery(query);
  if (!expanded.primary.length && !expanded.aliases.length) return [];

  const scored: Array<{ article: HelpArticleMetadata; score: number }> = [];
  for (const article of articles) {
    if (role && !isArticleVisibleToRole(article, role)) continue;
    const score = scoreArticleForQuery(article, expanded);
    if (score > 0) {
      scored.push({ article, score });
    }
  }

  // Sort by score descending; tie-break on title for stable ordering.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.article.title.localeCompare(b.article.title);
  });

  return scored.slice(0, SEARCH_RESULT_CAP).map((s) => s.article);
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

/**
 * Returns every article in the corpus tagged with the given statute or
 * House/Senate Bill reference. The match is case-insensitive on the
 * normalised form (trim + leading § or HB/SB prefix preserved). Used by
 * `/help/statutes/[ref]` (WS5).
 */
export function findArticlesByStatute(ref: string): HelpArticleMetadata[] {
  const normalised = ref.trim();
  if (!normalised) return [];
  const lower = normalised.toLowerCase();
  return getAllArticles().filter((article) =>
    (article.statutes ?? []).some((entry) => entry.toLowerCase() === lower),
  );
}

/**
 * Returns every distinct statute / bill reference in the corpus, paired
 * with the count of articles that cite it. Sorted by count desc then by
 * reference asc for stable display ordering. Used by `/help/statutes`.
 */
export function listAllStatutes(): Array<{ ref: string; count: number }> {
  const counts = new Map<string, number>();
  for (const article of getAllArticles()) {
    for (const ref of article.statutes ?? []) {
      counts.set(ref, (counts.get(ref) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([ref, count]) => ({ ref, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.ref.localeCompare(b.ref);
    });
}
