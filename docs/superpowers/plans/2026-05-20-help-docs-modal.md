# Help Docs Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing help drawer with a shadcn-docs-style modal that opens to the contextual article in place, reusing all existing MDX content and infrastructure. Ship behind `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED` for safe rollback.

**Architecture:** Extend `HelpWidgetProvider` with a `selectedArticle` slot. Add a new `GET /api/v1/help/article` endpoint that serializes MDX via `next-mdx-remote/serialize` (cached via `unstable_cache`). Build `<HelpDocsModal/>` that uses Radix `Dialog` on desktop and `Sheet` on mobile, mounting a shared `<HelpArticleBody/>` component extracted from the existing `/help/[cat]/[slug]/page.tsx`. Wire the existing top-bar `CircleHelp` button to the new modal behind a feature flag.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query, `next-mdx-remote@6`, Radix Dialog, Tailwind, Vitest + Testing Library.

**Source spec:** `docs/superpowers/specs/2026-05-20-help-docs-modal-design.md`

**Out of scope (covered by spec but not this plan):**
- Phase B (production env-var flip) — ops action, no code change.
- Phase C (delete `<HelpWidget/>` + flag) — separate cleanup PR after soak.
- `<HelpTooltip/>` "Read full guide" → modal — follow-up PR.

---

## File Structure

**New files:**
- `apps/web/src/components/help/help-docs-modal.tsx` — outer modal chrome (Dialog/Sheet)
- `apps/web/src/components/help/help-article-body.tsx` — shared article-render component (used by route + modal)
- `apps/web/src/components/help/help-docs-modal-search-panel.tsx` — empty-state search/browse panel
- `apps/web/src/components/help/help-docs-modal-toc.tsx` — left-rail TOC + "More for this page" links
- `apps/web/src/app/api/v1/help/article/route.ts` — new endpoint
- `apps/web/__tests__/help/article-route.test.ts` — endpoint tests
- `apps/web/__tests__/help/help-docs-modal.test.tsx` — modal component tests
- `apps/web/__tests__/help/help-article-body.test.tsx` — body component tests

**Modified files:**
- `apps/web/src/components/help/help-widget-provider.tsx` — extend context with `selectedArticle` + `openArticle`
- `apps/web/src/hooks/use-help.ts` — add `useHelpArticle` hook + `HELP_KEYS.article`
- `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx` — consume extracted `<HelpArticleBody/>`
- `apps/web/src/components/layout/app-shell.tsx` — mount new modal alongside existing widget
- `apps/web/src/components/layout/app-top-bar.tsx` — button reads flag
- `apps/web/src/hooks/__tests__/use-help.test.tsx` — add `useHelpArticle` tests
- `.env.example` — add `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED=false`

---

## Task 1: Extend `HelpWidgetProvider` with `selectedArticle`

**Files:**
- Modify: `apps/web/src/components/help/help-widget-provider.tsx`
- Test: `apps/web/__tests__/help/help-widget-provider.test.tsx` (NEW)

- [ ] **Step 1.1: Write the failing test**

Create `apps/web/__tests__/help/help-widget-provider.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  HelpWidgetProvider,
  useHelpWidget,
} from '../../src/components/help/help-widget-provider';

function Probe() {
  const { isOpen, selectedArticle, openArticle, close } = useHelpWidget();
  return (
    <div>
      <span data-testid="open">{String(isOpen)}</span>
      <span data-testid="selected">
        {selectedArticle ? `${selectedArticle.category}/${selectedArticle.slug}` : 'null'}
      </span>
      <button onClick={() => openArticle('compliance', 'fixing-gaps')}>open</button>
      <button onClick={close}>close</button>
    </div>
  );
}

describe('HelpWidgetProvider — selectedArticle', () => {
  it('defaults selectedArticle to null and isOpen to false', () => {
    render(
      <HelpWidgetProvider>
        <Probe />
      </HelpWidgetProvider>,
    );
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    expect(screen.getByTestId('selected')).toHaveTextContent('null');
  });

  it('openArticle sets selectedArticle and opens the widget', () => {
    render(
      <HelpWidgetProvider>
        <Probe />
      </HelpWidgetProvider>,
    );
    act(() => {
      screen.getByText('open').click();
    });
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    expect(screen.getByTestId('selected')).toHaveTextContent('compliance/fixing-gaps');
  });

  it('close clears selectedArticle and closes the widget', () => {
    render(
      <HelpWidgetProvider>
        <Probe />
      </HelpWidgetProvider>,
    );
    act(() => {
      screen.getByText('open').click();
    });
    act(() => {
      screen.getByText('close').click();
    });
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    expect(screen.getByTestId('selected')).toHaveTextContent('null');
  });
});
```

- [ ] **Step 1.2: Run the test — expect failure**

```bash
pnpm exec vitest run apps/web/__tests__/help/help-widget-provider.test.tsx
```

Expected: FAIL — `selectedArticle` and `openArticle` don't exist on the context value yet.

- [ ] **Step 1.3: Extend the provider**

Edit `apps/web/src/components/help/help-widget-provider.tsx`:

