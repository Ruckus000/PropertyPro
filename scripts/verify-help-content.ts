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
 *   3. relatedArticles / upNext / help: links      - resolve within the same section
 *   4. layout: content/help/<section>/<category>/<slug>.mdx matches frontmatter;
 *      boardOnly only in the resident section, for condo/HOA; no body help:
 *      link from an ordinary article to a boardOnly one (modal HTML is cached
 *      per article, not per reader)
 *   5. slug uniqueness within each section (a slug repeats once per section)
 *   6. Staleness:  updatedAt > 365d → error,  > 180d → warning
 *   7. Shots: every <Step shot>/<Figure shot> has a capture manifest; captured
 *      ones (media-index.json) exist on disk within budget; uncaptured ones
 *      warn. <OnlyFor types> names real community types.
 *
 * Wired into `pnpm lint` via `guard:help-content`. Exits 1 on any error,
 * 0 on warnings only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { COMMUNITY_TYPES } from '@propertypro/shared';
import {
  COMMUNITY_FEATURE_KEYS,
  validateFrontmatter,
} from '../apps/web/src/lib/help/frontmatter-schema';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const helpRoot = join(repoRoot, 'apps', 'web', 'src', 'content', 'help');
const publicHelpRoot = join(repoRoot, 'apps', 'web', 'public');
const mediaIndexPath = join(helpRoot, 'media-index.json');
const manifestsRoot = join(repoRoot, 'scripts', 'help-capture', 'manifests');
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
  /** From the path: content/help/<section>/<category>/<slug>.mdx */
  section: string;
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
    const [section = '', category = ''] = relative(helpRoot, dirname(filePath)).split('/');
    const slug =
      typeof data.slug === 'string' ? data.slug : '(missing slug)';
    return {
      filePath,
      relativePath,
      section,
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

function checkLayoutMatchesFrontmatter(article: Article): Problem[] {
  const problems: Problem[] = [];
  const depth = relative(helpRoot, article.filePath).split('/').length;
  if (depth !== 3) {
    problems.push({
      severity: 'error',
      file: article.relativePath,
      message: 'articles live at content/help/<section>/<category>/<slug>.mdx',
    });
  }
  const { section, category } = article.data;
  if (typeof section === 'string' && section !== article.section) {
    problems.push({
      severity: 'error',
      file: article.relativePath,
      message: `frontmatter.section="${section}" does not match section directory "${article.section}"`,
    });
  }
  if (typeof category === 'string' && category !== article.category) {
    problems.push({
      severity: 'error',
      file: article.relativePath,
      message: `frontmatter.category="${category}" does not match parent directory "${article.category}"`,
    });
  }
  // A board seat is a resident's, and only condos and HOAs have boards.
  if (article.data.boardOnly === true) {
    const types = article.data.communityTypes;
    if (article.section !== 'resident' || !Array.isArray(types) || types.includes('apartment')) {
      problems.push({
        severity: 'error',
        file: article.relativePath,
        message: 'boardOnly articles belong in the resident section with communityTypes limited to condo_718/hoa_720',
      });
    }
  }
  return problems;
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

/** A slug is unique within its section; the same slug in another section is its counterpart. */
function checkSlugUniqueness(articles: Article[]): Problem[] {
  const seen = new Map<string, string>();
  const problems: Problem[] = [];
  for (const article of articles) {
    if (typeof article.data.slug !== 'string') continue;
    const key = `${article.section}/${article.data.slug}`;
    const prior = seen.get(key);
    if (prior) {
      problems.push({
        severity: 'error',
        file: article.relativePath,
        message: `slug="${article.data.slug}" duplicates ${prior} in section "${article.section}"`,
      });
    } else {
      seen.set(key, article.relativePath);
    }
  }
  return problems;
}

function sectionSlugs(articles: Article[]): Map<string, Set<string>> {
  const bySection = new Map<string, Set<string>>();
  for (const article of articles) {
    if (typeof article.data.slug !== 'string') continue;
    if (!bySection.has(article.section)) bySection.set(article.section, new Set());
    bySection.get(article.section)!.add(article.data.slug);
  }
  return bySection;
}

/** relatedArticles and body `help:` links resolve within the article's own section. */
function checkLinkIntegrity(articles: Article[]): Problem[] {
  const slugs = sectionSlugs(articles);
  const boardOnly = new Set(
    articles.filter((a) => a.data.boardOnly === true).map((a) => `${a.section}/${a.data.slug}`),
  );
  const problems: Problem[] = [];
  for (const article of articles) {
    const own = slugs.get(article.section) ?? new Set<string>();
    const related = Array.isArray(article.data.relatedArticles) ? article.data.relatedArticles : [];
    for (const ref of related) {
      if (typeof ref === 'string' && !own.has(ref)) {
        problems.push({
          severity: 'error',
          file: article.relativePath,
          message: `relatedArticles entry "${ref}" has no article in section "${article.section}"`,
        });
      }
    }
    const body = matter(article.rawContent).content;
    for (const match of body.matchAll(/\]\(help:([^)\s]+)\)/g)) {
      if (!own.has(match[1]!)) {
        problems.push({
          severity: 'error',
          file: article.relativePath,
          message: `link "help:${match[1]}" has no article in section "${article.section}"`,
        });
      } else if (article.data.boardOnly !== true && boardOnly.has(`${article.section}/${match[1]}`)) {
        // The modal caches rendered HTML per article, not per reader, so a
        // link's visibility must not depend on the reader's board seat.
        problems.push({
          severity: 'error',
          file: article.relativePath,
          message: `link "help:${match[1]}" points at a boardOnly article; only boardOnly articles may link to one in the body (use relatedArticles instead)`,
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

const MEDIA_BUDGETS: Array<{ pattern: RegExp; maxBytes: number; label: string }> = [
  { pattern: /\.(webp|png|jpg|jpeg)$/i, maxBytes: 250 * 1024, label: 'image ≤ 250KB' },
  { pattern: /\.(mp4|webm)$/i, maxBytes: 1.5 * 1024 * 1024, label: 'clip ≤ 1.5MB' },
];

/** Collect every media path referenced by an article (frontmatter + body). */
function collectMediaPaths(frontmatter: Record<string, unknown>, body: string): string[] {
  const paths: string[] = [];
  const hero = frontmatter.heroMedia as { src?: string; poster?: string } | undefined;
  if (hero?.src) paths.push(hero.src);
  if (hero?.poster) paths.push(hero.poster);
  const attrRegex = /<(?:MediaFrame|Step)\b[^>]*?\b(?:src|image|poster|src2x)="([^"]+)"/g;
  for (const match of body.matchAll(attrRegex)) {
    paths.push(match[1]!);
  }
  const mdImgRegex = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  for (const match of body.matchAll(mdImgRegex)) {
    paths.push(match[1]!);
  }
  return paths;
}

function checkMediaIntegrity(article: Article): Problem[] {
  const { data: frontmatter, rawContent, relativePath } = article;
  const body = matter(rawContent).content;
  const problems: Problem[] = [];

  for (const mediaPath of collectMediaPaths(frontmatter, body)) {
    if (!mediaPath.startsWith('/help/')) {
      problems.push({
        severity: 'error',
        file: relativePath,
        message: `media path "${mediaPath}" must start with /help/ (repo-hosted under apps/web/public/help)`,
      });
      continue;
    }
    const abs = join(publicHelpRoot, mediaPath);
    let size: number;
    try {
      size = statSync(abs).size;
    } catch {
      problems.push({
        severity: 'error',
        file: relativePath,
        message: `media file missing: ${mediaPath} (expected at apps/web/public${mediaPath})`,
      });
      continue;
    }
    const budget = MEDIA_BUDGETS.find((b) => b.pattern.test(mediaPath));
    if (budget && size > budget.maxBytes) {
      problems.push({
        severity: 'error',
        file: relativePath,
        message: `media over budget: ${mediaPath} is ${(size / 1024).toFixed(0)}KB (budget: ${budget.label}). Re-export smaller or split the clip.`,
      });
    }
  }
  return problems;
}

function checkUpNextIntegrity(articles: Article[]): Problem[] {
  const slugs = sectionSlugs(articles);
  const problems: Problem[] = [];
  for (const article of articles) {
    const upNext = article.data.upNext;
    if (typeof upNext !== 'string') continue;
    if (!slugs.get(article.section)?.has(upNext)) {
      problems.push({
        severity: 'error',
        file: article.relativePath,
        message: `upNext "${upNext}" has no article in section "${article.section}"`,
      });
    }
  }
  return problems;
}

function loadMediaIndex(): Record<string, [number, number]> {
  try {
    return JSON.parse(readFileSync(mediaIndexPath, 'utf8'));
  } catch {
    return {};
  }
}

/** `<section>/<category>/<slug>` → shot names declared by its capture manifest. */
function loadManifestShots(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) {
        const m = JSON.parse(readFileSync(full, 'utf8')) as {
          section?: string;
          category?: string;
          slug?: string;
          shots?: Array<{ name?: string }>;
        };
        out.set(
          `${m.section}/${m.category}/${m.slug}`,
          new Set((m.shots ?? []).map((shot) => shot.name ?? '')),
        );
      }
    }
  };
  if (statSync(manifestsRoot, { throwIfNoEntry: false })) walk(manifestsRoot);
  return out;
}

/**
 * Every named shot must be capturable (declared in the article's manifest).
 * A captured shot must exist at 1x and 2x within budget. An uncaptured shot
 * is a warning: the article renders without it until `pnpm help:capture` runs.
 */
function checkShots(
  articles: Article[],
  mediaIndex: Record<string, [number, number]>,
  manifestShots: Map<string, Set<string>>,
): { problems: Problem[]; uncaptured: number } {
  const problems: Problem[] = [];
  const referenced = new Set<string>();
  let uncaptured = 0;
  for (const article of articles) {
    const base = `${article.section}/${article.category}/${article.slug}`;
    const body = matter(article.rawContent).content;
    for (const match of body.matchAll(/<(?:Step|Figure)\b[^>]*?\bshot="([^"]+)"/g)) {
      const name = match[1]!;
      const key = `${base}/${name}`;
      referenced.add(key);
      if (mediaIndex[key]) {
        for (const file of [`/help/${key}.webp`, `/help/${key}@2x.webp`]) {
          let size: number;
          try {
            size = statSync(join(publicHelpRoot, file)).size;
          } catch {
            problems.push({ severity: 'error', file: article.relativePath, message: `shot "${name}" is in media-index.json but ${file} is missing` });
            continue;
          }
          if (size > 250 * 1024) {
            problems.push({ severity: 'error', file: article.relativePath, message: `shot ${file} is ${(size / 1024).toFixed(0)}KB (budget: image ≤ 250KB). Tighten clipTo.` });
          }
        }
        continue;
      }
      if (!manifestShots.get(base)?.has(name)) {
        problems.push({
          severity: 'error',
          file: article.relativePath,
          message: `shot "${name}" has no capture manifest entry (scripts/help-capture/manifests/${base}.json)`,
        });
      } else {
        uncaptured += 1;
      }
    }
    for (const match of body.matchAll(/<OnlyFor\b[^>]*?\btypes="([^"]*)"/g)) {
      for (const type of match[1]!.split(/\s+/).filter(Boolean)) {
        if (!(COMMUNITY_TYPES as readonly string[]).includes(type)) {
          problems.push({ severity: 'error', file: article.relativePath, message: `<OnlyFor types> has unknown community type "${type}" (one of: ${COMMUNITY_TYPES.join(', ')})` });
        }
      }
    }
  }
  for (const key of Object.keys(mediaIndex)) {
    if (!referenced.has(key)) {
      problems.push({ severity: 'warning', file: 'apps/web/src/content/help/media-index.json', message: `captured shot "${key}" is not used by any article` });
    }
  }
  return { problems, uncaptured };
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

  console.log('Checking relatedArticles and help: link integrity...');
  problems.push(...checkLinkIntegrity(articles));

  console.log('Checking upNext integrity...');
  problems.push(...checkUpNextIntegrity(articles));

  console.log('Checking per-article schema, category, slug-filename match, staleness, media integrity...');
  for (const article of articles) {
    problems.push(...checkSchema(article));
    problems.push(...checkLayoutMatchesFrontmatter(article));
    problems.push(...checkSlugMatchesFilename(article));
    problems.push(...checkStaleness(article));
    problems.push(...checkMediaIntegrity(article));
  }

  console.log('Checking step and figure shots...');
  const shots = checkShots(articles, loadMediaIndex(), loadManifestShots());
  problems.push(...shots.problems);

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
  if (shots.uncaptured > 0) {
    console.log(
      `ℹ️  ${shots.uncaptured} step/figure shot(s) have manifests but are not captured yet — run \`pnpm help:capture --all\` against a seeded dev server.`,
    );
  }
  process.exit(0);
}

main();
