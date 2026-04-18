import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { compileMDX } from 'next-mdx-remote/rsc';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { helpMdxComponents } from '@/components/help/mdx-components';

const HELP_CONTENT_ROOT = path.resolve(process.cwd(), 'apps/web/src/content/help');

const frontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  slug: z.string().min(1),
  roles: z.array(z.string().min(1)).min(1),
  keywords: z.array(z.string().min(1)).default([]),
  relatedArticles: z.array(z.string().min(1)).default([]),
  featured: z.boolean().optional().default(false),
});

export type HelpArticleFrontmatter = z.infer<typeof frontmatterSchema>;

export interface HelpArticleMetadata extends HelpArticleFrontmatter {
  excerpt: string;
  filePath: string;
}

export interface HelpArticleDocument {
  metadata: HelpArticleMetadata;
  content: ReactNode;
}

let cachedArticles: HelpArticleMetadata[] | null = null;

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

async function listArticleFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listArticleFiles(target);
      }
      if (entry.isFile() && entry.name.endsWith('.mdx')) {
        return [target];
      }
      return [];
    }),
  );

  return nested.flat();
}

export function parseArticleFrontmatter(
  filePath: string,
  source: string,
): HelpArticleMetadata {
  const { data, content } = matter(source);
  const frontmatter = frontmatterSchema.parse(data);

  return {
    ...frontmatter,
    excerpt: extractExcerpt(content),
    filePath,
  };
}

export function isArticleVisibleToRole(
  article: Pick<HelpArticleMetadata, 'roles'>,
  role: string,
): boolean {
  return article.roles.includes(role);
}

export function matchesArticleQuery(
  article: Pick<HelpArticleMetadata, 'title' | 'description' | 'keywords' | 'category' | 'slug'>,
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
    ...article.keywords,
  ].some((value) => value.toLowerCase().includes(normalized));
}

async function loadArticlesFromDisk(): Promise<HelpArticleMetadata[]> {
  const files = await listArticleFiles(HELP_CONTENT_ROOT);
  const articles = await Promise.all(
    files.map(async (filePath) => {
      const source = await fs.readFile(filePath, 'utf8');
      return parseArticleFrontmatter(filePath, source);
    }),
  );

  return articles.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getAllArticles(): Promise<HelpArticleMetadata[]> {
  if (process.env.NODE_ENV === 'development') {
    return loadArticlesFromDisk();
  }

  if (!cachedArticles) {
    cachedArticles = await loadArticlesFromDisk();
  }

  return cachedArticles;
}

export async function getFeaturedForRole(role: string): Promise<HelpArticleMetadata[]> {
  const articles = await getAllArticles();
  return articles
    .filter((article) => article.featured && isArticleVisibleToRole(article, role))
    .slice(0, 4);
}

export async function searchArticles(
  query: string,
  role: string,
): Promise<HelpArticleMetadata[]> {
  const articles = await getAllArticles();

  return articles.filter(
    (article) => isArticleVisibleToRole(article, role) && matchesArticleQuery(article, query),
  );
}

export async function getArticle(
  category: string,
  slug: string,
): Promise<HelpArticleDocument | null> {
  const articles = await getAllArticles();
  const metadata = articles.find(
    (article) => article.category === category && article.slug === slug,
  );

  if (!metadata) {
    return null;
  }

  const source = await fs.readFile(metadata.filePath, 'utf8');
  const { content } = await compileMDX<HelpArticleFrontmatter>({
    source,
    components: helpMdxComponents,
    options: {
      parseFrontmatter: true,
    },
  });

  return {
    metadata,
    content,
  };
}