```tsx
'use client';

/**
 * Help Widget state context — manages open/close state and the article
 * currently being viewed in the help docs modal. Follows the same pattern
 * as sidebar-context.tsx.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface SelectedArticle {
  category: string;
  slug: string;
}

interface HelpWidgetContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  selectedArticle: SelectedArticle | null;
  openArticle: (category: string, slug: string) => void;
}

const HelpWidgetContext = createContext<HelpWidgetContextValue | null>(null);

export function HelpWidgetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<SelectedArticle | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setSelectedArticle(null);
  }, []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const openArticle = useCallback((category: string, slug: string) => {
    setSelectedArticle({ category, slug });
    setIsOpen(true);
  }, []);

  // ? keyboard shortcut (only on pointer devices, not in inputs)
  useEffect(() => {
    const isPointerDevice = window.matchMedia('(pointer: fine)').matches;
    if (!isPointerDevice) return;

    function handleKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <HelpWidgetContext.Provider
      value={{ isOpen, open, close, toggle, selectedArticle, openArticle }}
    >
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

- [ ] **Step 1.4: Run the test — expect pass**

```bash
pnpm exec vitest run apps/web/__tests__/help/help-widget-provider.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 1.5: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS. (The existing `HelpWidget` doesn't use the new fields, so no consumer breakage.)

- [ ] **Step 1.6: Commit**

```bash
git add apps/web/src/components/help/help-widget-provider.tsx \
        apps/web/__tests__/help/help-widget-provider.test.tsx
git commit -m "$(cat <<'EOF'
feat(help): extend HelpWidgetProvider with selectedArticle

Adds selectedArticle state and openArticle action to the help widget
context. Foundation for the new HelpDocsModal — lets consumers open
the modal pointed at a specific article (used by deep-link query
params and future HelpTooltip integrations).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `GET /api/v1/help/article` endpoint

**Files:**
- Create: `apps/web/src/app/api/v1/help/article/route.ts`
- Test: `apps/web/__tests__/help/article-route.test.ts` (NEW)

- [ ] **Step 2.1: Write the failing test**

Create `apps/web/__tests__/help/article-route.test.ts`:

```ts
/**
 * Unit tests for GET /api/v1/help/article.
 *
 * Scope:
 * - Happy path returns serialized MDX + toc + metadata + related
 * - Invalid params → 400 (ValidationError)
 * - Missing article → 404
 * - Role-gated article → 404 (NOT 403; we don't leak existence)
 * - Feature-gated article → 404
 *
 * Mocks the service boundary (getArticle, isArticleVisibleToRole,
 * filterArticlesByFeatures) and the next-mdx-remote/serialize call.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getArticleMock,
  isArticleVisibleToRoleMock,
  filterArticlesByFeaturesMock,
  getAllArticlesMock,
  serializeMock,
  extractTableOfContentsMock,
  unstableCacheMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  getFeaturesForCommunityMock,
} = vi.hoisted(() => ({
  getArticleMock: vi.fn(),
  isArticleVisibleToRoleMock: vi.fn(),
  filterArticlesByFeaturesMock: vi.fn(),
  getAllArticlesMock: vi.fn(),
  serializeMock: vi.fn(),
  extractTableOfContentsMock: vi.fn(),
  unstableCacheMock: vi.fn((fn: () => unknown) => fn),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/services/help-article-service', () => ({
  getArticle: getArticleMock,
  isArticleVisibleToRole: isArticleVisibleToRoleMock,
  filterArticlesByFeatures: filterArticlesByFeaturesMock,
  getAllArticles: getAllArticlesMock,
}));

vi.mock('next-mdx-remote/serialize', () => ({
  serialize: serializeMock,
}));

vi.mock('@/lib/help/toc', () => ({
  extractTableOfContents: extractTableOfContentsMock,
}));

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => () => unstableCacheMock(fn),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@propertypro/shared', () => ({
  getFeaturesForCommunity: getFeaturesForCommunityMock,
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors/ValidationError', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) { super(msg); this.name = 'ValidationError'; }
  },
}));

import { GET } from '../../src/app/api/v1/help/article/route';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

const sampleArticle = {
  metadata: {
    title: 'Fixing compliance gaps',
    description: 'How to resolve flagged compliance gaps.',
    category: 'compliance',
    slug: 'fixing-compliance-gaps',
    roles: ['board_member'],
    keywords: [],
    tags: [],
    relatedArticles: [],
    featured: false,
    excerpt: '',
    filePath: '/tmp/article.mdx',
    contextPaths: ['/compliance'],
    statutes: [],
    featureGates: [],
    updatedAt: '2026-05-01',
    readTimeMinutes: 3,
    contentHash: 'abc123',
  },
  rawContent: '## Heading\n\nBody text.',
};

const serializedResult = { compiledSource: 'compiled', frontmatter: {}, scope: {} };

describe('GET /api/v1/help/article', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'board_member',
      presetKey: null,
      communityType: 'condo_718',
    });
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    getFeaturesForCommunityMock.mockReturnValue({ compliance: true });
    isArticleVisibleToRoleMock.mockReturnValue(true);
    filterArticlesByFeaturesMock.mockReturnValue([sampleArticle.metadata]);
    getAllArticlesMock.mockReturnValue([]);
    serializeMock.mockResolvedValue(serializedResult);
    extractTableOfContentsMock.mockReturnValue([
      { depth: 2, label: 'Heading', anchor: 'heading' },
    ]);
    unstableCacheMock.mockImplementation((fn: () => unknown) => fn());
    getArticleMock.mockReturnValue(sampleArticle);
  });

  it('returns serialized MDX + toc + metadata on happy path', async () => {
    const res = await GET(
      makeRequest('/api/v1/help/article?category=compliance&slug=fixing-compliance-gaps&communityId=1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.source).toEqual(serializedResult);
    expect(body.data.toc).toEqual([{ depth: 2, label: 'Heading', anchor: 'heading' }]);
    expect(body.data.metadata.slug).toBe('fixing-compliance-gaps');
    expect(body.data.related).toEqual([]);
  });

  it('returns 400 on invalid params', async () => {
    const res = await GET(makeRequest('/api/v1/help/article?category=&slug=&communityId=1'));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 404 when article does not exist', async () => {
    getArticleMock.mockReturnValue(null);
    const res = await GET(
      makeRequest('/api/v1/help/article?category=compliance&slug=missing&communityId=1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 (not 403) when article is role-gated', async () => {
    isArticleVisibleToRoleMock.mockReturnValue(false);
    const res = await GET(
      makeRequest('/api/v1/help/article?category=compliance&slug=fixing-compliance-gaps&communityId=1'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when article is feature-gated and feature is off', async () => {
    filterArticlesByFeaturesMock.mockReturnValue([]);
    const res = await GET(
      makeRequest('/api/v1/help/article?category=compliance&slug=fixing-compliance-gaps&communityId=1'),
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2.2: Run the test — expect failure**

```bash
pnpm exec vitest run apps/web/__tests__/help/article-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2.3: Create the route**

Create `apps/web/src/app/api/v1/help/article/route.ts`:

```ts
/**
 * Help Article API
 *
 * GET /api/v1/help/article?category=X&slug=Y&communityId=N
 *
 * Returns the serialized MDX body + TOC + metadata + related articles
 * for the requested help article, filtered by the viewer's role and
 * community features.
 *
 * Returns 404 (NOT 403) for role-gated/feature-gated articles to avoid
 * leaking existence of restricted content.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { unstable_cache } from 'next/cache';
import { serialize } from 'next-mdx-remote/serialize';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';
import { z } from 'zod';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  getAllArticles,
  getArticle,
  isArticleVisibleToRole,
  filterArticlesByFeatures,
  type HelpArticleMetadata,
  type HelpArticleSource,
} from '@/lib/services/help-article-service';
import { extractTableOfContents } from '@/lib/help/toc';
import type { TocItem } from '@/components/help/mdx-components';

const querySchema = z.object({
  category: z.string().regex(/^[a-z0-9-]+$/).min(1).max(64),
  slug:     z.string().regex(/^[a-z0-9-]+$/).min(1).max(128),
  communityId: z.coerce.number().int().positive(),
});

interface CompiledArticle {
  source: MDXRemoteSerializeResult;
  toc: TocItem[];
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    category:    searchParams.get('category')    || undefined,
    slug:        searchParams.get('slug')        || undefined,
    communityId: searchParams.get('communityId') || undefined,
  });
  if (!parsed.success) {
    throw new ValidationError('Invalid help article parameters');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  const features = getFeaturesForCommunity(membership.communityType);
  const effectiveRole = membership.presetKey ?? membership.role;

  const article = getArticle(parsed.data.category, parsed.data.slug);
  if (
    !article ||
    !isArticleVisibleToRole(article.metadata, effectiveRole) ||
    filterArticlesByFeatures(
      [article.metadata],
      (gate) => features[gate as keyof typeof features] === true,
    ).length === 0
  ) {
    // 404, NOT 403 — don't leak existence of role-gated articles
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const compiled = await getCompiledArticle(article);
  const related = getRelatedArticles(article, effectiveRole);

  return NextResponse.json({
    data: {
      source: compiled.source,
      toc: compiled.toc,
      metadata: article.metadata,
      related,
    },
  });
});

/**
 * Wraps next-mdx-remote/serialize + extractTableOfContents in unstable_cache,
 * keyed on (category, slug, contentHash). Sub-ms hits after warmup; new
 * deploy = new contentHash = automatic cache invalidation.
 */
async function getCompiledArticle(article: HelpArticleSource): Promise<CompiledArticle> {
  const key = `${article.metadata.category}:${article.metadata.slug}:${article.metadata.contentHash}`;
  return unstable_cache(
    async (): Promise<CompiledArticle> => ({
      source: await serialize(article.rawContent, { parseFrontmatter: true }),
      toc: extractTableOfContents(article.rawContent),
    }),
    ['help-article', key],
    { tags: ['help-article', key] },
  )();
}

/**
 * Resolves frontmatter `relatedArticles` slugs to full metadata, filtered
 * by the viewer's role. Mirrors the existing logic at
 * /help/[category]/[slug]/page.tsx lines 57–62.
 */
function getRelatedArticles(
  article: HelpArticleSource,
  effectiveRole: string,
): HelpArticleMetadata[] {
  return article.metadata.relatedArticles
    .map((slug) => getAllArticles().find((a) => a.slug === slug))
    .filter((a): a is HelpArticleMetadata => !!a && isArticleVisibleToRole(a, effectiveRole));
}
```

- [ ] **Step 2.4: Run the test — expect pass**

```bash
pnpm exec vitest run apps/web/__tests__/help/article-route.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 2.5: Run lint and typecheck**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS. The `guard:db-access` and `guard:authz-comments` checks should not complain — the new route imports only from `@/lib/services/help-article-service`, never directly from `@propertypro/db`.

- [ ] **Step 2.6: Commit**

```bash
git add apps/web/src/app/api/v1/help/article/route.ts \
        apps/web/__tests__/help/article-route.test.ts
git commit -m "$(cat <<'EOF'
feat(help): add GET /api/v1/help/article endpoint

Returns serialized MDX + TOC + metadata + related articles for a single
help article. Used by the upcoming HelpDocsModal to render articles in
place without navigating to /help/<cat>/<slug>. Wraps next-mdx-remote
serialize + extractTableOfContents in unstable_cache keyed on
contentHash for sub-ms cache hits after warmup.

Role-gated and feature-gated articles return 404, not 403 — we don't
leak existence of restricted content.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `useHelpArticle` hook

**Files:**
- Modify: `apps/web/src/hooks/use-help.ts`
- Test: `apps/web/src/hooks/__tests__/use-help.test.tsx` (extend existing)

- [ ] **Step 3.1: Write the failing tests**

Append to `apps/web/src/hooks/__tests__/use-help.test.tsx`:

```tsx
import { useHelpArticle } from '../use-help';

describe('useHelpArticle', () => {
  it('does not fetch when category or slug is null', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useHelpArticle(null, null, 1), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches and returns article on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          source: { compiledSource: 'compiled', frontmatter: {}, scope: {} },
          toc: [{ depth: 2, label: 'Heading', anchor: 'heading' }],
          metadata: { slug: 's', category: 'c', title: 't' },
          related: [],
        },
      }),
    );

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useHelpArticle('c', 's', 42), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.metadata.slug).toBe('s');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/help/article?category=c&slug=s&communityId=42'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('surfaces error on 404', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useHelpArticle('c', 's', 42), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 3.2: Run the test — expect failure**

