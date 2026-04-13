# Help Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a role-aware help center combining MDX platform articles with community-specific FAQs, accessible via dedicated pages, an embedded widget, and contextual links.

**Architecture:** MDX articles in `apps/web/src/content/help/` compiled on demand by `next-mdx-remote` in server components. Article metadata cached as a module-level singleton. Community FAQs served from existing Postgres tables with new `category` and `role_visibility` columns. Widget is a client-side slide-out drawer using TanStack Query hooks for data.

**Tech Stack:** Next.js 15 (App Router), next-mdx-remote, gray-matter, TanStack Query, Drizzle ORM, Tailwind CSS, shadcn/ui, Zod

**Spec:** `docs/superpowers/specs/2026-04-13-help-center-design.md`

---

## File Map

### New Files (22)

| File | Responsibility |
|---|---|
| **Content (7)** | |
| `apps/web/src/content/help/getting-started/welcome-to-propertypro.mdx` | Welcome guide article |
| `apps/web/src/content/help/getting-started/understanding-your-dashboard.mdx` | Dashboard walkthrough article |
| `apps/web/src/content/help/compliance/compliance-scoring-explained.mdx` | Compliance scoring guide |
| `apps/web/src/content/help/compliance/document-posting-requirements.mdx` | Document posting rules article |
| `apps/web/src/content/help/documents/uploading-documents.mdx` | Document upload guide |
| `apps/web/src/content/help/maintenance/submitting-a-request.mdx` | Maintenance request guide |
| `apps/web/src/content/help/meetings/meeting-notices-explained.mdx` | Meeting notice rules article |
| **Database (1)** | |
| `packages/db/migrations/0142_enhance_faqs_for_help_center.sql` | Add category + role_visibility to faqs |
| **Service (1)** | |
| `apps/web/src/lib/services/help-article-service.ts` | Filesystem article cache, search, contextual lookup |
| **API Routes (2)** | |
| `apps/web/src/app/api/v1/help/search/route.ts` | Unified search across articles + FAQs |
| `apps/web/src/app/api/v1/help/contextual/route.ts` | Articles matching current route |
| **Pages (5)** | |
| `apps/web/src/app/(authenticated)/help/page.tsx` | Help hub — personalized landing |
| `apps/web/src/app/(authenticated)/help/search/page.tsx` | Search results page |
| `apps/web/src/app/(authenticated)/help/[category]/page.tsx` | Category listing |
| `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx` | Article page |
| `apps/web/src/app/(authenticated)/help/manage/page.tsx` | Admin FAQ management (desktop) |
| **Components (5)** | |
| `apps/web/src/components/help/help-widget.tsx` | Slide-out drawer (client component) |
| `apps/web/src/components/help/help-widget-provider.tsx` | Widget open/close context |
| `apps/web/src/components/help/help-link.tsx` | Contextual "?" link component |
| `apps/web/src/components/help/help-search-input.tsx` | Shared search bar |
| `apps/web/src/components/help/mdx-components.tsx` | Callout, StepByStep, Screenshot |
| **Hooks (1)** | |
| `apps/web/src/hooks/use-help.ts` | TanStack Query: useHelpSearch, useContextualHelp |

### Modified Files (10)

| File | Change |
|---|---|
| `apps/web/package.json` | Add next-mdx-remote, gray-matter |
| `packages/db/src/schema/faqs.ts` | Add category, roleVisibility columns |
| `apps/web/src/middleware.ts` | Add `/help` to PROTECTED_PATH_PREFIXES |
| `apps/web/src/components/layout/nav-config.ts` | Add help to PAGE_TITLES |
| `apps/web/src/components/layout/command-palette.tsx` | Add Help Center to globalItems |
| `apps/web/src/components/layout/app-top-bar.tsx` | Add ? button |
| `apps/web/src/components/layout/profile-menu.tsx` | Add Help link |
| `apps/web/src/app/(authenticated)/layout.tsx` | Mount HelpWidgetProvider |
| `apps/web/src/components/mobile/MobileHelpContent.tsx` | Add platform article quick links |
| `apps/web/src/app/mobile/help/page.tsx` | Fetch platform articles alongside FAQs |
| `packages/shared/src/default-faqs.ts` | Expand from 5 to ~15 default FAQs |

---

## Layer 1: Foundation

### Task 1: Install Dependencies & Create Directory Structure

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/content/help/` (directory structure)
- Create: `public/help/images/` and `public/help/diagrams/` (empty directories)

- [ ] **Step 1: Install next-mdx-remote and gray-matter**

```bash
cd /Users/jphilistin/Documents/Coding/PropertyPro
pnpm --filter @propertypro/web add next-mdx-remote gray-matter
```

Expected: packages added to `apps/web/package.json` dependencies.

- [ ] **Step 2: Create content directory structure**

```bash
mkdir -p apps/web/src/content/help/getting-started
mkdir -p apps/web/src/content/help/compliance
mkdir -p apps/web/src/content/help/documents
mkdir -p apps/web/src/content/help/maintenance
mkdir -p apps/web/src/content/help/meetings
mkdir -p public/help/images
mkdir -p public/help/diagrams
```

- [ ] **Step 3: Add .gitkeep files so empty directories are tracked**

```bash
touch public/help/images/.gitkeep
touch public/help/diagrams/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/content/ public/help/
git commit -m "chore: install next-mdx-remote + gray-matter, create help content directories"
```

---

### Task 2: Database Migration — Enhance FAQs

**Files:**
- Create: `packages/db/migrations/0142_enhance_faqs_for_help_center.sql`
- Modify: `packages/db/src/schema/faqs.ts`
- Modify: `packages/db/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration file**

Create `packages/db/migrations/0142_enhance_faqs_for_help_center.sql`:

```sql
-- Add category and role visibility columns to existing faqs table.
-- Both nullable for backwards compatibility with existing FAQs.
-- NULL category = uncategorized. NULL role_visibility = visible to all roles.

ALTER TABLE faqs ADD COLUMN category text;
ALTER TABLE faqs ADD COLUMN role_visibility text[];

COMMENT ON COLUMN faqs.category IS 'Optional grouping label for help center display';
COMMENT ON COLUMN faqs.role_visibility IS 'Array of community roles that can see this FAQ. NULL = all roles.';
```

- [ ] **Step 2: Update Drizzle schema to match**

In `packages/db/src/schema/faqs.ts`, add the two new columns:

```typescript
import { pgTable, bigserial, bigint, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const faqs = pgTable('faqs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' }).notNull().references(() => communities.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  category: text('category'),
  roleVisibility: text('role_visibility').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
```

- [ ] **Step 3: Add journal entry**

Add to the end of the `entries` array in `packages/db/migrations/meta/_journal.json`:

```json
{
  "idx": 143,
  "version": "7",
  "when": 1744531200000,
  "tag": "0142_enhance_faqs_for_help_center",
  "breakpoints": true
}
```

- [ ] **Step 4: Run migration**

```bash
pnpm --filter @propertypro/db db:migrate
```

Expected: Migration applies successfully, no errors.

- [ ] **Step 5: Verify schema**

```bash
pnpm typecheck
```

Expected: All packages type-check cleanly.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/0142_enhance_faqs_for_help_center.sql packages/db/src/schema/faqs.ts packages/db/migrations/meta/_journal.json
git commit -m "feat(db): add category and role_visibility columns to faqs table"
```

---

### Task 3: Article Service — Core Data Layer

**Files:**
- Create: `apps/web/src/lib/services/help-article-service.ts`
- Create: `apps/web/src/lib/services/__tests__/help-article-service.test.ts`

- [ ] **Step 1: Define the types and write the failing test**

Create `apps/web/src/lib/services/__tests__/help-article-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll mock fs and gray-matter since the tests run in jsdom
vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('gray-matter', () => ({
  default: vi.fn(),
}));

