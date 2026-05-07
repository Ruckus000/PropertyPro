#!/usr/bin/env tsx
/**
 * CI guard: validate every help article MDX frontmatter at PR time.
 *
 * The runtime `parseArticleFrontmatter()` now throws on invalid frontmatter
 * (per ADR-004). This guard catches the same errors at CI so a typo in
 * frontmatter never reaches a Vercel deploy. It also runs cross-article
 * checks the runtime parser cannot do alone:
 *
 *   1. Frontmatter schema (helpFrontmatterSchema)  - structure + format
 *   2. featureGates ↔ CommunityFeatures sync       - runtime list vs source-of-truth
 *   3. relatedArticles integrity                   - every slug resolves to a file
 *   4. category matches parent directory           - filesystem layout truth
 *   5. slug uniqueness across the tree
 *   6. Staleness:  updatedAt > 365d → error,  > 180d → warning
 *
 * Wired into `pnpm lint` via `guard:help-content`. Exits 1 on any error,
 * 0 on warnings only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import {
  COMMUNITY_FEATURE_KEYS,
  validateFrontmatter,
} from '../apps/web/src/lib/help/frontmatter-schema';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const helpRoot = join(repoRoot, 'apps', 'web', 'src', 'content', 'help');
const featureTypesPath = join(
  repoRoot,
  'packages',
  'shared',
  'src',
  'features',
  'types.ts',
);

const STALE_WARNING_DAYS = 180;
const STALE_ERROR_DAYS = 365;

interface Problem {
  severity: 'error' | 'warning';
  file: string;
  message: string;
}

interface Article {
  filePath: string;
  relativePath: string;
  category: string;
  slug: string;
  data: Record<string, unknown>;
  rawContent: string;
}

function listMdxFiles(dir: string): string[] {
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function loadArticles(): Article[] {
  return listMdxFiles(helpRoot).map((filePath) => {
    const rawContent = readFileSync(filePath, 'utf8');
    const { data } = matter(rawContent);
    const relativePath = relative(repoRoot, filePath);
    const category = relative(helpRoot, dirname(filePath));
    const slug =
      typeof data.slug === 'string' ? data.slug : '(missing slug)';
    return {
      filePath,
      relativePath,
      category,
      slug,
      data: data as Record<string, unknown>,
      rawContent,
    };
  });
}

function checkSchema(article: Article): Problem[] {
  const result = validateFrontmatter(article.data);
  if (result.ok) return [];
  return result.errors.map((err) => ({
    severity: 'error' as const,
    file: article.relativePath,
    message: `frontmatter.${err.path}: ${err.message}`,
  }));
}

function checkCategoryMatchesDirectory(article: Article): Problem[] {
  const declared = article.data.category;
  if (typeof declared !== 'string') return [];
  if (declared !== article.category) {
    return [
      {
        severity: 'error',
        file: article.relativePath,
        message: `frontmatter.category="${declared}" does not match parent directory "${article.category}"`,
      },
    ];
  }
  return [];
}

function checkSlugMatchesFilename(article: Article): Problem[] {
  const declared = article.data.slug;
  if (typeof declared !== 'string') return [];
  const expected = article.filePath
    .split('/')
    .pop()!
    .replace(/\.mdx$/, '');
  if (declared !== expected) {
    return [
      {
        severity: 'error',
        file: article.relativePath,
        message: `frontmatter.slug="${declared}" does not match filename "${expected}.mdx"`,
      },
    ];
  }
  return [];
}

function checkSlugUniqueness(articles: Article[]): Problem[] {
  const seen = new Map<string, string>();
  const problems: Problem[] = [];
  for (const article of articles) {
    if (typeof article.data.slug !== 'string') continue;
    const prior = seen.get(article.data.slug);
    if (prior) {
      problems.push({
        severity: 'error',
        file: article.relativePath,
        message: `slug="${article.data.slug}" duplicates ${prior}`,
      });
    } else {
      seen.set(article.data.slug, article.relativePath);
    }
  }
  return problems;
}

function checkRelatedArticlesIntegrity(articles: Article[]): Problem[] {
  const slugs = new Set(
    articles
      .map((a) => a.data.slug)
      .filter((s): s is string => typeof s === 'string'),
  );
  const problems: Problem[] = [];
  for (const article of articles) {
    const related = article.data.relatedArticles;
    if (!Array.isArray(related)) continue;
    for (const ref of related) {
      if (typeof ref !== 'string') continue;
      if (!slugs.has(ref)) {
        problems.push({
          severity: 'error',
          file: article.relativePath,
          message: `relatedArticles entry "${ref}" does not match any article slug in the help tree`,
        });
      }
    }
  }
  return problems;
}

function checkStaleness(article: Article): Problem[] {
  const updatedAt = article.data.updatedAt;
  if (typeof updatedAt !== 'string') return [];
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return [];
  const ageDays = Math.floor(
    (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (ageDays > STALE_ERROR_DAYS) {
    return [
      {
        severity: 'error',
        file: article.relativePath,
        message: `updatedAt is ${ageDays} days old (>${STALE_ERROR_DAYS} day threshold). Refresh and bump updatedAt or set lastReviewedAt.`,
      },
    ];
  }
  if (ageDays > STALE_WARNING_DAYS) {
    return [
      {
        severity: 'warning',
        file: article.relativePath,
        message: `updatedAt is ${ageDays} days old (>${STALE_WARNING_DAYS} day threshold). Consider review and lastReviewedAt bump.`,
      },
    ];
  }
  return [];
}

/**
 * Verifies COMMUNITY_FEATURE_KEYS matches `readonly XXX: boolean;` properties
 * in packages/shared/src/features/types.ts. Drift here is the silent-failure
 * mode the audit flagged: a renamed flag would silently invalidate every
 * featureGate that referenced it.
 */