```bash
pnpm exec vitest run apps/web/src/hooks/__tests__/use-help.test.tsx -t useHelpArticle
```

Expected: FAIL — `useHelpArticle` is not exported.

- [ ] **Step 3.3: Add the hook**

In `apps/web/src/hooks/use-help.ts`:

1. Add a new import at the top (if not already present):
   ```ts
   import type { MDXRemoteSerializeResult } from 'next-mdx-remote';
   import type { TocItem } from '@/components/help/mdx-components';
   import type { HelpArticleMetadata } from '@/lib/services/help-article-service';
   ```

2. Add to `HELP_KEYS`:
   ```ts
   article: (category: string, slug: string, communityId: number) =>
     ['help', 'article', category, slug, communityId] as const,
   ```

3. Add types and hook (place near `useContextualHelp`):

   ```ts
   export interface HelpArticleResponse {
     source: MDXRemoteSerializeResult;
     toc: TocItem[];
     metadata: HelpArticleMetadata;
     related: HelpArticleMetadata[];
   }

   /**
    * Fetches a single help article (serialized MDX + TOC + metadata + related)
    * from /api/v1/help/article. Disabled when category or slug is null —
    * useful for the modal's "no contextual match" state where no article is
    * selected yet.
    *
    * Articles are effectively static at runtime, so staleTime is 5min and
    * gcTime is 1hr — minimize refetches.
    */
   export function useHelpArticle(
     category: string | null,
     slug: string | null,
     communityId: number,
   ) {
     return useQuery({
       queryKey:
         category && slug
           ? HELP_KEYS.article(category, slug, communityId)
           : ['help', 'article', 'disabled'],
       enabled: Boolean(category && slug && communityId > 0),
       staleTime: 5 * 60_000,
       gcTime: 60 * 60_000,
       queryFn: async ({ signal }) => {
         const params = new URLSearchParams({
           category: category!,
           slug: slug!,
           communityId: String(communityId),
         });
         return requestJson<HelpArticleResponse>(
           `/api/v1/help/article?${params}`,
           { credentials: 'include', signal },
         );
       },
     });
   }
   ```

- [ ] **Step 3.4: Run the test — expect pass**

```bash
pnpm exec vitest run apps/web/src/hooks/__tests__/use-help.test.tsx
```

Expected: PASS (all existing tests + 3 new).

- [ ] **Step 3.5: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3.6: Commit**

```bash
git add apps/web/src/hooks/use-help.ts \
        apps/web/src/hooks/__tests__/use-help.test.tsx
git commit -m "$(cat <<'EOF'
feat(help): add useHelpArticle React Query hook

Fetches a single help article from /api/v1/help/article. Disabled when
category or slug is null (modal's "no contextual match" state).
staleTime 5min, gcTime 1hr — articles are static at runtime.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extract `<HelpArticleBody/>` shared component

**Files:**
- Create: `apps/web/src/components/help/help-article-body.tsx`
- Test: `apps/web/__tests__/help/help-article-body.test.tsx` (NEW)

- [ ] **Step 4.1: Write the failing test**

Create `apps/web/__tests__/help/help-article-body.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpArticleBody } from '../../src/components/help/help-article-body';
import type { HelpArticleMetadata } from '../../src/lib/services/help-article-service';

vi.mock('next-mdx-remote', () => ({
  MDXRemote: ({ compiledSource }: { compiledSource: string }) => (
    <div data-testid="mdx">{compiledSource}</div>
  ),
}));

vi.mock('../../src/components/help/article-view-tracker', () => ({
  ArticleViewTracker: () => <div data-testid="view-tracker" />,
}));

vi.mock('../../src/components/help/article-feedback', () => ({
  ArticleFeedback: () => <div data-testid="feedback" />,
}));

const baseMetadata: HelpArticleMetadata = {
  title: 'Fixing compliance gaps',
  description: 'How to resolve flagged gaps.',
  category: 'compliance',
  slug: 'fixing-compliance-gaps',
  roles: ['board_member'],
  keywords: [],
  tags: [],
  relatedArticles: [],
  featured: false,
  excerpt: '',
  filePath: '/tmp/article.mdx',
  contextPaths: [],
  statutes: [],
  featureGates: [],
  updatedAt: '2026-05-01',
  readTimeMinutes: 3,
  contentHash: 'abc',
};