describe('help-article-service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('parseArticleFrontmatter', () => {
    it('parses valid frontmatter into ArticleMetadata', async () => {
      const { parseArticleFrontmatter } = await import('../help-article-service');
      const matter = (await import('gray-matter')).default as unknown as ReturnType<typeof vi.fn>;
      matter.mockReturnValue({
        data: {
          title: 'Test Article',
          description: 'A test article',
          category: 'getting-started',
          slug: 'test-article',
          roles: ['owner', 'tenant'],
          keywords: ['test', 'help'],
          relatedArticles: [],
          featured: false,
        },
        content: '# Hello world',
      });

      const result = parseArticleFrontmatter('/fake/path.mdx', 'test content');
      expect(result).toEqual({
        title: 'Test Article',
        description: 'A test article',
        category: 'getting-started',
        slug: 'test-article',
        roles: ['owner', 'tenant'],
        keywords: ['test', 'help'],
        relatedArticles: [],
        featured: false,
        contextPaths: [],
        readTimeMinutes: expect.any(Number),
        filePath: '/fake/path.mdx',
      });
    });

    it('defaults featured to false when not specified', async () => {
      const { parseArticleFrontmatter } = await import('../help-article-service');
      const matter = (await import('gray-matter')).default as unknown as ReturnType<typeof vi.fn>;
      matter.mockReturnValue({
        data: {
          title: 'Minimal',
          description: 'Minimal article',
          category: 'docs',
          slug: 'minimal',
          roles: [],
          keywords: [],
          relatedArticles: [],
        },
        content: 'Short content here.',
      });

      const result = parseArticleFrontmatter('/fake/minimal.mdx', 'test');
      expect(result.featured).toBe(false);
      expect(result.contextPaths).toEqual([]);
    });
  });

  describe('matchContextPath', () => {
    it('matches exact paths', async () => {
      const { matchContextPath } = await import('../help-article-service');
      expect(matchContextPath('/compliance', '/compliance')).toBe(true);
      expect(matchContextPath('/compliance', '/documents')).toBe(false);
    });

    it('matches wildcard paths', async () => {
      const { matchContextPath } = await import('../help-article-service');
      expect(matchContextPath('/communities/*/compliance', '/communities/123/compliance')).toBe(true);
      expect(matchContextPath('/communities/*/compliance', '/communities/456/compliance')).toBe(true);
      expect(matchContextPath('/communities/*/compliance', '/communities/123/documents')).toBe(false);
    });

    it('does not match partial segments', async () => {
      const { matchContextPath } = await import('../help-article-service');
      expect(matchContextPath('/compliance', '/compliance-extra')).toBe(false);
    });
  });

  describe('searchArticles', () => {
    it('matches articles by title keyword', async () => {
      const { searchArticles } = await import('../help-article-service');

      const articles = [
        { title: 'Compliance Scoring', description: 'How scoring works', keywords: ['score'], slug: 'scoring', category: 'compliance', roles: [], featured: false, contextPaths: [], relatedArticles: [], readTimeMinutes: 3, filePath: '/a.mdx' },
        { title: 'Upload Documents', description: 'How to upload', keywords: ['file'], slug: 'upload', category: 'documents', roles: [], featured: false, contextPaths: [], relatedArticles: [], readTimeMinutes: 2, filePath: '/b.mdx' },
      ];

      const results = searchArticles(articles, 'compliance');
      expect(results).toHaveLength(1);
      expect(results[0].slug).toBe('scoring');
    });

    it('matches articles by keyword array', async () => {
      const { searchArticles } = await import('../help-article-service');

      const articles = [
        { title: 'Upload Documents', description: 'How to upload', keywords: ['file', 'pdf', 'upload'], slug: 'upload', category: 'documents', roles: [], featured: false, contextPaths: [], relatedArticles: [], readTimeMinutes: 2, filePath: '/b.mdx' },
      ];

      const results = searchArticles(articles, 'pdf');
      expect(results).toHaveLength(1);
    });

    it('returns empty for no matches', async () => {
      const { searchArticles } = await import('../help-article-service');
      const results = searchArticles([], 'anything');
      expect(results).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/jphilistin/Documents/Coding/PropertyPro
pnpm --filter @propertypro/web exec vitest run src/lib/services/__tests__/help-article-service.test.ts
```

Expected: FAIL — module `../help-article-service` not found.

- [ ] **Step 3: Implement the article service**

Create `apps/web/src/lib/services/help-article-service.ts`:

```typescript
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
 * Match a pattern like "/communities/* /compliance" against a path like
 * "/communities/123/compliance". Only * (single segment) is supported.
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
      const filePath = path.join(catPath, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      articles.push(parseArticleFrontmatter(filePath, raw));
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @propertypro/web exec vitest run src/lib/services/__tests__/help-article-service.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/help-article-service.ts apps/web/src/lib/services/__tests__/help-article-service.test.ts
git commit -m "feat: add help article service with filesystem cache and search"
```

---

## Layer 2: Content & Rendering

### Task 4: MDX Components — Callout, StepByStep, Screenshot

**Files:**
- Create: `apps/web/src/components/help/mdx-components.tsx`

- [ ] **Step 1: Create the MDX components file**

Create `apps/web/src/components/help/mdx-components.tsx`:

```typescript
/**
 * Custom MDX components for help articles.
 *
 * These are passed to next-mdx-remote's compileMDX as the components map.
 * All three are server-compatible (no 'use client' directive).
 */
import type { ReactNode } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Callout
// ---------------------------------------------------------------------------

const CALLOUT_STYLES = {
  info: {
    border: 'border-blue-200',
    bg: 'bg-blue-50',
    icon: 'ℹ',
    title: 'text-blue-900',
    body: 'text-blue-800',
  },
  warning: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    icon: '⚠',
    title: 'text-amber-900',
    body: 'text-amber-800',
  },
  tip: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    icon: '💡',
    title: 'text-emerald-900',
    body: 'text-emerald-800',
  },
  'florida-statute': {
    border: 'border-purple-200',
    bg: 'bg-purple-50',
    icon: '§',
    title: 'text-purple-900',
    body: 'text-purple-800',
  },
} as const;

type CalloutType = keyof typeof CALLOUT_STYLES;

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const style = CALLOUT_STYLES[type];
  return (
    <div
      className={cn('my-6 rounded-[var(--radius-md)] border p-4', style.border, style.bg)}
      role="note"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
          {style.icon}
        </span>
        <div className="min-w-0 flex-1">
          {title && (
            <p className={cn('mb-1 text-sm font-semibold', style.title)}>
              {title}
            </p>
          )}
          <div className={cn('text-sm leading-relaxed', style.body)}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepByStep
// ---------------------------------------------------------------------------

interface StepProps {
  title: string;
  image?: string;
  imageAlt?: string;
  children: ReactNode;
}

export function Step({ title, image, imageAlt, children }: StepProps) {
  return (
    <div className="relative pb-8 pl-8 last:pb-0">
      {/* Vertical connector line */}
      <div
        className="absolute left-3 top-8 bottom-0 w-px bg-border-default last:hidden"
        aria-hidden="true"
      />
      {/* Step number circle */}
      <div
        className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--interactive-primary)] text-xs font-semibold text-white"
        aria-hidden="true"
      />
      <div>
        <h4 className="mb-1 text-sm font-semibold text-content">{title}</h4>
        <div className="text-sm leading-relaxed text-content-secondary">
          {children}
        </div>
        {image && (
          <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-edge">
            <Image
              src={image}
              alt={imageAlt ?? title}
              width={800}
              height={450}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface StepByStepProps {
  children: ReactNode;
}

export function StepByStep({ children }: StepByStepProps) {
  return (
    <div className="my-6" role="list" aria-label="Step-by-step guide">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

interface ScreenshotProps {
  src: string;
  alt: string;
  caption?: string;
}

export function Screenshot({ src, alt, caption }: ScreenshotProps) {
  return (
    <figure className="my-6">
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-edge">
        <Image
          src={src}
          alt={alt}
          width={960}
          height={540}
          className="w-full"
        />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-xs text-content-tertiary">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Components map for next-mdx-remote
// ---------------------------------------------------------------------------

export const helpMdxComponents = {
  Callout,
  StepByStep,
  Step,
  Screenshot,
};
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm typecheck
```

Expected: Clean typecheck.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/help/mdx-components.tsx
git commit -m "feat: add MDX components (Callout, StepByStep, Screenshot) for help articles"
```

---

### Task 5: Write Initial MDX Content Articles (7 articles)

**Files:**
- Create: 7 `.mdx` files in `apps/web/src/content/help/`

- [ ] **Step 1: Create the 7 article files**

Create all 7 MDX articles. Each follows the frontmatter schema and uses the MDX components. Below is each file. **Note to implementer: these are starter articles — content should be reviewed and expanded by the product team. The structure and frontmatter are the critical parts.**

Create `apps/web/src/content/help/getting-started/welcome-to-propertypro.mdx`:

```mdx
---
title: "Welcome to PropertyPro"
description: "Get oriented with PropertyPro — your community's compliance and management platform."
category: "getting-started"
slug: "welcome-to-propertypro"
roles: []
keywords: ["getting started", "welcome", "overview", "first time", "new user"]
relatedArticles: ["understanding-your-dashboard"]
featured: true
contextPaths: ["/dashboard"]
---

# Welcome to PropertyPro

PropertyPro helps Florida condominium and homeowners associations stay compliant with state statutes, manage community operations, and keep residents informed.

<Callout type="tip" title="First time here?">
Start by exploring your dashboard — it gives you a personalized overview of your community's activity, compliance status, and quick access to key features.
</Callout>

## What You Can Do

Depending on your role in the community, you'll have access to different features:

- **View documents** — Access your community's official records, bylaws, and meeting minutes
- **Track maintenance** — Submit and monitor maintenance requests
- **Stay informed** — Read announcements and get notified about meetings
- **Monitor compliance** — Board members and managers can track statutory compliance

## Need Help?

Use the search bar at the top of the help center to find answers, or look for the **?** icon throughout the app for contextual guidance on specific features.
```

Create `apps/web/src/content/help/getting-started/understanding-your-dashboard.mdx`:

```mdx
---
title: "Understanding Your Dashboard"
description: "A tour of your PropertyPro dashboard — what each section means and how to use it."
category: "getting-started"
slug: "understanding-your-dashboard"
roles: []
keywords: ["dashboard", "home", "overview", "navigation", "layout"]
relatedArticles: ["welcome-to-propertypro"]
featured: true
---

# Understanding Your Dashboard

Your dashboard is the first thing you see after logging in. It shows a personalized snapshot of your community.

## Dashboard Sections

### Recent Announcements
The latest updates from your community management. These might include meeting notices, policy changes, or general community news.

### Compliance Overview
For board members and managers, this section shows your community's compliance score — a measure of how well your association meets Florida statutory requirements.

<Callout type="florida-statute" title="Why compliance matters">
Florida Statute §718.111(12)(g) requires condominium associations with 25 or more units to maintain a website with specific document posting requirements. Your compliance score tracks adherence to these and other statutory obligations.
</Callout>

### Quick Actions
Shortcuts to common tasks based on your role. Residents see options like submitting maintenance requests, while managers see document uploads and resident management.
```

Create `apps/web/src/content/help/compliance/compliance-scoring-explained.mdx`:

```mdx
---
title: "Understanding Your Compliance Score"
description: "How PropertyPro calculates your community's compliance score and what actions improve it."
category: "compliance"
slug: "compliance-scoring-explained"
roles: ["board_member", "board_president", "cam", "property_manager_admin"]
keywords: ["compliance", "score", "percentage", "documents", "posting", "statute"]
relatedArticles: ["document-posting-requirements"]
featured: true
contextPaths: ["/communities/*/compliance", "/compliance"]
---

# Understanding Your Compliance Score

Your compliance score is a percentage that reflects how well your community meets Florida's statutory requirements for document posting, meeting notices, and record-keeping.

## How the Score Is Calculated

The score considers several factors:

- **Document posting timeliness** — Are required documents posted within 30 days of creation?
- **Meeting notice compliance** — Are owner meeting notices posted 14 days in advance? Are board meeting notices posted 48 hours ahead?
- **Required document categories** — Does your community have all statutorily required document types posted?

<Callout type="info" title="Score ranges">
A score above 90% indicates strong compliance. Between 70-90% means there are items to address. Below 70% requires immediate attention to avoid potential statutory violations.
</Callout>

## Improving Your Score

The compliance dashboard highlights specific actions you can take to improve your score. Common improvements include:

1. Uploading missing required documents
2. Posting overdue meeting minutes
3. Ensuring meeting notices are created with sufficient lead time

<Callout type="florida-statute" title="§718.111(12)(g)">
Condominium associations with 25 or more units must post official records on their website within a reasonable time after the records are created. PropertyPro considers the 30-day posting window the standard benchmark.
</Callout>
```

Create `apps/web/src/content/help/compliance/document-posting-requirements.mdx`:

```mdx
---
title: "Document Posting Requirements"
description: "Which documents must be posted and the timelines for compliance."
category: "compliance"
slug: "document-posting-requirements"
roles: ["board_member", "board_president", "cam", "property_manager_admin"]
keywords: ["documents", "posting", "requirements", "timeline", "30 days", "statute"]
relatedArticles: ["compliance-scoring-explained", "uploading-documents"]
featured: false
contextPaths: ["/communities/*/documents", "/documents"]
---

# Document Posting Requirements

Florida statute requires associations to maintain and post specific categories of documents. This guide covers what must be posted, when, and how it affects your compliance score.

## Required Document Categories

Condominium associations under §718.111(12)(g) must post:

- **Governing documents** — Declaration of condominium, articles of incorporation, bylaws
- **Financial records** — Annual budget, financial statements, reserve studies
- **Meeting records** — Board and owner meeting minutes, agendas, notices
- **Insurance** — Current insurance policies and certificates
- **Contracts** — Vendor agreements above a threshold set by your bylaws

<Callout type="warning" title="30-day posting window">
Documents should be posted within 30 days of creation to maintain full compliance. Documents posted after 30 days still count but will temporarily reduce your compliance score.
</Callout>

## How to Post a Document

1. Navigate to **Documents** from the sidebar
2. Click **Upload Document**
3. Select the appropriate category
4. Add a title and optional description
5. Upload the file and confirm

Your compliance score updates automatically after each upload.
```

Create `apps/web/src/content/help/documents/uploading-documents.mdx`:

```mdx
---
title: "Uploading Documents"
description: "How to upload, categorize, and manage documents in PropertyPro."
category: "documents"
slug: "uploading-documents"
roles: ["board_member", "board_president", "cam", "property_manager_admin"]
keywords: ["upload", "document", "file", "pdf", "category", "add"]
relatedArticles: ["document-posting-requirements"]
featured: false
contextPaths: ["/communities/*/documents", "/documents"]
---

# Uploading Documents

Keeping your document library current is essential for compliance. This guide walks through uploading and organizing documents.

## Uploading a New Document

<StepByStep>
<Step title="Navigate to Documents">
Click **Documents** in the sidebar navigation. You'll see your community's document library organized by category.
</Step>

<Step title="Click Upload Document">
The upload button is at the top of the page. Click it to open the upload form.
</Step>

<Step title="Fill in the details">
Select the appropriate **category** for the document (e.g., Financial Records, Meeting Minutes). Add a clear **title** and optional **description** so residents can find it easily.
</Step>

<Step title="Upload and confirm">
Select the file from your computer. Supported formats include PDF, Word documents, and images. Click **Upload** to add it to the library.
</Step>
</StepByStep>

<Callout type="tip" title="Category matters">
Choosing the right category helps your compliance score. A financial statement filed under "General" won't count toward the financial records compliance requirement.
</Callout>
```

Create `apps/web/src/content/help/maintenance/submitting-a-request.mdx`:

```mdx
---
title: "Submitting a Maintenance Request"
description: "How to submit, track, and follow up on maintenance requests in your community."
category: "maintenance"
slug: "submitting-a-request"
roles: []
keywords: ["maintenance", "request", "repair", "submit", "track", "status"]
relatedArticles: []
featured: true
contextPaths: ["/communities/*/operations", "/operations", "/maintenance"]
---

# Submitting a Maintenance Request

When something in your community needs repair or attention, you can submit a maintenance request through PropertyPro. Your management team will be notified and can track the request through resolution.

## How to Submit

<StepByStep>
<Step title="Go to Operations">
Click **Operations** in the sidebar, then select the **Requests** tab.
</Step>

<Step title="Click Submit Request">
Click the submit button to open the request form.
</Step>

<Step title="Describe the issue">
Provide a clear **title** (e.g., "Lobby light fixture broken") and a detailed **description** of what needs attention. Include the location and any relevant details.
</Step>

<Step title="Add photos">
If possible, attach photos of the issue. This helps your maintenance team understand the problem before arriving on site.
</Step>

<Step title="Submit">
Review your request and click **Submit**. You'll receive a confirmation and can track the status from the Operations page.
</Step>
</StepByStep>

## Tracking Your Request

After submission, your request will show one of these statuses:

- **Open** — Request received, awaiting assignment
- **In Progress** — Work is underway
- **Completed** — Issue has been resolved
- **Closed** — Request closed (resolved or declined)

You'll receive notifications when your request status changes.
```

Create `apps/web/src/content/help/meetings/meeting-notices-explained.mdx`:

```mdx
---
title: "Meeting Notices Explained"
description: "Understanding meeting notice requirements and how PropertyPro helps you stay compliant."
category: "meetings"
slug: "meeting-notices-explained"
roles: ["board_member", "board_president", "cam", "property_manager_admin"]
keywords: ["meeting", "notice", "14 days", "48 hours", "board", "owner", "agenda"]
relatedArticles: ["compliance-scoring-explained"]
featured: false
contextPaths: ["/communities/*/meetings", "/meetings"]
---

# Meeting Notices Explained

Florida statute sets specific notice periods for different types of association meetings. PropertyPro tracks these timelines and alerts you when notices are due.

## Notice Requirements

| Meeting Type | Required Notice | Statute |
|---|---|---|
| **Owner meetings** | 14 days before the meeting | §718.112(2)(d) |
| **Board meetings** | 48 hours before the meeting | §718.112(2)(c) |
| **Budget meetings** | 14 days, with proposed budget | §718.112(2)(f) |

<Callout type="florida-statute" title="Notice content requirements">
Meeting notices must include the date, time, location, and agenda. For budget meetings, the proposed budget must be included with the notice.
</Callout>

## How PropertyPro Helps

When you create a meeting in PropertyPro:

1. The system calculates the required notice period based on meeting type
2. If the meeting date doesn't allow enough notice time, you'll see a warning
3. Once posted, the notice is automatically tracked for compliance scoring
4. Residents are notified according to their notification preferences

<Callout type="warning" title="Late notices">
Posting a meeting notice after the required period doesn't invalidate the meeting, but it will reduce your compliance score. Plan meetings with enough lead time for proper notice.
</Callout>
```

- [ ] **Step 2: Verify articles are parseable**

```bash
cd /Users/jphilistin/Documents/Coding/PropertyPro
node -e "
const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const dir = 'apps/web/src/content/help';
let count = 0;
for (const cat of fs.readdirSync(dir)) {
  const catPath = path.join(dir, cat);
  if (!fs.statSync(catPath).isDirectory()) continue;
  for (const f of fs.readdirSync(catPath).filter(f => f.endsWith('.mdx'))) {
    const { data } = matter(fs.readFileSync(path.join(catPath, f), 'utf-8'));
    console.log('OK:', data.slug, '(', data.category, ')');
    count++;
  }
}
console.log('Total:', count, 'articles');
"
```

Expected: 7 articles parsed, each showing slug and category.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/content/help/
git commit -m "content: add 7 initial help center articles across 4 categories"
```

---

## Layer 3: Pages

### Task 6: Article Page — `/help/[category]/[slug]`

**Files:**
- Create: `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx`

- [ ] **Step 1: Add /help to middleware PROTECTED_PATH_PREFIXES**

In `apps/web/src/middleware.ts`, add `'/help'` to the `PROTECTED_PATH_PREFIXES` array:

```typescript
const PROTECTED_PATH_PREFIXES = [
  '/dashboard',
  '/help',
  '/select-community',
  // ... rest unchanged
];
```

- [ ] **Step 2: Create the article page**

Create `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx`:

```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { compileMDX } from 'next-mdx-remote/rsc';
import { ChevronRight } from 'lucide-react';
import { getArticleBySlug, getAllArticles } from '@/lib/services/help-article-service';
import { helpMdxComponents } from '@/components/help/mdx-components';

interface ArticlePageProps {
  params: Promise<{ category: string; slug: string }>;
}

export default async function HelpArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const { metadata, rawContent } = article;

  const { content } = await compileMDX({
    source: rawContent,
    components: helpMdxComponents,
  });

  // Build related articles list from frontmatter
  const allArticles = getAllArticles();
  const relatedArticles = metadata.relatedArticles
    .map((relSlug) => allArticles.find((a) => a.slug === relSlug))
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-content-tertiary">
        <Link href="/help" className="hover:text-content-secondary transition-colors">
          Help
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link
          href={`/help/${metadata.category}`}
          className="capitalize hover:text-content-secondary transition-colors"
        >
          {metadata.category.replace(/-/g, ' ')}
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="text-content-secondary">{metadata.title}</span>
      </nav>

      {/* Article header */}
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-content lg:text-3xl">
          {metadata.title}
        </h1>
        <p className="mt-2 text-base text-content-secondary">
          {metadata.description}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-content-tertiary">
          <span>{metadata.readTimeMinutes} min read</span>
          {metadata.roles.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <div className="flex gap-1.5">
                {metadata.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-surface-muted px-2 py-0.5 text-content-tertiary capitalize"
                  >
                    {role.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {/* MDX content */}
      <article className="prose prose-stone max-w-none [&>h2]:mt-8 [&>h2]:mb-4 [&>h2]:text-xl [&>h2]:font-semibold [&>h3]:mt-6 [&>h3]:mb-3 [&>h3]:text-lg [&>h3]:font-medium [&>p]:my-4 [&>p]:leading-relaxed [&>p]:text-content-secondary [&>ul]:my-4 [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:space-y-2 [&>ul]:text-content-secondary [&>ol]:my-4 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:space-y-2 [&>ol]:text-content-secondary [&>table]:my-6 [&>table]:w-full [&>table]:text-sm [&_th]:border [&_th]:border-edge [&_th]:bg-surface-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:border [&_td]:border-edge [&_td]:px-3 [&_td]:py-2">
        {content}
      </article>

      {/* Related articles */}
      {relatedArticles.length > 0 && (
        <aside className="mt-12 border-t border-edge pt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-tertiary">
            Related Articles
          </h2>
          <div className="space-y-3">
            {relatedArticles.map((related) => (
              <Link
                key={related!.slug}
                href={`/help/${related!.category}/${related!.slug}`}
                className="block rounded-[var(--radius-md)] border border-edge p-4 transition-colors hover:bg-surface-muted"
              >
                <p className="text-sm font-medium text-content">
                  {related!.title}
                </p>
                <p className="mt-1 text-xs text-content-tertiary">
                  {related!.description}
                </p>
              </Link>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm typecheck
```

Expected: Clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/help/ apps/web/src/middleware.ts
git commit -m "feat: add help article page with MDX rendering and related articles"
```

---

### Task 7: Help Hub + Category Pages

**Files:**
- Create: `apps/web/src/app/(authenticated)/help/page.tsx`
- Create: `apps/web/src/app/(authenticated)/help/[category]/page.tsx`
- Modify: `apps/web/src/components/layout/nav-config.ts`

- [ ] **Step 1: Add help to PAGE_TITLES in nav-config**

In `apps/web/src/components/layout/nav-config.ts`, add to the `PAGE_TITLES` record:

```typescript
  help: { title: 'Help Center', subtitle: 'Guides, FAQs, and support' },
```

- [ ] **Step 2: Create the help search input component**

Create `apps/web/src/components/help/help-search-input.tsx`:

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpSearchInputProps {
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function HelpSearchInput({
  defaultValue = '',
  placeholder = 'Search help articles...',
  className,
  autoFocus = false,
}: HelpSearchInputProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      router.push(`/help/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} role="search" className={cn('relative', className)}>
      <Search
        className="absolute left-4 top-1/2 -translate-y-1/2 text-content-disabled"
        size={18}
        aria-hidden="true"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-[var(--radius-md)] border border-edge bg-surface-card py-3 pl-11 pr-4 text-sm text-content placeholder:text-content-placeholder transition-colors focus-visible:border-edge-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
    </form>
  );
}
```

- [ ] **Step 3: Create the help hub page**

Create `apps/web/src/app/(authenticated)/help/page.tsx`:

```typescript
import { headers } from 'next/headers';
import Link from 'next/link';
import { ChevronRight, BookOpen } from 'lucide-react';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { createScopedClient, faqs } from '@propertypro/db';
import { ensureFaqsExist } from '@/lib/services/faq-service';
import {
  getFeaturedForRole,
  getCategoryTree,
} from '@/lib/services/help-article-service';
import { HelpSearchInput } from '@/components/help/help-search-input';
import { PageHeader } from '@/components/shared/page-header';

export default async function HelpHubPage() {
  const requestHeaders = await headers();
  const communityId = Number(requestHeaders.get('x-community-id'));
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  const role = membership.role as string;

  // Fetch featured articles and category tree
  const featured = getFeaturedForRole(role);
  const categoryTree = getCategoryTree();
  const categories = Object.entries(categoryTree);

  // Fetch community FAQs
  await ensureFaqsExist(communityId);
  const scoped = createScopedClient(communityId);
  const faqRows = await scoped.query(faqs);
  const sortedFaqs = [...faqRows].sort(
    (a, b) => ((a['sortOrder'] as number) ?? 0) - ((b['sortOrder'] as number) ?? 0),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
      <PageHeader title="Help Center" subtitle="Guides, FAQs, and support" />

      {/* Search */}
      <HelpSearchInput className="mt-6" placeholder={
        membership.isAdmin
          ? 'Search compliance guides, admin tools...'
          : 'Search help articles...'
      } />

      {/* Featured quick links */}
      {featured.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-tertiary">
            Quick Links
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {featured.map((article) => (
              <Link
                key={article.slug}
                href={`/help/${article.category}/${article.slug}`}
                className="group flex items-start gap-3 rounded-[var(--radius-md)] border border-edge bg-surface-card p-4 transition-colors hover:bg-surface-muted"
              >
                <BookOpen size={18} className="mt-0.5 shrink-0 text-[var(--interactive-primary)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content group-hover:text-[var(--interactive-primary)]">
                    {article.title}
                  </p>
                  <p className="mt-1 text-xs text-content-tertiary line-clamp-2">
                    {article.description}
                  </p>
                </div>
                <ChevronRight size={14} className="mt-1 shrink-0 text-content-disabled" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Categories */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-content-tertiary">
          Browse by Category
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {categories.map(([category, articles]) => (
            <Link
              key={category}
              href={`/help/${category}`}
              className="group rounded-[var(--radius-md)] border border-edge bg-surface-card p-5 transition-colors hover:bg-surface-muted"
            >
              <h3 className="text-base font-medium capitalize text-content group-hover:text-[var(--interactive-primary)]">
                {category.replace(/-/g, ' ')}
              </h3>
              <p className="mt-1 text-xs text-content-tertiary">
                {articles.length} {articles.length === 1 ? 'article' : 'articles'}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Community FAQs */}
      {sortedFaqs.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-content-tertiary">
              Community FAQs
            </h2>
            {membership.isAdmin && (
              <Link href="/help/manage" className="text-xs text-[var(--interactive-primary)] hover:underline">
                Manage FAQs
              </Link>
            )}
          </div>
          <div className="mt-4 divide-y divide-edge overflow-hidden rounded-[var(--radius-md)] border border-edge bg-surface-card">
            {sortedFaqs.slice(0, 5).map((faq) => (
              <details key={faq['id'] as number} className="group">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-3.5 text-sm font-medium text-content hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
                  <ChevronRight size={14} className="shrink-0 text-content-disabled transition-transform group-open:rotate-90" aria-hidden="true" />
                  {faq['question'] as string}
                </summary>
                <div className="px-4 pb-4 pl-10 text-sm leading-relaxed text-content-secondary">
                  {faq['answer'] as string}
                </div>
              </details>
            ))}
          </div>
          {sortedFaqs.length > 5 && (
            <p className="mt-3 text-center text-xs text-content-tertiary">
              Showing 5 of {sortedFaqs.length} FAQs.{' '}
              <Link href="/help/manage" className="text-[var(--interactive-primary)] hover:underline">
                View all
              </Link>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the category listing page**

Create `apps/web/src/app/(authenticated)/help/[category]/page.tsx`:

```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { headers } from 'next/headers';
import { ChevronRight, Clock } from 'lucide-react';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getCategoryTree } from '@/lib/services/help-article-service';
import { HelpSearchInput } from '@/components/help/help-search-input';

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export default async function HelpCategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;
  const requestHeaders = await headers();
  const communityId = Number(requestHeaders.get('x-community-id'));
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  const role = membership.role as string;

  const categoryTree = getCategoryTree();
  const articles = categoryTree[category];

  if (!articles || articles.length === 0) {
    notFound();
  }

  // Sort: role-matched first, then alphabetical
  const sorted = [...articles].sort((a, b) => {
    const aMatch = a.roles.length === 0 || a.roles.includes(role) ? 0 : 1;
    const bMatch = b.roles.length === 0 || b.roles.includes(role) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return a.title.localeCompare(b.title);
  });

  const categoryLabel = category.replace(/-/g, ' ');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-content-tertiary">
        <Link href="/help" className="hover:text-content-secondary transition-colors">
          Help
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="capitalize text-content-secondary">{categoryLabel}</span>
      </nav>

      <h1 className="text-2xl font-semibold capitalize text-content">
        {categoryLabel}
      </h1>
      <p className="mt-1 text-sm text-content-tertiary">
        {sorted.length} {sorted.length === 1 ? 'article' : 'articles'}
      </p>

      <HelpSearchInput className="mt-6" />

      <div className="mt-6 space-y-3">
        {sorted.map((article) => (
          <Link
            key={article.slug}
            href={`/help/${article.category}/${article.slug}`}
            className="group block rounded-[var(--radius-md)] border border-edge bg-surface-card p-4 transition-colors hover:bg-surface-muted"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-content group-hover:text-[var(--interactive-primary)]">
                  {article.title}
                </p>
                <p className="mt-1 text-xs text-content-tertiary line-clamp-2">
                  {article.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-xs text-content-disabled">
                <Clock size={12} aria-hidden="true" />
                <span>{article.readTimeMinutes} min</span>
              </div>
            </div>
            {article.roles.length > 0 && (
              <div className="mt-2 flex gap-1.5">
                {article.roles.slice(0, 3).map((r) => (
                  <span key={r} className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-content-tertiary capitalize">
                    {r.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/help/page.tsx apps/web/src/app/\(authenticated\)/help/\[category\]/page.tsx apps/web/src/components/help/help-search-input.tsx apps/web/src/components/layout/nav-config.ts
git commit -m "feat: add help hub and category listing pages"
```

---

### Task 8: Search Page + Search API Route

**Files:**
- Create: `apps/web/src/app/(authenticated)/help/search/page.tsx`
- Create: `apps/web/src/app/api/v1/help/search/route.ts`

- [ ] **Step 1: Create the search API route**

Create `apps/web/src/app/api/v1/help/search/route.ts`:

```typescript
/**
 * Help Search API
 *
 * GET /api/v1/help/search?q=...&communityId=N
 *
 * Searches platform articles (filesystem) and community FAQs (DB) in parallel.
 * Returns two separate arrays — no cross-source ranking.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient, faqs } from '@propertypro/db';
import { sql } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { getAllArticles, searchArticles } from '@/lib/services/help-article-service';

const searchSchema = z.object({
  q: z.string().min(2).max(200),
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = searchSchema.safeParse({
    q: searchParams.get('q'),
    communityId: searchParams.get('communityId'),
  });

  if (!parsed.success) {
    throw new ValidationError('Invalid search parameters');
  }

  const { q } = parsed.data;
  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  // Search both sources in parallel
  const allArticles = getAllArticles();
  const articleResults = searchArticles(allArticles, q);

  const scoped = createScopedClient(communityId);
  const faqRows = await scoped.query(faqs);
  const qLower = q.toLowerCase();
  const faqResults = faqRows
    .filter((f) => {
      const question = (f['question'] as string).toLowerCase();
      const answer = (f['answer'] as string).toLowerCase();
      return question.includes(qLower) || answer.includes(qLower);
    })
    .slice(0, 10);

  return NextResponse.json({
    data: {
      articles: articleResults.map((a) => ({
        title: a.title,
        description: a.description,
        category: a.category,
        slug: a.slug,
        roles: a.roles,
        readTimeMinutes: a.readTimeMinutes,
      })),
      faqs: faqResults.map((f) => ({
        id: f['id'] as number,
        question: f['question'] as string,
        answer: f['answer'] as string,
      })),
    },
  });
});
```

- [ ] **Step 2: Create the search results page**

Create `apps/web/src/app/(authenticated)/help/search/page.tsx`:

```typescript
import Link from 'next/link';
import { headers } from 'next/headers';
import { ChevronRight, Clock, FileText, MessageCircleQuestion } from 'lucide-react';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getAllArticles, searchArticles } from '@/lib/services/help-article-service';
import { createScopedClient, faqs } from '@propertypro/db';
import { ensureFaqsExist } from '@/lib/services/faq-service';
import { HelpSearchInput } from '@/components/help/help-search-input';

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HelpSearchPage({ searchParams }: SearchPageProps) {
  const resolved = await searchParams;
  const query = typeof resolved.q === 'string' ? resolved.q.trim() : '';
  const requestHeaders = await headers();
  const communityId = Number(requestHeaders.get('x-community-id'));
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  let articleResults: { title: string; description: string; category: string; slug: string; readTimeMinutes: number }[] = [];
  let faqResults: { id: number; question: string; answer: string }[] = [];

  if (query.length >= 2) {
    // Search platform articles
    const allArticles = getAllArticles();
    articleResults = searchArticles(allArticles, query);

    // Search community FAQs
    await ensureFaqsExist(communityId);
    const scoped = createScopedClient(communityId);
    const faqRows = await scoped.query(faqs);
    const qLower = query.toLowerCase();
    faqResults = faqRows
      .filter((f) => {
        const question = (f['question'] as string).toLowerCase();
        const answer = (f['answer'] as string).toLowerCase();
        return question.includes(qLower) || answer.includes(qLower);
      })
      .slice(0, 10)
      .map((f) => ({
        id: f['id'] as number,
        question: f['question'] as string,
        answer: f['answer'] as string,
      }));
  }

  const hasResults = articleResults.length > 0 || faqResults.length > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-content-tertiary">
        <Link href="/help" className="hover:text-content-secondary transition-colors">Help</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="text-content-secondary">Search</span>
      </nav>

      <HelpSearchInput defaultValue={query} autoFocus />

      {query.length >= 2 && !hasResults && (
        <div className="mt-12 text-center">
          <p className="text-sm text-content-secondary">
            No results found for &ldquo;{query}&rdquo;
          </p>
          <p className="mt-1 text-xs text-content-tertiary">
            Try different keywords or <Link href="/help" className="text-[var(--interactive-primary)] hover:underline">browse all categories</Link>.
          </p>
        </div>
      )}

      {articleResults.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-content-tertiary">
            <FileText size={14} aria-hidden="true" />
            Platform Guides ({articleResults.length})
          </h2>
          <div className="space-y-3">
            {articleResults.map((article) => (
              <Link
                key={article.slug}
                href={`/help/${article.category}/${article.slug}`}
                className="group block rounded-[var(--radius-md)] border border-edge bg-surface-card p-4 transition-colors hover:bg-surface-muted"
              >
                <p className="text-sm font-medium text-content group-hover:text-[var(--interactive-primary)]">
                  {article.title}
                </p>
                <p className="mt-1 text-xs text-content-tertiary line-clamp-2">
                  {article.description}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-content-disabled">
                  <span className="capitalize">{article.category.replace(/-/g, ' ')}</span>
                  <span aria-hidden="true">·</span>
                  <Clock size={10} aria-hidden="true" />
                  <span>{article.readTimeMinutes} min</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {faqResults.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-content-tertiary">
            <MessageCircleQuestion size={14} aria-hidden="true" />
            Community FAQs ({faqResults.length})
          </h2>
          <div className="divide-y divide-edge overflow-hidden rounded-[var(--radius-md)] border border-edge bg-surface-card">
            {faqResults.map((faq) => (
              <details key={faq.id} className="group">
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-3.5 text-sm font-medium text-content hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
                  <ChevronRight size={14} className="shrink-0 text-content-disabled transition-transform group-open:rotate-90" aria-hidden="true" />
                  {faq.question}
                </summary>
                <div className="px-4 pb-4 pl-10 text-sm leading-relaxed text-content-secondary">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1/help/search/ apps/web/src/app/\(authenticated\)/help/search/
git commit -m "feat: add help search API route and search results page"
```

---

## Layer 4: Widget & Navigation Integration

### Task 9: Contextual API Route + TanStack Query Hook

**Files:**
- Create: `apps/web/src/app/api/v1/help/contextual/route.ts`
- Create: `apps/web/src/hooks/use-help.ts`

- [ ] **Step 1: Create the contextual API route**

Create `apps/web/src/app/api/v1/help/contextual/route.ts`:

```typescript
/**
 * Help Contextual API
 *
 * GET /api/v1/help/contextual?path=/compliance&communityId=N
 *
 * Returns up to 3 platform articles relevant to the given route path,
 * filtered by the user's role.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { getContextualArticles } from '@/lib/services/help-article-service';

const querySchema = z.object({
  path: z.string().min(1),
  communityId: z.coerce.number().int().positive(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    path: searchParams.get('path'),
    communityId: searchParams.get('communityId'),
  });

  if (!parsed.success) {
    throw new ValidationError('Invalid contextual help parameters');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  const role = membership.role as string;

  const articles = getContextualArticles(parsed.data.path, role, 3);

  return NextResponse.json({
    data: articles.map((a) => ({
      title: a.title,
      description: a.description,
      category: a.category,
      slug: a.slug,
    })),
  });
});
```

- [ ] **Step 2: Create the TanStack Query hook**

Create `apps/web/src/hooks/use-help.ts`:

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Query Keys
// ---------------------------------------------------------------------------

export const HELP_KEYS = {
  search: (query: string, communityId: number) =>
    ['help', 'search', query, communityId] as const,
  contextual: (path: string, communityId: number) =>
    ['help', 'contextual', path, communityId] as const,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HelpArticleResult {
  title: string;
  description: string;
  category: string;
  slug: string;
  readTimeMinutes?: number;
  roles?: string[];
}

export interface HelpFaqResult {
  id: number;
  question: string;
  answer: string;
}

interface HelpSearchResponse {
  articles: HelpArticleResult[];
  faqs: HelpFaqResult[];
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useHelpSearch(query: string, communityId: number) {
  return useQuery<HelpSearchResponse>({
    queryKey: HELP_KEYS.search(query, communityId),
    queryFn: async () => {
      const params = new URLSearchParams({
        q: query,
        communityId: String(communityId),
      });
      const res = await fetch(`/api/v1/help/search?${params}`);
      if (!res.ok) throw new Error('Failed to search help articles');
      const json = (await res.json()) as { data: HelpSearchResponse };
      return json.data;
    },
    enabled: query.length >= 2 && communityId > 0,
    staleTime: 60_000,
  });
}

export function useContextualHelp(path: string, communityId: number) {
  return useQuery<HelpArticleResult[]>({
    queryKey: HELP_KEYS.contextual(path, communityId),
    queryFn: async () => {
      const params = new URLSearchParams({
        path,
        communityId: String(communityId),
      });
      const res = await fetch(`/api/v1/help/contextual?${params}`);
      if (!res.ok) throw new Error('Failed to fetch contextual help');
      const json = (await res.json()) as { data: HelpArticleResult[] };
      return json.data;
    },
    enabled: path.length > 0 && communityId > 0,
    staleTime: 300_000,
  });
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1/help/contextual/ apps/web/src/hooks/use-help.ts
git commit -m "feat: add contextual help API route and TanStack Query hooks"
```

---

### Task 10: Help Widget — Provider + Drawer Component

**Files:**
- Create: `apps/web/src/components/help/help-widget-provider.tsx`
- Create: `apps/web/src/components/help/help-widget.tsx`
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`

- [ ] **Step 1: Create the help widget provider**

Create `apps/web/src/components/help/help-widget-provider.tsx`:

```typescript
'use client';

/**
 * Help Widget state context — manages open/close state for the help drawer.
 * Follows the same pattern as sidebar-context.tsx.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface HelpWidgetContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const HelpWidgetContext = createContext<HelpWidgetContextValue | null>(null);

export function HelpWidgetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // ? keyboard shortcut (only on pointer devices, not in inputs)
  useEffect(() => {
    const isPointerDevice = window.matchMedia('(pointer: fine)').matches;
    if (!isPointerDevice) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <HelpWidgetContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </HelpWidgetContext.Provider>
  );
}

export function useHelpWidget(): HelpWidgetContextValue {
  const ctx = useContext(HelpWidgetContext);
  if (!ctx) {
    throw new Error('useHelpWidget must be used within a HelpWidgetProvider');
  }
  return ctx;
}
```

- [ ] **Step 2: Create the help widget drawer**

Create `apps/web/src/components/help/help-widget.tsx`:

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, Search, BookOpen, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHelpWidget } from './help-widget-provider';
import { useHelpSearch, useContextualHelp, type HelpArticleResult } from '@/hooks/use-help';

interface HelpWidgetProps {
  communityId: number;
}

function ArticleLink({ article }: { article: HelpArticleResult }) {
  const { close } = useHelpWidget();
  return (
    <Link
      href={`/help/${article.category}/${article.slug}`}
      onClick={close}
      className="flex items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 transition-colors hover:bg-surface-muted"
    >
      <BookOpen size={14} className="mt-0.5 shrink-0 text-content-disabled" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-content">{article.title}</p>
        <p className="mt-0.5 text-xs text-content-tertiary line-clamp-1">{article.description}</p>
      </div>
      <ChevronRight size={12} className="mt-1 shrink-0 text-content-disabled" aria-hidden="true" />
    </Link>
  );
}

export function HelpWidget({ communityId }: HelpWidgetProps) {
  const { isOpen, close } = useHelpWidget();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: searchResults } = useHelpSearch(searchQuery, communityId);
  const { data: contextualArticles } = useContextualHelp(pathname, communityId);

  const isSearching = searchQuery.length >= 2;
  const hasSearchResults = searchResults && (searchResults.articles.length > 0 || searchResults.faqs.length > 0);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-edge bg-surface-page shadow-xl transition-transform duration-200',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-label="Help panel"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="text-sm font-semibold text-content">Help</h2>
          <button
            type="button"
            onClick={close}
            className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-content-tertiary transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            aria-label="Close help panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-edge-subtle px-4 py-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-disabled" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help..."
              className="w-full rounded-[var(--radius-sm)] border border-edge bg-surface-card py-2 pl-9 pr-3 text-sm text-content placeholder:text-content-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Search results */}
          {isSearching && hasSearchResults && (
            <div className="space-y-4">
              {searchResults!.articles.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">Guides</h3>
                  <div className="space-y-0.5">
                    {searchResults!.articles.map((a) => (
                      <ArticleLink key={a.slug} article={a} />
                    ))}
                  </div>
                </section>
              )}
              {searchResults!.faqs.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">FAQs</h3>
                  <div className="space-y-1">
                    {searchResults!.faqs.map((faq) => (
                      <details key={faq.id} className="group rounded-[var(--radius-sm)] hover:bg-surface-muted">
                        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-content [&::-webkit-details-marker]:hidden">
                          <ChevronRight size={12} className="shrink-0 text-content-disabled transition-transform group-open:rotate-90" aria-hidden="true" />
                          {faq.question}
                        </summary>
                        <div className="px-3 pb-2 pl-7 text-xs leading-relaxed text-content-secondary">
                          {faq.answer}
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {isSearching && !hasSearchResults && (
            <p className="py-8 text-center text-sm text-content-tertiary">
              No results for &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {/* Contextual suggestions (shown when not searching) */}
          {!isSearching && contextualArticles && contextualArticles.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
                Relevant to this page
              </h3>
              <div className="space-y-0.5">
                {contextualArticles.map((a) => (
                  <ArticleLink key={a.slug} article={a} />
                ))}
              </div>
            </section>
          )}

          {!isSearching && (!contextualArticles || contextualArticles.length === 0) && (
            <div className="py-8 text-center">
              <p className="text-sm text-content-secondary">
                Search for help or browse the full help center.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-edge px-4 py-3">
          <Link
            href="/help"
            onClick={close}
            className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-surface-muted px-4 py-2.5 text-sm font-medium text-content transition-colors hover:bg-surface-hover"
          >
            <ExternalLink size={14} aria-hidden="true" />
            Visit Help Center
          </Link>
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 3: Mount the provider and widget in the authenticated layout**

In `apps/web/src/app/(authenticated)/layout.tsx`, add the imports and wrap:

Add imports at top:
```typescript
import { HelpWidgetProvider } from '@/components/help/help-widget-provider';
import { HelpWidget } from '@/components/help/help-widget';
```

Wrap children inside the `<MotionProvider>` block — add `<HelpWidgetProvider>` and `<HelpWidget>`:

```typescript
<MotionProvider>
  <HelpWidgetProvider>
    <AppShell user={user} community={community} role={role} features={features} resourceAccess={resourceAccess} subscriptionStatus={subscriptionStatus} freeAccessExpiresAt={freeAccessExpiresAt} demoInfo={demoInfo}>
      {children}
    </AppShell>
    <HelpWidget communityId={community?.id ?? 0} />
  </HelpWidgetProvider>
</MotionProvider>
```

- [ ] **Step 4: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/help/help-widget-provider.tsx apps/web/src/components/help/help-widget.tsx apps/web/src/app/\(authenticated\)/layout.tsx
git commit -m "feat: add help widget drawer with search and contextual suggestions"
```

---

### Task 11: Navigation Integration — Top Bar, Command Palette, Profile Menu

**Files:**
- Modify: `apps/web/src/components/layout/app-top-bar.tsx`
- Modify: `apps/web/src/components/layout/command-palette.tsx`
- Modify: `apps/web/src/components/layout/profile-menu.tsx`

- [ ] **Step 1: Add ? button to top bar**

In `apps/web/src/components/layout/app-top-bar.tsx`:

Add import:
```typescript
import { CircleHelp } from 'lucide-react';
import { useHelpWidget } from '@/components/help/help-widget-provider';
```

Inside the component, add:
```typescript
const { toggle: toggleHelp } = useHelpWidget();
```

In the utility row `<div className="ml-auto flex shrink-0 items-center gap-1.5 lg:gap-2">`, add the help button before `<CommunitySwitcher />`:

```tsx
<button
  type="button"
  onClick={toggleHelp}
  className="flex size-11 items-center justify-center rounded-[var(--radius-md)] text-content-tertiary transition-colors duration-quick hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:size-9"
  aria-label="Open help"
  title="Help (?)"
>
  <CircleHelp size={18} aria-hidden="true" />
</button>
```

- [ ] **Step 2: Add Help Center to command palette**

In `apps/web/src/components/layout/command-palette.tsx`:

Add import:
```typescript
import { CircleHelp } from 'lucide-react';
```

In the `getCommandItems` function, add to the `globalItems` array:

```typescript
{ id: 'help', label: 'Help Center', icon: CircleHelp, href: '/help', group: 'page', keywords: 'help support faq guide documentation' },
```

- [ ] **Step 3: Add Help link to profile menu**

In `apps/web/src/components/layout/profile-menu.tsx`:

Add import:
```typescript
import { CircleHelp } from 'lucide-react';
```

Add a Help menu item between the Settings and Data Export items:

```tsx
<DropdownMenuItem asChild>
  <Link href="/help" onClick={() => setOpen(false)}>
    <CircleHelp className="mr-2 size-4 text-content-disabled" />
    Help
  </Link>
</DropdownMenuItem>
```

- [ ] **Step 4: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/app-top-bar.tsx apps/web/src/components/layout/command-palette.tsx apps/web/src/components/layout/profile-menu.tsx
git commit -m "feat: add help button to top bar, command palette, and profile menu"
```

---

### Task 12: HelpLink Component + Contextual Placements

**Files:**
- Create: `apps/web/src/components/help/help-link.tsx`

- [ ] **Step 1: Create the HelpLink component**

Create `apps/web/src/components/help/help-link.tsx`:

```typescript
import Link from 'next/link';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpLinkProps {
  category: string;
  slug: string;
  label?: string;
  className?: string;
}

/**
 * Contextual help link — renders a small ? icon that links to a help article.
 *
 * Intentionally simple (no server-side slug validation).
 * If the article doesn't exist, the link 404s — a natural signal to update.
 */
export function HelpLink({ category, slug, label, className }: HelpLinkProps) {
  return (
    <Link
      href={`/help/${category}/${slug}`}
      className={cn(
        'inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-[var(--interactive-primary)]',
        className,
      )}
      title={label ?? 'Learn more'}
    >
      <CircleHelp size={14} aria-hidden="true" />
      {label && <span>{label}</span>}
    </Link>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/help/help-link.tsx
git commit -m "feat: add HelpLink contextual help component"
```

**Note to implementer:** Placing `HelpLink` on specific feature pages (compliance dashboard, document upload, meeting notices, violation reporting, e-sign) should be done incrementally as a follow-up — each placement is a 1-line change in the relevant page component. Example:

```tsx
import { HelpLink } from '@/components/help/help-link';
// In the page header or relevant section:
<HelpLink category="compliance" slug="compliance-scoring-explained" label="What does this score mean?" />
```

---

## Layer 5: Mobile + FAQ Expansion

### Task 13: Enhance Mobile Help + Expand Default FAQs

**Files:**
- Modify: `apps/web/src/app/mobile/help/page.tsx`
- Modify: `apps/web/src/components/mobile/MobileHelpContent.tsx`
- Modify: `packages/shared/src/default-faqs.ts`

- [ ] **Step 1: Expand default FAQs from 5 to 15**

Replace the contents of `packages/shared/src/default-faqs.ts`:

```typescript
export interface DefaultFaq {
  question: string;
  answer: string;
  category: string;
}

export const DEFAULT_FAQS: DefaultFaq[] = [
  // Getting Started
  {
    question: 'How do I submit a maintenance request?',
    answer:
      'From the sidebar, click Operations then select the Requests tab. Click "Submit Request", fill in the details, attach any photos, and submit. You\'ll receive updates as your request is processed.',
    category: 'getting-started',
  },
  {
    question: 'How do I view community documents?',
    answer:
      'Click Documents in the sidebar. You can browse by category or use the search bar to find specific documents. Click any document to view or download it.',
    category: 'getting-started',
  },
  {
    question: 'How do I view upcoming meetings?',
    answer:
      'Click Meetings in the sidebar. Upcoming meetings are shown at the top with date, time, and location. Past meetings with posted minutes appear below.',
    category: 'getting-started',
  },
  {
    question: 'How do I update my notification preferences?',
    answer:
      'Go to Settings from the profile menu and scroll to the Email Notifications section. You can toggle announcements, meeting notices, and in-app alerts, and choose your email frequency.',
    category: 'account',
  },
  {
    question: 'How do I change my password?',
    answer:
      'Go to Settings > Security. Enter your current password, then your new password twice to confirm. If you\'ve forgotten your current password, use the "Forgot your password?" link on the login page.',
    category: 'account',
  },
  // Operations
  {
    question: 'How do I track the status of my maintenance request?',
    answer:
      'Go to Operations > Requests. Your submitted requests show their current status: Open, In Progress, Completed, or Closed. You\'ll also receive notifications when the status changes.',
    category: 'operations',
  },
  {
    question: 'How do I report a violation?',
    answer:
      'Click "Report Violation" in the sidebar. Describe the issue, select the violation type, add photos if possible, and submit. Your management team will review and respond.',
    category: 'operations',
  },
  // Board & Compliance
  {
    question: 'What is the compliance score?',
    answer:
      'The compliance score measures how well your community meets Florida statutory requirements for document posting, meeting notices, and record-keeping. A score above 90% indicates strong compliance. Visit the Help Center for a detailed guide.',
    category: 'compliance',
  },
  {
    question: 'How do I vote in a board poll?',
    answer:
      'When a poll is active, you\'ll see it on the Board page. Click the poll, review the options, and cast your vote. Results are visible once the poll closes.',
    category: 'board',
  },
  // Payments & Finance
  {
    question: 'How do I view my assessment balance?',
    answer:
      'Click Payments in the sidebar to see your current balance, payment history, and any upcoming assessments. You can make payments directly through the platform if online payments are enabled.',
    category: 'payments',
  },
  // E-Sign
  {
    question: 'How do I sign a document electronically?',
    answer:
      'When a document is sent for your signature, you\'ll receive an email notification with a link. Click the link, review the document, and follow the on-screen instructions to sign. You can also find pending signatures in your E-Sign section.',
    category: 'esign',
  },
  // Emergency
  {
    question: 'What are emergency broadcasts?',
    answer:
      'Emergency broadcasts are urgent messages sent to all community members via push notification, email, and in-app alert. They\'re used for situations like severe weather, security incidents, or critical maintenance issues.',
    category: 'emergency',
  },
  // Move-in/out
  {
    question: 'How does the move-in/move-out process work?',
    answer:
      'Your management team will create a move checklist for your unit. You can view the checklist from the Leases section, track completed items, and coordinate with management on any remaining steps.',
    category: 'operations',
  },
  // Admin-specific
  {
    question: 'How do I upload a document for compliance?',
    answer:
      'Go to Documents, click "Upload Document", select the correct category (this matters for compliance scoring), add a title and description, then upload the file. Your compliance score updates automatically.',
    category: 'compliance',
  },
  {
    question: 'How do I customize the community portal?',
    answer:
      'Admins can customize branding and portal settings from the Settings page. You can update your community logo, color scheme, and contact information that residents see.',
    category: 'admin',
  },
];
```

- [ ] **Step 2: Update mobile help page to pass article data**

In `apps/web/src/app/mobile/help/page.tsx`, add article fetching. Add import:

```typescript
import { getFeaturedForRole } from '@/lib/services/help-article-service';
```

After the membership check, add:

```typescript
const role = membership.role as string ?? null;
const featuredArticles = getFeaturedForRole(role);
```

Update the return to pass articles:

```tsx
return (
  <MobileHelpContent
    faqs={sortedFaqs}
    isAdmin={isAdmin}
    communityId={communityId}
    featuredArticles={featuredArticles.map((a) => ({
      title: a.title,
      description: a.description,
      category: a.category,
      slug: a.slug,
    }))}
  />
);
```

- [ ] **Step 3: Update MobileHelpContent to show article quick links**

In `apps/web/src/components/mobile/MobileHelpContent.tsx`, add the new prop type and section.

Update the interface:

```typescript
interface ArticleLink {
  title: string;
  description: string;
  category: string;
  slug: string;
}

interface MobileHelpContentProps {
  faqs: FaqItem[];
  isAdmin: boolean;
  communityId: number;
  featuredArticles?: ArticleLink[];
}
```

Update the component signature to accept `featuredArticles`:

```typescript
export function MobileHelpContent({
  faqs,
  isAdmin,
  communityId,
  featuredArticles = [],
}: MobileHelpContentProps) {
```

Add a "Quick Guides" section after the search `<SlideUp>` and before the FAQs section:

```tsx
{/* Quick guides */}
{featuredArticles.length > 0 && (
  <SlideUp delay={0.03}>
    <div className="mt-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400">
        Quick Guides
      </div>
      <div className="space-y-2">
        {featuredArticles.map((article) => (
          <Link
            key={article.slug}
            href={`/help/${article.category}/${article.slug}`}
            className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
          >
            <div className="flex-1">
              <div className="text-[14px] font-medium text-stone-900">
                {article.title}
              </div>
              <div className="mt-0.5 text-[12px] text-stone-400 line-clamp-1">
                {article.description}
              </div>
            </div>
            <ChevronRight
              size={16}
              className="shrink-0 text-stone-300"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </div>
  </SlideUp>
)}
```

Also add the `BookOpen` import if not already present (from `lucide-react`).

- [ ] **Step 4: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/default-faqs.ts apps/web/src/app/mobile/help/page.tsx apps/web/src/components/mobile/MobileHelpContent.tsx
git commit -m "feat: expand default FAQs to 15, add featured articles to mobile help"
```

---

### Task 14: FAQ Management Desktop Page

**Files:**
- Create: `apps/web/src/app/(authenticated)/help/manage/page.tsx`

- [ ] **Step 1: Create the desktop FAQ management page**

Create `apps/web/src/app/(authenticated)/help/manage/page.tsx`:

```typescript
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { createScopedClient, faqs } from '@propertypro/db';
import { ensureFaqsExist } from '@/lib/services/faq-service';
import { PageHeader } from '@/components/shared/page-header';

/**
 * Desktop FAQ Management page.
 *
 * Minimal v1: displays existing FAQs with links to the mobile manage page
 * which already has full CRUD. A dedicated desktop editor is a v1.1 enhancement.
 */
export default async function HelpManagePage() {
  const requestHeaders = await headers();
  const communityId = Number(requestHeaders.get('x-community-id'));
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);

  if (!membership.isAdmin) {
    redirect('/help');
  }

  await ensureFaqsExist(communityId);
  const scoped = createScopedClient(communityId);
  const faqRows = await scoped.query(faqs);
  const sortedFaqs = [...faqRows].sort(
    (a, b) => ((a['sortOrder'] as number) ?? 0) - ((b['sortOrder'] as number) ?? 0),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm text-content-tertiary">
        <Link href="/help" className="hover:text-content-secondary transition-colors">Help</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="text-content-secondary">Manage FAQs</span>
      </nav>

      <PageHeader title="Manage FAQs" subtitle="Create, edit, and reorder community FAQs" />

      <div className="mt-6 space-y-3">
        {sortedFaqs.map((faq, index) => (
          <div
            key={faq['id'] as number}
            className="flex items-start gap-4 rounded-[var(--radius-md)] border border-edge bg-surface-card p-4"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-medium text-content-tertiary">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-content">{faq['question'] as string}</p>
              <p className="mt-1 text-xs text-content-tertiary line-clamp-2">{faq['answer'] as string}</p>
              {faq['category'] && (
                <span className="mt-2 inline-block rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-content-tertiary capitalize">
                  {(faq['category'] as string).replace(/-/g, ' ')}
                </span>
              )}
            </div>
          </div>
        ))}

        {sortedFaqs.length === 0 && (
          <div className="rounded-[var(--radius-md)] border border-edge bg-surface-card p-8 text-center">
            <p className="text-sm text-content-secondary">No FAQs yet. Create your first FAQ to help residents find answers.</p>
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-content-tertiary">
        Full FAQ editing (create, edit, delete, reorder) is currently available on the{' '}
        <Link href={`/mobile/help/manage?communityId=${communityId}`} className="text-[var(--interactive-primary)] hover:underline">
          mobile management page
        </Link>
        . A desktop editor is coming soon.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/help/manage/
git commit -m "feat: add desktop FAQ management page (read-only v1, links to mobile editor)"
```

---

## Final Verification

### Task 15: Full Build + Lint Verification

- [ ] **Step 1: Run full typecheck**

```bash
pnpm typecheck
```

Expected: All packages clean.

- [ ] **Step 2: Run linter (includes DB access guard)**

```bash
pnpm lint
```

Expected: Pass. If the DB access guard flags any imports, fix them per the `tenant-isolation.md` rules.

- [ ] **Step 3: Run unit tests**

```bash
pnpm test
```

Expected: All existing tests pass + new help-article-service tests pass.

- [ ] **Step 4: Run build**

```bash
pnpm build
```

Expected: Production build succeeds.

- [ ] **Step 5: Final commit (if any lint/type fixes were needed)**

```bash
git add -A
git commit -m "fix: address lint and type issues from help center implementation"
```