function checkFeatureKeysMatchSource(): Problem[] {
  const source = readFileSync(featureTypesPath, 'utf8');
  const matches = [
    ...source.matchAll(/readonly\s+(\w+):\s*boolean\s*;/g),
  ];
  const sourceKeys = new Set(matches.map((m) => m[1]));
  const schemaKeys = new Set(COMMUNITY_FEATURE_KEYS);

  const problems: Problem[] = [];
  for (const key of sourceKeys) {
    if (!schemaKeys.has(key as (typeof COMMUNITY_FEATURE_KEYS)[number])) {
      problems.push({
        severity: 'error',
        file: 'apps/web/src/lib/help/frontmatter-schema.ts',
        message: `COMMUNITY_FEATURE_KEYS missing "${key}" — add it (CommunityFeatures has it, schema does not)`,
      });
    }
  }
  for (const key of schemaKeys) {
    if (!sourceKeys.has(key)) {
      problems.push({
        severity: 'error',
        file: 'apps/web/src/lib/help/frontmatter-schema.ts',
        message: `COMMUNITY_FEATURE_KEYS contains "${key}" which is not a property of CommunityFeatures — remove it or add to the interface`,
      });
    }
  }
  return problems;
}

function main(): void {
  console.log('🔍 Help Content Guard');
  console.log('='.repeat(60));

  if (!statSync(helpRoot, { throwIfNoEntry: false })) {
    console.error(`❌ help content root does not exist: ${helpRoot}`);
    process.exit(1);
  }

  const articles = loadArticles();
  console.log(
    `\nScanning ${articles.length} MDX article(s) under ${relative(repoRoot, helpRoot)}\n`,
  );

  const problems: Problem[] = [];

  console.log('Checking COMMUNITY_FEATURE_KEYS sync with CommunityFeatures source...');
  problems.push(...checkFeatureKeysMatchSource());

  console.log('Checking slug uniqueness...');
  problems.push(...checkSlugUniqueness(articles));

  console.log('Checking relatedArticles integrity...');
  problems.push(...checkRelatedArticlesIntegrity(articles));

  console.log('Checking per-article schema, category, slug-filename match, staleness...');
  for (const article of articles) {
    problems.push(...checkSchema(article));
    problems.push(...checkCategoryMatchesDirectory(article));
    problems.push(...checkSlugMatchesFilename(article));
    problems.push(...checkStaleness(article));
  }

  const errors = problems.filter((p) => p.severity === 'error');
  const warnings = problems.filter((p) => p.severity === 'warning');

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} warning(s):`);
    for (const w of warnings) {
      console.log(`  ${w.file}: ${w.message}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} error(s):`);
    for (const e of errors) {
      console.log(`  ${e.file}: ${e.message}`);
    }
    process.exit(1);
  }

  console.log(
    `\n✅ Help content is valid. ${articles.length} article(s) checked, ${warnings.length} warning(s), 0 errors.`,
  );
  process.exit(0);
}

main();