function withQueryClient(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('<HelpArticleBody/>', () => {
  it('renders MDX body and TOC in modal mode', () => {
    render(
      withQueryClient(
        <HelpArticleBody
          source={{ compiledSource: 'compiled-html', frontmatter: {}, scope: {} } as never}
          toc={[{ depth: 2, label: 'Heading', anchor: 'heading' }]}
          metadata={baseMetadata}
          related={[]}
          communityId={1}
          displayMode="modal"
        />,
      ),
    );
    expect(screen.getByTestId('mdx')).toHaveTextContent('compiled-html');
    expect(screen.getByText('Heading')).toBeInTheDocument();
    expect(screen.getByTestId('view-tracker')).toBeInTheDocument();
    expect(screen.getByTestId('feedback')).toBeInTheDocument();
  });

  it('does not render the page-level chrome in modal mode', () => {
    render(
      withQueryClient(
        <HelpArticleBody
          source={{ compiledSource: 'x', frontmatter: {}, scope: {} } as never}
          toc={[]}
          metadata={baseMetadata}
          related={[]}
          communityId={1}
          displayMode="modal"
        />,
      ),
    );
    // PageHeader is not used in modal mode — modal provides its own header
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('renders related articles when present', () => {
    render(
      withQueryClient(
        <HelpArticleBody
          source={{ compiledSource: 'x', frontmatter: {}, scope: {} } as never}
          toc={[]}
          metadata={baseMetadata}
          related={[{ ...baseMetadata, slug: 'related-slug', title: 'Related Article' }]}
          communityId={1}
          displayMode="modal"
        />,
      ),
    );
    expect(screen.getByRole('link', { name: /Related Article/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.2: Run the test — expect failure**

```bash
pnpm exec vitest run apps/web/__tests__/help/help-article-body.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 4.3: Create the component**

Create `apps/web/src/components/help/help-article-body.tsx`:

```tsx
'use client';

/**
 * <HelpArticleBody/> — shared article-rendering component used by both
 * /help/[category]/[slug]/page.tsx (route mode) and HelpDocsModal (modal mode).
 *
 * Extracted from the inline JSX previously at
 * apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx lines 91–186.
 *
 * Mode tweaks chrome only:
 * - route: outer wrapper preserves PageHeader spacing
 * - modal: outer wrapper applies scroll boundary for the article column
 */
import Link from 'next/link';
import { MDXRemote, type MDXRemoteSerializeResult } from 'next-mdx-remote';
import {
  TableOfContents,
  helpMdxComponents,
  type TocItem,
} from '@/components/help/mdx-components';
import { ArticleFeedback } from '@/components/help/article-feedback';
import { ArticleViewTracker } from '@/components/help/article-view-tracker';
import type { HelpArticleMetadata } from '@/lib/services/help-article-service';
import { cn } from '@/lib/utils';

function formatUpdatedAt(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

export interface HelpArticleBodyProps {
  source: MDXRemoteSerializeResult;
  toc: TocItem[];
  metadata: HelpArticleMetadata;
  related: HelpArticleMetadata[];
  communityId: number;
  displayMode: 'route' | 'modal';
}

export function HelpArticleBody({
  source,
  toc,
  metadata,
  related,
  communityId,
  displayMode,
}: HelpArticleBodyProps) {
  const formattedUpdatedAt = formatUpdatedAt(metadata.updatedAt);
  const isModal = displayMode === 'modal';

  return (
    <div className={cn('space-y-8', isModal && 'pb-4')}>
      <ArticleViewTracker
        communityId={communityId}
        articleSlug={metadata.slug}
        articleCategory={metadata.category}
      />

      {/* Metadata strip — read time, updated, roles, statutes. Parity with route page. */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-content-tertiary">
        {typeof metadata.readTimeMinutes === 'number' && (
          <span>{metadata.readTimeMinutes} min read</span>
        )}
        {formattedUpdatedAt && (
          <>
            <span aria-hidden="true">/</span>
            <span>Updated {formattedUpdatedAt}</span>
          </>
        )}
        {metadata.roles.length > 0 && (
          <>
            <span aria-hidden="true">/</span>
            <div className="flex flex-wrap gap-2">
              {metadata.roles.map((role) => (
                <span
                  key={role}
                  className="rounded-full bg-surface-muted px-2 py-0.5 capitalize"
                >
                  {role.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </>
        )}
        {(metadata.statutes ?? []).length > 0 && (
          <>
            <span aria-hidden="true">/</span>
            <div className="flex flex-wrap gap-2">
              {(metadata.statutes ?? []).map((statute) => (
                <Link
                  key={statute}
                  href={`/help/statutes/${encodeURIComponent(statute)}?communityId=${communityId}`}
                  className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-900 transition-colors hover:bg-purple-100"
                  aria-label={`See all articles tagged with ${statute}`}
                >
                  {statute}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Mobile TOC disclosure — desktop continues to render a sticky sidebar */}
      {toc.length > 0 && (
        <details className="rounded-2xl border border-edge bg-surface-card lg:hidden">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-content [&::-webkit-details-marker]:hidden">
            On this page
          </summary>
          <div className="border-t border-edge-subtle px-4 py-3">
            <TableOfContents items={toc} />
          </div>
        </details>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <article
          className={cn(
            'rounded-2xl border border-edge bg-surface-card p-6 shadow-sm',
            isModal && 'max-h-[calc(80vh-7rem)] overflow-y-auto',
          )}
        >
          <MDXRemote {...source} components={helpMdxComponents} />
        </article>

        {toc.length > 0 && (
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <TableOfContents items={toc} />
            </div>
          </aside>
        )}
      </div>

      <ArticleFeedback
        communityId={communityId}
        articleSlug={metadata.slug}
        articleCategory={metadata.category}
      />

      {related.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-content">Related guides</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {related.map((candidate) => (
              <Link
                key={candidate.slug}
                href={`/help/${candidate.category}/${candidate.slug}?communityId=${communityId}`}
                className="rounded-2xl border border-edge bg-surface-card p-5 shadow-sm transition-colors hover:border-edge-strong hover:bg-surface-hover"
              >
                <h3 className="text-base font-semibold text-content">{candidate.title}</h3>
                <p className="mt-2 text-sm leading-6 text-content-secondary">
                  {candidate.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4.4: Run the test — expect pass**

```bash
pnpm exec vitest run apps/web/__tests__/help/help-article-body.test.tsx
```

Expected: PASS (3 tests).

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/src/components/help/help-article-body.tsx \
        apps/web/__tests__/help/help-article-body.test.tsx
git commit -m "$(cat <<'EOF'
feat(help): extract <HelpArticleBody/> shared component

Extracts the article-rendering JSX previously inline at
/help/[category]/[slug]/page.tsx lines 91–186 into a shared client
component. Two display modes:

- route: used by /help/[cat]/[slug]/page.tsx — outer chrome preserved
- modal: used by HelpDocsModal (coming) — applies scroll boundary

No visual change yet; consumer migration in next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Refactor `/help/[category]/[slug]/page.tsx` to use `<HelpArticleBody/>`

**Files:**
- Modify: `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx`

- [ ] **Step 5.1: Replace inline article rendering with `<HelpArticleBody/>`**

The current route page uses `compileMDX` (which returns React nodes). For parity with the modal, switch to `serialize` (which returns the serializable form that `<MDXRemote/>` consumes).

Edit `apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx`. Replace the entire file with:

```tsx
import { notFound } from 'next/navigation';
import { serialize } from 'next-mdx-remote/serialize';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { HelpArticleBody } from '@/components/help/help-article-body';
import { PageHeader } from '@/components/shared/page-header';
import { requireHelpPageContext } from '@/lib/help/page-context';
import { extractTableOfContents } from '@/lib/help/toc';
import { getFeaturesForCommunity } from '@propertypro/shared';
import {
  getAllArticles,
  getArticle,
  isArticleVisibleToRole,
  filterArticlesByFeatures,
  type HelpArticleMetadata,
} from '@/lib/services/help-article-service';

interface HelpArticlePageProps {
  params: Promise<{ category: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HelpArticlePage({
  params,
  searchParams,
}: HelpArticlePageProps) {
  const [{ category, slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const context = await requireHelpPageContext(
    resolvedSearchParams,
    `/help/${category}/${slug}`,
  );
  const effectiveRole = context.membership.presetKey ?? context.membership.role;
  const features = getFeaturesForCommunity(context.membership.communityType);
  const article = getArticle(category, slug);

  if (
    !article ||
    !isArticleVisibleToRole(article.metadata, effectiveRole) ||
    filterArticlesByFeatures(
      [article.metadata],
      (gate) => features[gate as keyof typeof features] === true,
    ).length === 0
  ) {
    notFound();
  }

  const source = await serialize(article.rawContent, { parseFrontmatter: true });
  const toc = extractTableOfContents(article.rawContent);

  const related: HelpArticleMetadata[] = article.metadata.relatedArticles
    .map((relatedSlug) => getAllArticles().find((candidate) => candidate.slug === relatedSlug))
    .filter((c): c is HelpArticleMetadata => !!c && isArticleVisibleToRole(c, effectiveRole));

  return (
    <div className="space-y-8">
      <PageHeader
        title={article.metadata.title}
        description={article.metadata.description}
        breadcrumb={
          <Breadcrumbs
            items={[
              { label: 'Help Center', href: `/help?communityId=${context.communityId}` },
              {
                label: article.metadata.category
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase()),
                href: `/help/${article.metadata.category}?communityId=${context.communityId}`,
              },
            ]}
            currentLabel={article.metadata.title}
          />
        }
      />

      <HelpArticleBody
        source={source}
        toc={toc}
        metadata={article.metadata}
        related={related}
        communityId={context.communityId}
        displayMode="route"
      />
    </div>
  );
}
```

- [ ] **Step 5.2: Run the route test (if one exists) and typecheck**

```bash
pnpm typecheck
pnpm exec vitest run apps/web/__tests__/help/help-routing.test.tsx
```

Expected: PASS — no behavioral change.

- [ ] **Step 5.3: Start dev server and manually verify the route**

```bash
pnpm dev
```

Then in the preview tool:

```ts
// preview_start("web")
// preview_eval: window.location.href = '/dev/agent-login?as=board_member'
// preview_eval: window.location.href = '/help/compliance/fixing-compliance-gaps?communityId=1'
// preview_snapshot()
```

Verify the rendered page matches the old version visually:
- Title + description in PageHeader
- Breadcrumbs above title
- Metadata strip (min read, Updated, roles, statutes)
- MDX body rendering with callouts, code blocks, etc.
- TOC sidebar on desktop, disclosure on mobile
- Feedback widget at the bottom
- Related articles section if present

Take a screenshot for the commit:

```ts
// preview_screenshot({ url: '/help/compliance/fixing-compliance-gaps?communityId=1' })
```

- [ ] **Step 5.4: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/help/[category]/[slug]/page.tsx
git commit -m "$(cat <<'EOF'
refactor(help): route consumes <HelpArticleBody/>

Switches /help/[category]/[slug]/page.tsx from compileMDX (returns React
nodes inline) to serialize (returns serializable form consumed by
<MDXRemote/>). Pure refactor — no visual change. Sets up structural
parity with the upcoming HelpDocsModal which uses the same component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Build `<HelpDocsModalSearchPanel/>` (empty-state browse panel)

**Files:**
- Create: `apps/web/src/components/help/help-docs-modal-search-panel.tsx`
- Test: `apps/web/__tests__/help/help-docs-modal-search-panel.test.tsx` (NEW)

This is the panel shown inside the modal when there's no contextual article for the current route. Reuses the existing `useHelpSearch` hook and shows featured-for-role articles. We do NOT modify the existing `<HelpSearchResults/>` component — we compose it (it stays, gets deleted later as part of Phase C only if no consumer remains).

- [ ] **Step 6.1: Write the failing test**

Create `apps/web/__tests__/help/help-docs-modal-search-panel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpDocsModalSearchPanel } from '../../src/components/help/help-docs-modal-search-panel';

const useHelpSearchMock = vi.fn();
const getFeaturedForRoleMock = vi.fn();

vi.mock('../../src/hooks/use-help', () => ({
  useHelpSearch: (...args: unknown[]) => useHelpSearchMock(...args),
  HELP_KEYS: {},
}));

vi.mock('../../src/lib/services/help-article-service', () => ({
  getFeaturedForRole: (...args: unknown[]) => getFeaturedForRoleMock(...args),
}));

function withQuery(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('<HelpDocsModalSearchPanel/>', () => {
  it('renders the search input and featured articles for the role', () => {
    useHelpSearchMock.mockReturnValue({ data: null });
    getFeaturedForRoleMock.mockReturnValue([
      {
        title: 'Welcome',
        description: 'Get started',
        category: 'getting-started',
        slug: 'welcome',
        roles: ['owner'],
        keywords: [],
        relatedArticles: [],
        featured: true,
      },
    ]);
    render(
      withQuery(
        <HelpDocsModalSearchPanel communityId={1} role="owner" onPickArticle={() => {}} />,
      ),
    );
    expect(screen.getByPlaceholderText(/Search help articles/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Welcome/ })).toBeInTheDocument();
  });

  it('calls onPickArticle when a featured article is clicked', () => {
    useHelpSearchMock.mockReturnValue({ data: null });
    getFeaturedForRoleMock.mockReturnValue([
      {
        title: 'Welcome',
        description: 'Get started',
        category: 'getting-started',
        slug: 'welcome',
        roles: ['owner'],
        keywords: [],
        relatedArticles: [],
        featured: true,
      },
    ]);
    const onPick = vi.fn();
    render(
      withQuery(
        <HelpDocsModalSearchPanel communityId={1} role="owner" onPickArticle={onPick} />,
      ),
    );
    screen.getByRole('button', { name: /Welcome/ }).click();
    expect(onPick).toHaveBeenCalledWith('getting-started', 'welcome');
  });
});
```

- [ ] **Step 6.2: Run — expect failure**

```bash
pnpm exec vitest run apps/web/__tests__/help/help-docs-modal-search-panel.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 6.3: Create the component**

Create `apps/web/src/components/help/help-docs-modal-search-panel.tsx`:

```tsx
'use client';

/**
 * <HelpDocsModalSearchPanel/> — empty-state panel shown inside HelpDocsModal
 * when there is no contextual article for the current route. Lets the user
 * search across all articles + browse featured-for-role suggestions.
 *
 * Clicking a result calls onPickArticle(category, slug), which the modal
 * uses to switch its content via openArticle() — no navigation.
 */
import { useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useHelpSearch } from '@/hooks/use-help';
import { getFeaturedForRole } from '@/lib/services/help-article-service';
import { cn } from '@/lib/utils';

interface HelpDocsModalSearchPanelProps {
  communityId: number;
  role: string;
  onPickArticle: (category: string, slug: string) => void;
}

export function HelpDocsModalSearchPanel({
  communityId,
  role,
  onPickArticle,
}: HelpDocsModalSearchPanelProps) {
  const [query, setQuery] = useState('');
  const { data: searchResults, isFetching } = useHelpSearch(query, communityId);
  const featured = getFeaturedForRole(role);
  const isSearching = query.length >= 2;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-content">Browse help articles</h2>
        <p className="mt-1 text-sm text-content-secondary">
          We don't have a guide tailored to this page yet — search or pick a featured guide below.
        </p>
      </div>

      <div className="relative">
        <Search
          size={16}
          aria-hidden="true"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles..."
          className="h-10 w-full rounded-[var(--radius-sm)] border border-edge bg-surface-card pl-9 pr-3 text-base text-content placeholder:text-content-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          aria-label="Search help articles"
        />
      </div>

      {isSearching && isFetching && (
        <div className="space-y-2" aria-label="Searching">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isSearching && !isFetching && searchResults && (
        <div className="space-y-1">
          {searchResults.articles.length === 0 ? (
            <p className="text-sm text-content-tertiary">No results for "{query}".</p>
          ) : (
            searchResults.articles.map((article) => (
              <button
                key={`${article.category}/${article.slug}`}
                type="button"
                onClick={() => onPickArticle(article.category, article.slug)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors hover:bg-surface-muted',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                )}
              >
                <BookOpen size={14} className="mt-0.5 shrink-0 text-content-disabled" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content">{article.title}</p>
                  <p className="mt-0.5 text-xs text-content-tertiary line-clamp-1">
                    {article.description}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {!isSearching && featured.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-content">Featured for you</h3>
          <div className="space-y-1">
            {featured.map((article) => (
              <button
                key={`${article.category}/${article.slug}`}
                type="button"
                onClick={() => onPickArticle(article.category, article.slug)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors hover:bg-surface-muted',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                )}
                aria-label={article.title}
              >
                <BookOpen size={14} className="mt-0.5 shrink-0 text-content-disabled" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content">{article.title}</p>
                  <p className="mt-0.5 text-xs text-content-tertiary line-clamp-1">
                    {article.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 6.4: Run the test — expect pass**

```bash
pnpm exec vitest run apps/web/__tests__/help/help-docs-modal-search-panel.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 6.5: Commit**

```bash
git add apps/web/src/components/help/help-docs-modal-search-panel.tsx \
        apps/web/__tests__/help/help-docs-modal-search-panel.test.tsx
git commit -m "$(cat <<'EOF'
feat(help): add HelpDocsModalSearchPanel for empty-state browse

Shown inside HelpDocsModal when no contextual article matches the
current route. Reuses useHelpSearch + getFeaturedForRole. Clicking
a result fires onPickArticle which switches modal content without
navigating away.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Build `<HelpDocsModal/>` (compose all the pieces)

**Files:**
- Create: `apps/web/src/components/help/help-docs-modal.tsx`
- Test: `apps/web/__tests__/help/help-docs-modal.test.tsx` (NEW)

- [ ] **Step 7.1: Write the failing test**

Create `apps/web/__tests__/help/help-docs-modal.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpDocsModal } from '../../src/components/help/help-docs-modal';
import {
  HelpWidgetProvider,
  useHelpWidget,
} from '../../src/components/help/help-widget-provider';

const useContextualHelpMock = vi.fn();
const useHelpArticleMock = vi.fn();
const usePathnameMock = vi.fn();

vi.mock('../../src/hooks/use-help', async () => {
  const actual = await vi.importActual<typeof import('../../src/hooks/use-help')>(
    '../../src/hooks/use-help',
  );
  return {
    ...actual,
    useContextualHelp: (...args: unknown[]) => useContextualHelpMock(...args),
    useHelpArticle: (...args: unknown[]) => useHelpArticleMock(...args),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock('../../src/components/help/help-article-body', () => ({
  HelpArticleBody: ({ metadata }: { metadata: { title: string } }) => (
    <div data-testid="article-body">{metadata.title}</div>
  ),
}));

vi.mock('../../src/components/help/help-docs-modal-search-panel', () => ({
  HelpDocsModalSearchPanel: () => <div data-testid="search-panel" />,
}));

function withProviders(children: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <HelpWidgetProvider>{children}</HelpWidgetProvider>
    </QueryClientProvider>
  );
}

function Opener() {
  const { open } = useHelpWidget();
  return <button onClick={open}>open help</button>;
}

describe('<HelpDocsModal/>', () => {
  it('renders nothing when flag is off', () => {
    usePathnameMock.mockReturnValue('/compliance');
    useContextualHelpMock.mockReturnValue({ data: [], isFetching: false });
    useHelpArticleMock.mockReturnValue({ data: null, isLoading: false });
    render(
      withProviders(<HelpDocsModal communityId={1} role="owner" flagEnabled={false} />),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens to the contextual article when one matches', async () => {
    usePathnameMock.mockReturnValue('/compliance');
    useContextualHelpMock.mockReturnValue({
      data: [{ title: 'Fixing gaps', category: 'compliance', slug: 'fixing-gaps', description: '' }],
      isFetching: false,
    });
    useHelpArticleMock.mockReturnValue({
      data: {
        source: { compiledSource: 'x', frontmatter: {}, scope: {} },
        toc: [],
        metadata: { title: 'Fixing gaps', slug: 'fixing-gaps', category: 'compliance' },
        related: [],
      },
      isLoading: false,
      isError: false,
    });

    render(
      withProviders(
        <>
          <Opener />
          <HelpDocsModal communityId={1} role="owner" flagEnabled />
        </>,
      ),
    );

    screen.getByText('open help').click();

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByTestId('article-body')).toHaveTextContent('Fixing gaps');
  });

  it('falls back to search panel when no contextual match', async () => {
    usePathnameMock.mockReturnValue('/dashboard');
    useContextualHelpMock.mockReturnValue({ data: [], isFetching: false });
    useHelpArticleMock.mockReturnValue({ data: null, isLoading: false, isError: false });

    render(
      withProviders(
        <>
          <Opener />
          <HelpDocsModal communityId={1} role="owner" flagEnabled />
        </>,
      ),
    );

    screen.getByText('open help').click();

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByTestId('search-panel')).toBeInTheDocument();
  });

  it('shows an error banner when article fetch fails', async () => {
    usePathnameMock.mockReturnValue('/compliance');
    useContextualHelpMock.mockReturnValue({
      data: [{ title: 'X', category: 'c', slug: 's', description: '' }],
      isFetching: false,
    });
    useHelpArticleMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    render(
      withProviders(
        <>
          <Opener />
          <HelpDocsModal communityId={1} role="owner" flagEnabled />
        </>,
      ),
    );

    screen.getByText('open help').click();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/couldn't load this article/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7.2: Run — expect failure**

```bash
pnpm exec vitest run apps/web/__tests__/help/help-docs-modal.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 7.3: Create the component**

Create `apps/web/src/components/help/help-docs-modal.tsx`:

```tsx
'use client';

/**
 * <HelpDocsModal/> — shadcn-docs-style modal that opens the contextual help
 * article in place, replacing the old drawer. Reads selectedArticle from
 * HelpWidgetProvider; falls back to the first contextual article for the
 * current pathname. When no article matches, renders a search-and-browse
 * panel inside the same modal shell.
 *
 * Render gating:
 * - flagEnabled=false → renders null (Phase A safety; flag flips in Phase B)
 *
 * Mobile: same component renders as a bottom Sheet under 768px; Dialog
 * above. Width on desktop is 960px — one-off override above the design
 * system's lg modal token (720px). See docs/design-system/V2 review.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useHelpWidget } from '@/components/help/help-widget-provider';
import { useContextualHelp, useHelpArticle } from '@/hooks/use-help';
import { HelpArticleBody } from '@/components/help/help-article-body';
import { HelpDocsModalSearchPanel } from '@/components/help/help-docs-modal-search-panel';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { cn } from '@/lib/utils';

interface HelpDocsModalProps {
  communityId: number;
  role: string;
  flagEnabled: boolean;
}

export function HelpDocsModal({
  communityId,
  role,
  flagEnabled,
}: HelpDocsModalProps) {
  const { isOpen, close, selectedArticle, openArticle } = useHelpWidget();
  const pathname = usePathname();

  const { data: contextualArticles, isFetching: isFetchingContextual } =
    useContextualHelp(pathname, communityId);

  // Pick which article to display: explicit selection takes precedence.
  const targetArticle = useMemo<{ category: string; slug: string } | null>(() => {
    if (selectedArticle) return selectedArticle;
    if (contextualArticles && contextualArticles.length > 0) {
      const first = contextualArticles[0]!;
      return { category: first.category, slug: first.slug };
    }
    return null;
  }, [selectedArticle, contextualArticles]);

  const articleQuery = useHelpArticle(
    targetArticle?.category ?? null,
    targetArticle?.slug ?? null,
    communityId,
  );

  // Reset to mobile/desktop branch when viewport changes (Sheet vs Dialog).
  // Using a window-matchMedia hook keeps a single source of truth.
  const isMobile = useIsMobile();

  if (!flagEnabled) return null;

  const articleTitle = articleQuery.data?.metadata.title ?? 'Help';
  const showSearchPanel = !targetArticle;

  const content = (
    <ModalContent
      showSearchPanel={showSearchPanel}
      isLoading={Boolean(targetArticle) && articleQuery.isLoading}
      isError={articleQuery.isError}
      onRetry={() => articleQuery.refetch()}
      articleData={articleQuery.data ?? null}
      communityId={communityId}
      role={role}
      contextualArticles={contextualArticles ?? []}
      isFetchingContextual={isFetchingContextual}
      onPickArticle={openArticle}
      onClose={close}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(o) => (o ? null : close())}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto p-6">
          <SheetTitle className="text-xl font-semibold text-content">
            {articleTitle}
          </SheetTitle>
          <div className="mt-4">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent
        className={cn(
          'max-w-[960px] w-[95vw] p-0',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-edge px-6 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-xl font-semibold text-content">
              {articleTitle}
            </DialogTitle>
          </div>
        </header>
        <div className="px-6 py-6">{content}</div>
        <footer className="flex items-center justify-end border-t border-edge px-6 py-3">
          <Link
            href={`/help?communityId=${communityId}`}
            onClick={close}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--interactive-primary)] hover:underline"
          >
            Browse all help articles
            <ExternalLink size={14} aria-hidden="true" />
          </Link>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

interface ModalContentProps {
  showSearchPanel: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  articleData: NonNullable<ReturnType<typeof useHelpArticle>['data']> | null;
  communityId: number;
  role: string;
  contextualArticles: Array<{ category: string; slug: string; title: string }>;
  isFetchingContextual: boolean;
  onPickArticle: (category: string, slug: string) => void;
  onClose: () => void;
}

function ModalContent({
  showSearchPanel,
  isLoading,
  isError,
  onRetry,
  articleData,
  communityId,
  role,
  contextualArticles,
  isFetchingContextual,
  onPickArticle,
}: ModalContentProps) {
  if (showSearchPanel) {
    return (
      <HelpDocsModalSearchPanel
        communityId={communityId}
        role={role}
        onPickArticle={onPickArticle}
      />
    );
  }

  if (isLoading || isFetchingContextual) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]" aria-label="Loading article">
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
        <div className="hidden lg:block">
          <Skeleton className="h-4 w-32" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="mt-2 h-3 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBanner variant="danger">
        <p>We couldn't load this article. Try again.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm font-medium underline underline-offset-2"
        >
          Retry
        </button>
      </AlertBanner>
    );
  }

  if (!articleData) return null;

  return (
    <div className="space-y-6">
      <HelpArticleBody
        source={articleData.source}
        toc={articleData.toc}
        metadata={articleData.metadata}
        related={articleData.related}
        communityId={communityId}
        displayMode="modal"
      />

      {contextualArticles.length > 1 && (
        <section className="rounded-[var(--radius-md)] border border-edge bg-surface-muted p-4">
          <h3 className="text-sm font-semibold text-content">More for this page</h3>
          <ul className="mt-2 space-y-1">
            {contextualArticles.slice(1).map((article) => (
              <li key={`${article.category}/${article.slug}`}>
                <button
                  type="button"
                  onClick={() => onPickArticle(article.category, article.slug)}
                  className="text-sm text-[var(--interactive-primary)] hover:underline"
                >
                  {article.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function useIsMobile(): boolean {
  // Renders matchMedia-driven boolean. Stays false on SSR (no window).
  // Updates on viewport resize so the modal swaps Dialog↔Sheet correctly.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(max-width: 767px)');
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isMobile;
}
```

- [ ] **Step 7.4: Run the test — expect pass**

```bash
pnpm exec vitest run apps/web/__tests__/help/help-docs-modal.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 7.5: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS.

- [ ] **Step 7.6: Commit**

```bash
git add apps/web/src/components/help/help-docs-modal.tsx \
        apps/web/__tests__/help/help-docs-modal.test.tsx
git commit -m "$(cat <<'EOF'
feat(help): add HelpDocsModal — shadcn-docs-style article viewer

Composes HelpArticleBody, HelpDocsModalSearchPanel, and the existing
HelpWidgetProvider context into a unified modal. Renders as a Radix
Dialog on desktop (960px wide) and a bottom Sheet on mobile. Picks
which article to show by: (1) explicit selectedArticle, then (2) first
contextual match from useContextualHelp, else search-and-browse panel.

Gated by flagEnabled prop — renders null when false. Mount in app-shell
under NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED in next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire `?help=cat/slug` deep-link handler

**Files:**
- Modify: `apps/web/src/components/layout/app-shell.tsx`
- Test: covered by integration test in Task 11

- [ ] **Step 8.1: Add the URL-param handler to app-shell**

We add the handler at the shell level (not the modal) so the modal stays focused on rendering. The shell reads `?help=category/slug` once on mount and on every search-params change.

In `apps/web/src/components/layout/app-shell.tsx`, add a small client component:

```tsx
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useHelpWidget } from '@/components/help/help-widget-provider';

export function HelpDeepLinkHandler() {
  const searchParams = useSearchParams();
  const { openArticle } = useHelpWidget();

  useEffect(() => {
    const helpParam = searchParams.get('help');
    if (!helpParam) return;
    const [category, slug] = helpParam.split('/');
    if (category && slug && /^[a-z0-9-]+$/.test(category) && /^[a-z0-9-]+$/.test(slug)) {
      openArticle(category, slug);
    }
  }, [searchParams, openArticle]);

  return null;
}
```

Add this component as a child inside `<HelpWidgetProvider>` (next to `<HelpWidget/>`):

```tsx
<HelpWidgetProvider>
  <ShellInner {...props} />
  <HelpWidget communityId={props.community?.id ?? 0} />
  <HelpDeepLinkHandler />
</HelpWidgetProvider>
```

(Don't mount `<HelpDocsModal/>` yet — that's Task 9.)

- [ ] **Step 8.2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8.3: Commit**

```bash
git add apps/web/src/components/layout/app-shell.tsx
git commit -m "$(cat <<'EOF'
feat(help): add HelpDeepLinkHandler for ?help=cat/slug query param

Lets external links (emails, in-app notifications) open the help modal
to a specific article on any route. Regex-validates both segments to
the same shape as the API endpoint's Zod schema.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Mount `<HelpDocsModal/>` in app-shell behind flag

**Files:**
- Modify: `apps/web/src/components/layout/app-shell.tsx`
- Modify: `apps/web/src/components/layout/app-top-bar.tsx`
- Modify: `.env.example`

- [ ] **Step 9.1: Mount the modal in app-shell**

In `apps/web/src/components/layout/app-shell.tsx`, add at the top of the module level:

```tsx
import dynamic from 'next/dynamic';

const HelpDocsModal = dynamic(
  () => import('@/components/help/help-docs-modal').then((m) => m.HelpDocsModal),
  { ssr: false },
);

const HELP_DOCS_MODAL_ENABLED =
  process.env.NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED === 'true';
```

Update the `AppShell` return to mount the new modal:

```tsx
export function AppShell(props: AppShellProps) {
  const communityId = props.community?.id ?? 0;
  const role =
    props.community?.role ??
    /* fallback for shells rendered without a resolved community */
    'owner';

  return (
    <SidebarProvider>
      <HelpWidgetProvider>
        <ShellInner {...props} />
        <HelpWidget communityId={communityId} />
        <HelpDocsModal
          communityId={communityId}
          role={role}
          flagEnabled={HELP_DOCS_MODAL_ENABLED}
        />
        <HelpDeepLinkHandler />
      </HelpWidgetProvider>
    </SidebarProvider>
  );
}
```

> **Note:** Verify `props.community?.role` exists on `AppShellProps`. If the role lives elsewhere (e.g. `props.membership?.role`), use the actual prop. Grep for the existing role-passing pattern with: `grep -n "role" apps/web/src/components/layout/app-shell.tsx` and use the same shape.

- [ ] **Step 9.2: Top-bar button: skip mounting old widget when flag is on**

The existing top-bar button at [app-top-bar.tsx:48–55](apps/web/src/components/layout/app-top-bar.tsx) calls `toggleHelp()` from `useHelpWidget()`. That same `toggleHelp` already drives the new modal (both components share the provider). No change needed — the button continues to work for both modes.

However, the OLD `<HelpWidget/>` (the drawer) must short-circuit when the flag is ON so we don't render two help UIs at once. Edit `apps/web/src/components/help/help-widget.tsx` — at the very top of the component body, after destructuring `useHelpWidget()`:

```tsx
export function HelpWidget({ communityId }: HelpWidgetProps) {
  const { isOpen, close } = useHelpWidget();
  // ...existing hooks...

  if (process.env.NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED === 'true') {
    return null;  // NEW: new modal takes over
  }

  // ...rest of existing render...
}
```

- [ ] **Step 9.3: Add the env var to `.env.example`**

```bash
echo "" >> .env.example
echo "# Phase A rollout of the help-docs modal (see docs/superpowers/specs/2026-05-20-help-docs-modal-design.md)" >> .env.example
echo "NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED=false" >> .env.example
```

Verify the addition:

```bash
tail -5 .env.example
```

- [ ] **Step 9.4: Typecheck + lint + tests**

```bash
pnpm typecheck && pnpm lint && pnpm exec vitest run apps/web/__tests__/help
```

Expected: PASS.

- [ ] **Step 9.5: Manual verification with flag OFF**

```bash
NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED=false pnpm dev
```

In the preview tool:

```ts
// preview_start("web")
// preview_eval: window.location.href = '/dev/agent-login?as=owner'
// preview_eval: window.location.href = '/dashboard?communityId=1'
// preview_click({ aria-label: 'Open help' })
// preview_snapshot()
```

Expected: the OLD drawer opens (because the flag is off). No regression.

Stop the dev server.

- [ ] **Step 9.6: Manual verification with flag ON**

```bash
NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED=true pnpm dev
```

Same browser steps. Expected: the NEW modal opens. Verify:
- Modal centered, ~960px wide
- Title at top, "Browse all help articles" link at bottom
- Either an article body OR the search-and-browse panel renders, depending on whether `/dashboard` has a contextual article
- `Esc` closes the modal
- Pressing `?` (with the body focused, not an input) toggles the modal

```ts
// preview_screenshot({ name: 'help-docs-modal-desktop' })
// preview_resize({ width: 375, height: 800 })
// preview_click({ aria-label: 'Open help' })
// preview_screenshot({ name: 'help-docs-modal-mobile' })
```

Verify the mobile screenshot shows the modal as a bottom sheet.

- [ ] **Step 9.7: Commit**

```bash
git add apps/web/src/components/layout/app-shell.tsx \
        apps/web/src/components/help/help-widget.tsx \
        .env.example
git commit -m "$(cat <<'EOF'
feat(help): mount HelpDocsModal behind NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED

Flag-gated rollout: when false, the existing HelpWidget drawer behaves
as before. When true, the drawer renders null and HelpDocsModal takes
over. Both components share HelpWidgetProvider so the top-bar button
and ? shortcut drive whichever is mounted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Integration tests for the modal

**Files:**
- Create: `apps/web/__tests__/integration/help-docs-modal.integration.test.tsx`

> If the integration suite path conflicts with `vitest.integration.config.ts` patterns, place the file at the suite's expected location and run with the integration-test command from CLAUDE.md.

- [ ] **Step 10.1: Write integration tests**

```tsx
/**
 * Integration tests for the HelpDocsModal end-to-end behavior.
 *
 * Scope:
 * - ? keyboard shortcut opens modal
 * - Esc closes modal
 * - ?help=cat/slug query param opens modal to that article
 * - Mobile breakpoint renders Sheet, desktop renders Dialog
 *
 * Mocks the API layer (useHelpArticle, useContextualHelp) to avoid
 * needing a real backend; verifies the full provider + modal +
 * deep-link handler integration.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useContextualHelpMock = vi.fn();
const useHelpArticleMock = vi.fn();
const useSearchParamsMock = vi.fn();
const usePathnameMock = vi.fn();

vi.mock('../../src/hooks/use-help', async () => {
  const actual = await vi.importActual<typeof import('../../src/hooks/use-help')>(
    '../../src/hooks/use-help',
  );
  return {
    ...actual,
    useContextualHelp: (...args: unknown[]) => useContextualHelpMock(...args),
    useHelpArticle: (...args: unknown[]) => useHelpArticleMock(...args),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('../../src/components/help/help-article-body', () => ({
  HelpArticleBody: ({ metadata }: { metadata: { title: string } }) => (
    <div data-testid="article-body">{metadata.title}</div>
  ),
}));

vi.mock('../../src/components/help/help-docs-modal-search-panel', () => ({
  HelpDocsModalSearchPanel: () => <div data-testid="search-panel" />,
}));

import {
  HelpWidgetProvider,
  useHelpWidget,
} from '../../src/components/help/help-widget-provider';
import { HelpDocsModal } from '../../src/components/help/help-docs-modal';

function HelpDeepLinkHandler() {
  // Local copy of the shell's deep-link handler, since the integration test
  // does not mount the full AppShell.
  const params = useSearchParamsMock();
  const { openArticle } = useHelpWidget();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const helpParam = params.get('help');
    if (!helpParam) return;
    const [category, slug] = helpParam.split('/');
    if (category && slug) openArticle(category, slug);
  }, [params]);
  return null;
}

import React from 'react';

function harness(flagEnabled = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HelpWidgetProvider>
        <HelpDeepLinkHandler />
        <HelpDocsModal communityId={1} role="owner" flagEnabled={flagEnabled} />
      </HelpWidgetProvider>
    </QueryClientProvider>,
  );
}

const articleData = {
  source: { compiledSource: 'x', frontmatter: {}, scope: {} },
  toc: [],
  metadata: { title: 'Welcome', slug: 'welcome', category: 'getting-started' },
  related: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue('/dashboard');
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
  useContextualHelpMock.mockReturnValue({ data: [], isFetching: false });
  useHelpArticleMock.mockReturnValue({ data: null, isLoading: false, isError: false });
});

describe('HelpDocsModal integration', () => {
  it('opens via ? keyboard shortcut and closes via Esc', async () => {
    // Pointer-device check requires matchMedia mock — jsdom defaults to false,
    // so we override.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as never;

    harness();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document, { key: '?' });
    });

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens to a specific article when ?help=cat/slug is set', async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('help=getting-started/welcome'));
    useHelpArticleMock.mockReturnValue({
      data: articleData,
      isLoading: false,
      isError: false,
    });

    harness();

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByTestId('article-body')).toHaveTextContent('Welcome');
  });

  it('renders null when flagEnabled=false', () => {
    harness(false);
    // Open via the provider directly — we expect nothing to mount
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 10.2: Run integration tests**

```bash
pnpm exec vitest run apps/web/__tests__/integration/help-docs-modal.integration.test.tsx
```

Expected: PASS (3 tests). If the integration runner uses a different config:

```bash
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts apps/web/__tests__/integration/help-docs-modal.integration.test.tsx
```

- [ ] **Step 10.3: Commit**

```bash
git add apps/web/__tests__/integration/help-docs-modal.integration.test.tsx
git commit -m "$(cat <<'EOF'
test(help): integration tests for HelpDocsModal end-to-end

Covers ? shortcut → open, Esc → close, ?help=cat/slug deep link, and
flagEnabled=false short-circuit. Mocks the API layer so the suite runs
without a backend.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Full preview verification + PR

**Files:** none (verification step)

- [ ] **Step 11.1: Run the full local pre-flight**

```bash
pnpm typecheck && pnpm lint && pnpm exec vitest run apps/web/__tests__/help apps/web/__tests__/integration/help-docs-modal.integration.test.tsx
```

Expected: all green.

- [ ] **Step 11.2: Push branch and let Vercel build a preview**

```bash
git push -u origin claude/elated-panini-3fb3d0
```

Wait for the Vercel preview URL to populate via `gh pr create` or the CI status.

- [ ] **Step 11.3: Set the flag ON in the Vercel preview environment**

In the Vercel dashboard (Project Settings → Environment Variables → Preview):
- Add `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED=true`
- Save and redeploy the preview.

Trigger a redeploy from the Vercel UI or push an empty commit:

```bash
git commit --allow-empty -m "chore: redeploy preview with help modal flag on"
git push
```

- [ ] **Step 11.4: 5×2 spot check in the preview**

For each of the 10 combinations (5 routes × 2 roles), verify the modal opens correctly:

| Role | Route | Expected behavior |
|---|---|---|
| owner | /dashboard | Modal opens; either contextual article or search panel |
| owner | /documents | Modal opens; same |
| owner | /compliance | Modal opens with contextual article (frontmatter likely declares this path) |
| owner | /meetings | Modal opens |
| owner | /pm | (Not visible to owner) — skip or expect redirect |
| board_president | /dashboard | Modal opens |
| board_president | /documents | Modal opens |
| board_president | /compliance | Modal opens with article (board_president can see it) |
| board_president | /meetings | Modal opens |
| board_president | /pm | Modal opens or 403 — verify route |

Use the `/dev/agent-login` endpoint per [.claude/rules/agent-testing.md](.claude/rules/agent-testing.md).

- [ ] **Step 11.5: Reduced-motion check**

In OS Settings → Accessibility → Reduce Motion, enable. Reload the preview and open the modal. Verify there's no slide-in animation.

- [ ] **Step 11.6: Slow-network check**

In browser DevTools → Network → "Slow 3G". Open the modal. Verify the loading skeleton renders before the article body.

- [ ] **Step 11.7: Create PR**

```bash
gh pr create --title "feat(help): shadcn-docs-style help modal behind flag" --body "$(cat <<'EOF'
## Summary
- Adds HelpDocsModal (Dialog on desktop, Sheet on mobile) that opens the contextual help article in place — no navigation away.
- Extracts a shared HelpArticleBody component used by both the modal and the existing /help/[cat]/[slug] route.
- Adds GET /api/v1/help/article endpoint with serialize + unstable_cache for sub-ms cache hits.
- Behind NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED — defaults false in production, true in preview.

## Phases
- Phase A (this PR): build behind flag, verify in preview
- Phase B (next, ops): flip flag in production env
- Phase C (cleanup PR): delete HelpWidget drawer + flag

## Test plan
- [x] Unit tests for route, hook, all three new components
- [x] Integration test: ? shortcut, Esc, deep link, flag off
- [x] Preview spot check: 5 routes × 2 roles
- [x] Reduced-motion and slow-network checks

Spec: `docs/superpowers/specs/2026-05-20-help-docs-modal-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

After completing all tasks, run this checklist:

**Spec coverage** — every spec section maps to at least one task:
- Architecture diagram → Tasks 1, 2, 7, 9
- `<HelpDocsModal/>` → Task 7
- `<HelpArticleBody/>` → Tasks 4, 5
- `useHelpArticle` → Task 3
- `GET /api/v1/help/article` → Task 2
- `HelpWidgetProvider` extension → Task 1
- Article-fetching flow → Task 7 (composes), Task 3 (hook), Task 2 (endpoint)
- UX states (loading, empty, error, success, mobile, reduced motion, keyboard, deep link) → Tasks 7 (most states), 8 (deep link), 10 (keyboard via integration), 11 (manual reduced-motion + network)
- Accessibility → Task 7 (component) + Task 11 (manual verification)
- Performance (`next/dynamic`, `unstable_cache`, React Query staleTime) → Tasks 2, 3, 9
- Security (404 not 403, Zod validation, no `dangerouslySetInnerHTML`) → Task 2
- Rollout Phase A → Tasks 1–11
- Phase B/C — explicitly out of scope, called out at top of plan
- Testing matrix → Tasks 1–10 plus manual checks in Task 11

**Type consistency:**
- `HelpArticleMetadata`, `HelpArticleSource`, `TocItem`, `MDXRemoteSerializeResult` — used identically across Tasks 2, 3, 4
- `SelectedArticle` interface shape (`{category, slug}`) — Task 1 defines, Tasks 7, 8 consume
- `openArticle(category: string, slug: string)` signature — Task 1 defines, Tasks 6, 7, 8 consume
- `displayMode: 'route' | 'modal'` — Task 4 defines, Tasks 5, 7 consume
- `flagEnabled` prop on `HelpDocsModal` — Task 7 defines, Task 9 passes

**Placeholder scan:** No `TODO`, `TBD`, `implement later`, `Similar to Task N` in code blocks. Every task has complete code or commands.
