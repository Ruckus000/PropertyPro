/**
 * Marketing resource-article loader.
 *
 * Backs the public `/resources` surface. Mirrors the mechanism of
 * `help-article-service.ts` — gray-matter + a Zod frontmatter schema + an fs
 * walk — but NOT its shape: resources are public, flat, and ungated, so there is
 * no category tree, no role filter and no feature-gate evaluation.
 *
 * See docs/gtm/03-LAUNCH-READINESS.md item B2 for why this exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import {
  validateResourceFrontmatter,
  type ResourceFrontmatter,
} from '@/lib/resources/frontmatter-schema';

/**
 * `process.cwd()` follows the invocation, not the package: `next build` runs
 * from `apps/web` while a root-invoked `pnpm test` runs from the repo root.
 * Probing both is why `resolveHelpContentRoot()` does the same thing.
 */
function resolveResourceContentRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), 'src/content/resources'),
    path.resolve(process.cwd(), 'apps/web/src/content/resources'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]!;
}

const WORDS_PER_MINUTE = 200;

export interface ResourceMetadata extends ResourceFrontmatter {
  excerpt: string;
  readTimeMinutes: number;
  filePath: string;
}

export interface ResourceSource {
  metadata: ResourceMetadata;
  rawContent: string;
}

let cachedSources: ResourceSource[] | null = null;

function extractExcerpt(content: string): string {
  const firstProse = content
    .split('\n\n')
    .map((block) => block.trim())
    .find(
      (block) =>
        block.length > 0 &&
        !block.startsWith('#') &&
        // Skip JSX component blocks — a `<StatuteCallout>` opener is not a
        // sentence anyone wants to read on a listing card.
        !block.startsWith('<'),
    );

  if (!firstProse) return '';
  return firstProse.replace(/\s+/g, ' ').slice(0, 180);
}

/**
 * Word count for read time, with JSX tags stripped.
 *
 * The help service counts raw MDX including component markup, which inflates
 * the estimate on component-heavy articles. Cheap to do better here.
 */
function countWords(content: string): number {
  return content
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

export function parseResourceFrontmatter(
  filePath: string,
  rawContent: string,
): ResourceMetadata {
  const { data, content } = matter(rawContent);
  const validation = validateResourceFrontmatter(data);
  if (!validation.ok) {
    const summary = validation.errors
      .map((err) => `  - ${err.path}: ${err.message}`)
      .join('\n');
    throw new Error(`Invalid resource article frontmatter in ${filePath}:\n${summary}`);
  }

  const expectedSlug = path.basename(filePath, '.mdx');
  if (validation.value.slug !== expectedSlug) {
    throw new Error(
      `Resource article slug mismatch in ${filePath}: frontmatter says "${validation.value.slug}" but the filename says "${expectedSlug}". The URL is built from the frontmatter slug, so a mismatch means the file you edit is not the page you see.`,
    );
  }

  return {
    ...validation.value,
    excerpt: extractExcerpt(content),
    readTimeMinutes: Math.max(1, Math.ceil(countWords(content) / WORDS_PER_MINUTE)),
    filePath,
  };
}

function loadFromDisk(): ResourceSource[] {
  const root = resolveResourceContentRoot();
  if (!fs.existsSync(root)) return [];

  const files = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mdx'))
    .map((entry) => path.join(root, entry.name))
    .sort((left, right) => left.localeCompare(right));

  const sources = files.map((filePath) => {
    const rawContent = fs.readFileSync(filePath, 'utf8');
    return { metadata: parseResourceFrontmatter(filePath, rawContent), rawContent };
  });

  // The corpus is flat, so unlike help articles nothing disambiguates two files
  // claiming the same slug — one would silently shadow the other. Fail the build.
  const seen = new Map<string, string>();
  for (const source of sources) {
    const existing = seen.get(source.metadata.slug);
    if (existing) {
      throw new Error(
        `Duplicate resource slug "${source.metadata.slug}" in ${source.metadata.filePath} and ${existing}.`,
      );
    }
    seen.set(source.metadata.slug, source.metadata.filePath);
  }

  return sources;
}

function getSources(): ResourceSource[] {
  // Re-read every call in development so an author sees edits without a restart;
  // cache in production, where the corpus is fixed at build time.
  if (process.env.NODE_ENV === 'development') {
    return loadFromDisk();
  }
  cachedSources ??= loadFromDisk();
  return cachedSources;
}

/** Test seam — the module-level cache would otherwise outlive a fixture swap. */
export function clearResourceCache(): void {
  cachedSources = null;
}

function isVisible(metadata: ResourceMetadata): boolean {
  // Drafts stay readable by direct URL in development so authors can preview.
  return !metadata.draft || process.env.NODE_ENV === 'development';
}

/** Published articles, newest first. */
export function getAllResources(): ResourceMetadata[] {
  return getSources()
    .map((source) => source.metadata)
    .filter(isVisible)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

export function getResourceBySlug(slug: string): ResourceSource | null {
  const match = getSources().find((source) => source.metadata.slug === slug);
  if (!match || !isVisible(match.metadata)) return null;
  return match;
}

export function getResourceSlugs(): string[] {
  return getAllResources().map((metadata) => metadata.slug);
}
