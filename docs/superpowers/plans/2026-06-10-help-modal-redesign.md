# Help Modal Redesign ("Showcase") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the contextual help modal as a media-led experience — in-modal navigation stack, persistent search, MediaFrame screenshots/clips in articles — plus the asset/capture pipeline and seeded media for ~10 top articles.

**Architecture:** The modal renders articles as server-rendered sanitized static HTML (`serialize → MDXRemote → renderToStaticMarkup → sanitizeHelpHtml → dangerouslySetInnerHTML`); all interactivity comes from a delegation enhancer in the client wrapper. Media is plain `<img>`/`<video>` (NO `next/image` — unexercised under `renderToStaticMarkup`; the sanitizer strips `style` attrs, so layout stability comes from `width`/`height` attributes, never inline styles). Cached HTML gets a `RENDER_VERSION` cache-key component because Vercel's data cache outlives deploys.

**Tech Stack:** Next.js 15 / React 19, Radix Dialog (shadcn), TanStack Query, next-mdx-remote, isomorphic-dompurify (deny-based config — defaults already allow video/source/data-*), Playwright + sharp + ffmpeg (capture, local only), vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-06-10-help-modal-redesign-design.md`

**Worktree note:** fresh worktrees need `pnpm install && pnpm turbo run build --filter='./packages/*'` or web tests fail resolving `@propertypro/api-contract`.

**PR grouping:** PR-A: Tasks 1–2 (pipeline safety). PR-B: Tasks 3–8 (content components + schema + guard). PR-C: Tasks 9–13 (modal experience + API). PR-D: Tasks 14–16 (capture + seeding). Task 17 (verification) runs per-PR.

**Verified facts the plan relies on (do not re-litigate):**
- `HelpArticleBody` is consumed ONLY by `help-docs-modal.tsx`. The route page `/help/[category]/[slug]/page.tsx` renders its own JSX via `compileMDX` and is OUT OF SCOPE (it inherits upgraded MDX components automatically).
- DOMPurify 3.3.1 defaults allow `video`, `source`, `autoplay`, `muted`, `loop`, `playsinline`, `poster`, `controls`, `data-*`, `srcset`. Sanitizer config is deny-based (`FORBID_TAGS`) — NO config changes. `FORBID_ATTR: ['style']` means inline styles are STRIPPED — components must never rely on them.
- The contextual route hardcodes `getContextualArticles(query.path, effectiveRole, 3)`.
- `guard:help-content` = `scripts/verify-help-content.ts`, run by `pnpm lint`.
- `sharp` is already in `apps/web/package.json`; `playwright` + `@playwright/test` already at repo root; scripts run via `tsx`.
- Status token Tailwind classes exist (used by AlertBanner): `bg-status-{info,warning,success,danger,brand,neutral}-subtle`, `border-status-*-border`, `text-status-*`.

---

## Task 1: RENDER_VERSION cache-key module

The compiled-article cache key is `category:slug:contentHash` (`apps/web/src/app/api/v1/help/article/route.ts:87`). Vercel data cache persists across deploys → component markup changes would serve stale HTML. Extract a versioned key builder.

**Files:**
- Create: `apps/web/src/lib/help/render-version.ts`
- Create: `apps/web/src/lib/help/__tests__/render-version.test.ts`
- Modify: `apps/web/src/app/api/v1/help/article/route.ts:87`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/help/__tests__/render-version.test.ts
import { describe, expect, it } from 'vitest';
import { HELP_RENDER_VERSION, helpArticleCacheKey } from '@/lib/help/render-version';

describe('helpArticleCacheKey', () => {
  it('includes category, slug, contentHash and render version', () => {
    const key = helpArticleCacheKey('compliance', 'reviewing-the-compliance-dashboard', 'abc123');
    expect(key).toBe(`compliance:reviewing-the-compliance-dashboard:abc123:v${HELP_RENDER_VERSION}`);
  });

  it('produces distinct keys for distinct content hashes', () => {
    expect(helpArticleCacheKey('a', 'b', 'h1')).not.toBe(helpArticleCacheKey('a', 'b', 'h2'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/lib/help/__tests__/render-version.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/help/render-version.ts
/**
 * Version stamp for server-rendered help article HTML.
 *
 * The compiled HTML for the help modal is stored in `unstable_cache`, which
 * persists across deployments on Vercel. The content hash alone cannot see
 * changes to the MDX component markup (mdx-components.tsx, MediaFrame, …) —
 * bump this constant whenever a component change alters rendered output, or
 * stale markup will be served for every article whose MDX didn't change.
 */
export const HELP_RENDER_VERSION = 2;

export function helpArticleCacheKey(
  category: string,
  slug: string,
  contentHash: string,
): string {
  return `${category}:${slug}:${contentHash}:v${HELP_RENDER_VERSION}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/lib/help/__tests__/render-version.test.ts`
Expected: PASS

- [ ] **Step 5: Wire into the article route**

In `apps/web/src/app/api/v1/help/article/route.ts`, add the import and replace the key line:

```ts
import { helpArticleCacheKey } from '@/lib/help/render-version';
```

Replace (line ~87):
```ts
  const key = `${article.metadata.category}:${article.metadata.slug}:${article.metadata.contentHash}`;
```
with:
```ts
  const key = helpArticleCacheKey(
    article.metadata.category,
    article.metadata.slug,
    article.metadata.contentHash,
  );
```

- [ ] **Step 6: Run the article route's existing tests**

Run: `cd apps/web && pnpm exec vitest run --dir . -t "help" 2>&1 | tail -20` — or, more precisely, grep for the route's test file first: `grep -rl "help/article" apps/web/__tests__ | head`. Run whatever matches.
Expected: PASS (the key change is internal; if a test asserts the literal key string, update it to use `helpArticleCacheKey`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/help/render-version.ts apps/web/src/lib/help/__tests__/render-version.test.ts apps/web/src/app/api/v1/help/article/route.ts
git commit -m "fix(help): version the compiled-article cache key

unstable_cache persists across deploys; contentHash alone cannot see
MDX component markup changes. HELP_RENDER_VERSION busts the cache when
rendered output changes."
```

---

## Task 2: Sanitizer pinning tests (no config change)

The redesign depends on specific DOMPurify default behaviors. Pin them so a future dompurify upgrade or config edit cannot silently break media.

**Files:**
- Modify: `apps/web/src/lib/help/__tests__/sanitize-help-html.test.ts` (append a describe block)

- [ ] **Step 1: Append the pinning tests**

```ts
// append to apps/web/src/lib/help/__tests__/sanitize-help-html.test.ts
describe('media markup survival (MediaFrame contract)', () => {
  it('keeps <video> with playback attributes and poster', () => {
    const html =
      '<video muted loop playsinline preload="metadata" poster="/help/c/s/poster.webp" width="1440" height="900" data-zoomable data-media-kind="clip"><source src="/help/c/s/clip.mp4" type="video/mp4"></source></video>';
    const out = sanitizeHelpHtml(html);
    expect(out).toContain('<video');
    expect(out).toContain('muted');
    expect(out).toContain('loop');
    expect(out).toContain('playsinline');
    expect(out).toContain('poster="/help/c/s/poster.webp"');
    expect(out).toContain('<source');
    expect(out).toContain('data-zoomable');
    expect(out).toContain('data-media-kind="clip"');
  });

  it('never lets autoplay through MediaFrame markup by construction, but DOES allow the attribute (documents default)', () => {
    // We rely on MediaFrame to omit autoplay; the sanitizer would pass it.
    // This test documents that the enhancer — not the sanitizer — owns playback.
    const out = sanitizeHelpHtml('<video autoplay muted></video>');
    expect(out).toContain('autoplay');
  });

  it('keeps img srcset/loading/decoding/width/height and data-zoomable', () => {
    const html =
      '<img src="/help/c/s/shot.webp" srcset="/help/c/s/shot.webp 1x, /help/c/s/shot@2x.webp 2x" alt="x" loading="lazy" decoding="async" width="1440" height="900" data-zoomable data-media-kind="image">';
    const out = sanitizeHelpHtml(html);
    expect(out).toContain('srcset=');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('width="1440"');
    expect(out).toContain('data-zoomable');
  });

  it('keeps <button data-media-play> (reduced-motion play affordance)', () => {
    const out = sanitizeHelpHtml('<button type="button" data-media-play aria-label="Play">p</button>');
    expect(out).toContain('data-media-play');
  });

  it('strips inline style attributes — components must not rely on them', () => {
    const out = sanitizeHelpHtml('<img src="/x.webp" style="aspect-ratio: 16/9" alt="">');
    expect(out).not.toContain('style=');
  });
});
```

(Match the existing import/describe style at the top of the file; `sanitizeHelpHtml` is already imported there.)

- [ ] **Step 2: Run the tests**

Run: `cd apps/web && pnpm exec vitest run src/lib/help/__tests__/sanitize-help-html.test.ts`
Expected: PASS immediately (these pin current behavior). If any FAIL, STOP — the spec's assumptions are wrong; re-verify before proceeding.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/help/__tests__/sanitize-help-html.test.ts
git commit -m "test(help): pin sanitizer defaults that MediaFrame relies on"
```

---

## Task 3: Category meta config

**Files:**
- Create: `apps/web/src/lib/help/category-meta.ts`
- Create: `apps/web/src/lib/help/__tests__/category-meta.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/help/__tests__/category-meta.test.ts
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getHelpCategoryMeta, HELP_CATEGORY_META } from '@/lib/help/category-meta';

describe('getHelpCategoryMeta', () => {
  it('has an explicit entry for every content category directory', () => {
    const contentRoot = join(__dirname, '..', '..', '..', 'content', 'help');
    const dirs = readdirSync(contentRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const dir of dirs) {
      expect(HELP_CATEGORY_META[dir], `missing category-meta entry for "${dir}"`).toBeDefined();
    }
  });

  it('falls back to a generic entry for unknown categories', () => {
    const meta = getHelpCategoryMeta('not-a-category');
    expect(meta.label).toBe('Not a category');
    expect(meta.icon).toBeDefined();
    expect(meta.chipClass).toContain('bg-surface-muted');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/lib/help/__tests__/category-meta.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/help/category-meta.ts
/**
 * Category → icon + chip tint for help UI chrome (modal header chip,
 * search-panel rows). Tints reuse existing status-token classes only —
 * this is the full extent of "category art" per the design spec.
 */
import {
  Banknote,
  Building2,
  CalendarDays,
  ClipboardList,
  FileSignature,
  FileText,
  Megaphone,
  MessagesSquare,
  Rocket,
  Scale,
  ScrollText,
  ShieldCheck,
  Siren,
  TriangleAlert,
  UserCircle,
  Users,
  Vote,
  Wrench,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';

export interface HelpCategoryMeta {
  label: string;
  icon: LucideIcon;
  chipClass: string;
}

const NEUTRAL_CHIP = 'bg-surface-muted text-content-secondary border-edge';
const BRAND_CHIP = 'bg-status-brand-subtle text-status-brand border-status-brand-border';
const WARNING_CHIP = 'bg-status-warning-subtle text-status-warning border-status-warning-border';
const DANGER_CHIP = 'bg-status-danger-subtle text-status-danger border-status-danger-border';
const SUCCESS_CHIP = 'bg-status-success-subtle text-status-success border-status-success-border';

export const HELP_CATEGORY_META: Record<string, HelpCategoryMeta> = {
  account: { label: 'Account', icon: UserCircle, chipClass: NEUTRAL_CHIP },
  announcements: { label: 'Announcements', icon: Megaphone, chipClass: BRAND_CHIP },
  apartment: { label: 'Apartment', icon: Building2, chipClass: NEUTRAL_CHIP },
  audit: { label: 'Audit', icon: ClipboardList, chipClass: NEUTRAL_CHIP },
  compliance: { label: 'Compliance', icon: ShieldCheck, chipClass: BRAND_CHIP },
  contracts: { label: 'Contracts', icon: ScrollText, chipClass: NEUTRAL_CHIP },
  documents: { label: 'Documents', icon: FileText, chipClass: BRAND_CHIP },
  elections: { label: 'Elections', icon: Vote, chipClass: BRAND_CHIP },
  emergency: { label: 'Emergency', icon: Siren, chipClass: DANGER_CHIP },
  esign: { label: 'E-Sign', icon: FileSignature, chipClass: NEUTRAL_CHIP },
  finance: { label: 'Finance', icon: Banknote, chipClass: SUCCESS_CHIP },
  forum: { label: 'Board forum', icon: MessagesSquare, chipClass: NEUTRAL_CHIP },
  'getting-started': { label: 'Getting started', icon: Rocket, chipClass: BRAND_CHIP },
  maintenance: { label: 'Maintenance', icon: Wrench, chipClass: WARNING_CHIP },
  meetings: { label: 'Meetings', icon: CalendarDays, chipClass: BRAND_CHIP },
  pm: { label: 'Property management', icon: Briefcase, chipClass: NEUTRAL_CHIP },
  residents: { label: 'Residents', icon: Users, chipClass: NEUTRAL_CHIP },
  transparency: { label: 'Transparency', icon: Scale, chipClass: NEUTRAL_CHIP },
  violations: { label: 'Violations', icon: TriangleAlert, chipClass: WARNING_CHIP },
};

export function getHelpCategoryMeta(category: string): HelpCategoryMeta {
  const known = HELP_CATEGORY_META[category];
  if (known) return known;
  const label = category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
  return { label, icon: FileText, chipClass: NEUTRAL_CHIP };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/lib/help/__tests__/category-meta.test.ts`
Expected: PASS. If the directory-coverage assertion fails, add the missing category entry — do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/help/category-meta.ts apps/web/src/lib/help/__tests__/category-meta.test.ts
git commit -m "feat(help): category meta config (icon + token tint per category)"
```

---

## Task 4: MediaFrame component

The single renderer for hero/step/authored media. Plain `<img>`/`<video>`, no hooks, no inline styles (sanitizer strips `style`), `width`/`height` attributes provide intrinsic aspect ratio (native browser layout-shift prevention).

**Files:**
- Create: `apps/web/src/components/help/media-frame.tsx`
- Create: `apps/web/src/components/help/__tests__/media-frame.test.tsx`

- [ ] **Step 1: Write the failing test**

The test round-trips through `renderToStaticMarkup` + `sanitizeHelpHtml` — exactly the modal pipeline — so it proves the markup survives sanitization.

```tsx
// apps/web/src/components/help/__tests__/media-frame.test.tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MediaFrame, mediaKindFromSrc } from '@/components/help/media-frame';
import { sanitizeHelpHtml } from '@/lib/help/sanitize-help-html';

function renderSanitized(el: React.ReactElement): string {
  return sanitizeHelpHtml(renderToStaticMarkup(el));
}

describe('mediaKindFromSrc', () => {
  it('detects clips by extension', () => {
    expect(mediaKindFromSrc('/help/c/s/flow.mp4')).toBe('clip');
    expect(mediaKindFromSrc('/help/c/s/flow.webm')).toBe('clip');
    expect(mediaKindFromSrc('/help/c/s/shot.webp')).toBe('image');
    expect(mediaKindFromSrc('/help/c/s/shot.png')).toBe('image');
  });
});

describe('MediaFrame', () => {
  it('renders an image with lazy loading, dimensions, and zoom hook — surviving sanitization', () => {
    const out = renderSanitized(
      <MediaFrame src="/help/compliance/x/shot.webp" alt="Dashboard" width={1440} height={900} />,
    );
    expect(out).toContain('<img');
    expect(out).toContain('src="/help/compliance/x/shot.webp"');
    expect(out).toContain('width="1440"');
    expect(out).toContain('height="900"');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('data-zoomable');
    expect(out).toContain('data-media-kind="image"');
    expect(out).not.toContain('style=');
  });

  it('emits a 2x srcset when src2x is provided', () => {
    const out = renderSanitized(
      <MediaFrame src="/h.webp" src2x="/h@2x.webp" alt="x" width={720} height={450} />,
    );
    expect(out).toContain('srcset="/h.webp 1x, /h@2x.webp 2x"');
  });

  it('renders a clip as muted looping video WITHOUT autoplay, with poster, play button, and GIF tag', () => {
    const out = renderSanitized(
      <MediaFrame
        src="/help/compliance/x/flow.mp4"
        poster="/help/compliance/x/flow-poster.webp"
        alt="Walkthrough"
        width={1440}
        height={900}
      />,
    );
    expect(out).toContain('<video');
    expect(out).not.toContain('autoplay');
    expect(out).toContain('muted');
    expect(out).toContain('loop');
    expect(out).toContain('playsinline');
    expect(out).toContain('poster="/help/compliance/x/flow-poster.webp"');
    expect(out).toContain('data-media-kind="clip"');
    expect(out).toContain('data-media-play');
    expect(out).toContain('GIF');
  });

  it('renders a caption in a figcaption', () => {
    const out = renderSanitized(
      <MediaFrame src="/h.webp" alt="x" width={720} height={450} caption="The gaps panel" />,
    );
    expect(out).toContain('<figcaption');
    expect(out).toContain('The gaps panel');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/components/help/__tests__/media-frame.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// apps/web/src/components/help/media-frame.tsx
/**
 * <MediaFrame/> — the single renderer for help article media (hero, steps,
 * authored screenshots/clips). Renders in TWO pipelines:
 *
 *  1. Modal: serialize → renderToStaticMarkup → sanitizeHelpHtml →
 *     dangerouslySetInnerHTML. Static, inert markup; the delegation
 *     enhancer in HelpArticleBody provides all interactivity via the
 *     data-zoomable / data-media-kind / data-media-play hooks.
 *  2. Route pages: compileMDX live render (same markup, also inert).
 *
 * HARD CONSTRAINTS (pinned by sanitize-help-html.test.ts):
 *  - No inline styles: the sanitizer strips `style`. Aspect ratio comes
 *    from width/height attributes (native intrinsic-size behavior).
 *  - No `autoplay` attribute: playback is owned by the enhancer so
 *    prefers-reduced-motion users never see motion (no pre-JS flash).
 *  - No next/image: unexercised under renderToStaticMarkup, and it would
 *    bake /_next/image URLs into long-lived cached HTML.
 *  - No hooks/handlers: the static pipeline drops them silently.
 */
import { Play } from 'lucide-react';

const CLIP_EXTENSIONS = /\.(mp4|webm)$/i;

export type MediaKind = 'image' | 'clip';

export function mediaKindFromSrc(src: string): MediaKind {
  return CLIP_EXTENSIONS.test(src) ? 'clip' : 'image';
}

export interface MediaFrameProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  /** Optional retina source; emitted as `srcset="src 1x, src2x 2x"`. */
  src2x?: string;
  /** Required for clips: still frame shown before playback starts. */
  poster?: string;
}

export function MediaFrame({ src, alt, width, height, caption, src2x, poster }: MediaFrameProps) {
  const kind = mediaKindFromSrc(src);

  return (
    <figure className="my-6" data-media-frame>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-edge">
        <div className="flex items-center gap-1.5 border-b border-edge-subtle bg-surface-muted px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-edge-strong" aria-hidden="true" />
          <span className="h-1.5 w-1.5 rounded-full bg-edge-strong" aria-hidden="true" />
          <span className="h-1.5 w-1.5 rounded-full bg-edge-strong" aria-hidden="true" />
          {kind === 'clip' && (
            <span className="ml-auto text-xs font-medium tracking-wide text-content-tertiary">
              GIF
            </span>
          )}
        </div>
        {kind === 'clip' ? (
          <span className="relative block">
            <video
              muted
              loop
              playsInline
              preload="metadata"
              poster={poster}
              width={width}
              height={height}
              data-zoomable
              data-media-kind="clip"
              data-media-alt={alt}
              className="block h-auto w-full"
              aria-label={alt}
            >
              <source src={src} type={src.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
            </video>
            <button
              type="button"
              data-media-play
              aria-label={`Play: ${alt}`}
              className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-edge bg-surface-card text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Play size={20} aria-hidden="true" />
            </button>
          </span>
        ) : (
          <img
            src={src}
            srcSet={src2x ? `${src} 1x, ${src2x} 2x` : undefined}
            alt={alt}
            width={width}
            height={height}
            loading="lazy"
            decoding="async"
            data-zoomable
            data-media-kind="image"
            className="block h-auto w-full"
          />
        )}
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-content-tertiary">{caption}</figcaption>
      )}
    </figure>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/components/help/__tests__/media-frame.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/help/media-frame.tsx apps/web/src/components/help/__tests__/media-frame.test.tsx
git commit -m "feat(help): MediaFrame — single sanitizer-safe renderer for article media"
```

---

## Task 5: Fix StepByStep/Step and integrate MediaFrame

Two verified bugs: the step-number circle is an empty div (`mdx-components.tsx:103-106`), and the rail uses `bg-border-default`, a class that does not exist (`apps/web/tailwind.config.ts` defines the color as `edge`). Numbering uses `Children`-index injection rather than the spec's CSS counters: it produces real DOM text (testable in JSDOM, identical in both render pipelines, no global stylesheet edit). Document this deviation in the PR description.

**Files:**
- Modify: `apps/web/src/components/help/mdx-components.tsx` (Step, StepByStep)
- Create: `apps/web/src/components/help/__tests__/step-by-step.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/help/__tests__/step-by-step.test.tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Step, StepByStep } from '@/components/help/mdx-components';

describe('StepByStep', () => {
  it('renders visible 1-based step numbers and listitem roles', () => {
    const out = renderToStaticMarkup(
      <StepByStep>
        <Step title="Open the gaps panel">From the score card.</Step>
        <Step title="Sort by deadline">Urgent bucket first.</Step>
      </StepByStep>,
    );
    expect(out).toContain('role="list"');
    expect((out.match(/role="listitem"/g) ?? []).length).toBe(2);
    expect(out).toContain('>1<');
    expect(out).toContain('>2<');
  });

  it('uses an existing rail class and hides the rail on the last step', () => {
    const out = renderToStaticMarkup(
      <StepByStep>
        <Step title="One">a</Step>
        <Step title="Two">b</Step>
      </StepByStep>,
    );
    expect(out).not.toContain('bg-border-default');
    expect(out).toContain('bg-edge');
  });

  it('renders a step image through MediaFrame markup', () => {
    const out = renderToStaticMarkup(
      <StepByStep>
        <Step title="One" image="/help/c/s/step-1.webp" imageAlt="Step one">a</Step>
      </StepByStep>,
    );
    expect(out).toContain('data-media-frame');
    expect(out).toContain('data-zoomable');
    expect(out).toContain('src="/help/c/s/step-1.webp"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/components/help/__tests__/step-by-step.test.tsx`
Expected: FAIL — no numbers rendered, `bg-border-default` present, no MediaFrame markup.

- [ ] **Step 3: Rewrite Step and StepByStep**

In `apps/web/src/components/help/mdx-components.tsx`: add imports `Children, cloneElement` from `react` (extend the existing `import { isValidElement } from 'react';` line) and `import { MediaFrame } from '@/components/help/media-frame';`. Replace the `StepProps`/`Step`/`StepByStepProps`/`StepByStep` block (currently lines ~89–136) with:

```tsx
interface StepProps {
  title: string;
  image?: string;
  imageAlt?: string;
  /** Step screenshot dimensions; default matches the 1440×900 capture viewport. */
  imageWidth?: number;
  imageHeight?: number;
  children: ReactNode;
  /** Injected by <StepByStep/> — do not set in MDX. */
  index?: number;
  /** Injected by <StepByStep/> — do not set in MDX. */
  isLast?: boolean;
}

export function Step({
  title,
  image,
  imageAlt,
  imageWidth = 1440,
  imageHeight = 900,
  children,
  index,
  isLast = false,
}: StepProps) {
  return (
    <div className="relative pb-8 pl-9 last:pb-0" role="listitem">
      {!isLast && (
        <div className="absolute bottom-0 left-3 top-8 w-px bg-edge" aria-hidden="true" />
      )}
      <div
        className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--interactive-primary)] text-xs font-semibold text-white"
        aria-hidden="true"
      >
        {index}
      </div>
      <div>
        <h4 className="mb-1 text-sm font-semibold text-content">{title}</h4>
        <div className="text-sm leading-relaxed text-content-secondary">{children}</div>
        {image && (
          <MediaFrame
            src={image}
            alt={imageAlt ?? title}
            width={imageWidth}
            height={imageHeight}
          />
        )}
      </div>
    </div>
  );
}

interface StepByStepProps {
  children: ReactNode;
}

export function StepByStep({ children }: StepByStepProps) {
  // MDX may interleave whitespace text nodes between <Step> elements —
  // filter to elements before computing indices.
  const steps = Children.toArray(children).filter(isValidElement);
  return (
    <div className="my-6" role="list" aria-label="Step-by-step guide">
      {steps.map((child, i) =>
        cloneElement(child as React.ReactElement<StepProps>, {
          index: i + 1,
          isLast: i === steps.length - 1,
        }),
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/components/help/__tests__/step-by-step.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/help/mdx-components.tsx apps/web/src/components/help/__tests__/step-by-step.test.tsx
git commit -m "fix(help): render step numbers and rail; route step images through MediaFrame"
```

---

## Task 6: Tokenize Callout/statute/feedback; map markdown img; delete Screenshot

**Files:**
- Modify: `apps/web/src/components/help/mdx-components.tsx` (Callout styles, component map, delete Screenshot)
- Modify: `apps/web/src/components/help/article-feedback.tsx` (emerald/red → status tokens)
- Test: `apps/web/src/components/help/__tests__/step-by-step.test.tsx` (existing), plus a new callout test

- [ ] **Step 1: Confirm Screenshot is delete-safe**

Run: `grep -rn "Screenshot" apps/web/src apps/web/__tests__ --include="*.ts*" | grep -v "media-frame" | grep -v "\.mdx"`
Expected: only the definition in `mdx-components.tsx` and the `helpMdxComponents` map entry. If anything else imports it, STOP and update that consumer to MediaFrame first.

- [ ] **Step 2: Write the failing Callout test**

```tsx
// apps/web/src/components/help/__tests__/callout.test.tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Callout } from '@/components/help/mdx-components';

describe('Callout', () => {
  it('uses status tokens and an svg icon, never raw palette classes or emoji', () => {
    const out = renderToStaticMarkup(<Callout type="warning" title="Heads up">Body</Callout>);
    expect(out).toContain('bg-status-warning-subtle');
    expect(out).toContain('border-status-warning-border');
    expect(out).toContain('<svg');
    expect(out).not.toMatch(/bg-(blue|amber|emerald|purple)-50/);
    expect(out).not.toContain('⚠');
  });

  it('shows the variant label when no title is given (no color-only status)', () => {
    const out = renderToStaticMarkup(<Callout type="tip">Body</Callout>);
    expect(out).toContain('Tip');
  });
});
```

Run: `cd apps/web && pnpm exec vitest run src/components/help/__tests__/callout.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite CALLOUT_STYLES and Callout**

In `mdx-components.tsx`, add to the lucide import (alongside `Play` usage in media-frame — this file imports its own): `import { Info, Lightbulb, Scale, TriangleAlert, type LucideIcon } from 'lucide-react';` and replace the `CALLOUT_STYLES` const and `Callout` (lines ~29–87) with:

```tsx
const CALLOUT_STYLES: Record<
  string,
  { container: string; title: string; Icon: LucideIcon; label: string }
> = {
  info: {
    container: 'border-status-info-border bg-status-info-subtle',
    title: 'text-status-info',
    Icon: Info,
    label: 'Note',
  },
  warning: {
    container: 'border-status-warning-border bg-status-warning-subtle',
    title: 'text-status-warning',
    Icon: TriangleAlert,
    label: 'Warning',
  },
  tip: {
    container: 'border-status-success-border bg-status-success-subtle',
    title: 'text-status-success',
    Icon: Lightbulb,
    label: 'Tip',
  },
  'florida-statute': {
    container: 'border-status-brand-border bg-status-brand-subtle',
    title: 'text-status-brand',
    Icon: Scale,
    label: 'Florida statute',
  },
};

type CalloutType = keyof typeof CALLOUT_STYLES;

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const style = CALLOUT_STYLES[type] ?? CALLOUT_STYLES.info!;
  const { Icon } = style;

  return (
    <div className={cn('my-6 rounded-[var(--radius-md)] border p-4', style.container)} role="note">
      <div className="flex items-start gap-3">
        <Icon size={18} className={cn('mt-0.5 shrink-0', style.title)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={cn('mb-1 text-sm font-semibold', style.title)}>{title ?? style.label}</p>
          <div className="text-sm leading-relaxed text-content-secondary">{children}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Delete Screenshot; add img mapping; export MediaFrame in the MDX map**

Delete the `ScreenshotProps` interface and `Screenshot` function (lines ~138–157). Remove `Screenshot,` from `helpMdxComponents` and delete the now-unused `import Image from 'next/image';`. Add to `helpMdxComponents`:

```tsx
  MediaFrame,
  // Markdown ![alt](src) fallback: framed, lazy, zoomable — but no
  // width/height, so no aspect reservation. Authored media should use
  // <MediaFrame> (see content AUTHORING.md). span, not div: markdown
  // images render inside <p>.
  img: ({ src, alt }: ComponentPropsWithoutRef<'img'>) => (
    <span className="my-6 block overflow-hidden rounded-[var(--radius-md)] border border-edge">
      <img
        src={typeof src === 'string' ? src : undefined}
        alt={alt ?? ''}
        loading="lazy"
        decoding="async"
        data-zoomable
        data-media-kind="image"
        className="block h-auto w-full"
      />
    </span>
  ),
```

- [ ] **Step 5: Tokenize article-feedback states**

Run: `grep -n "emerald\|red-700\|red-600" apps/web/src/components/help/article-feedback.tsx`
Replace `text-emerald-*` classes with `text-status-success` and `text-red-*` with `text-status-danger` at the reported lines (review found 169 and 175; trust the grep).

- [ ] **Step 6: Run the help component test suites**

Run: `cd apps/web && pnpm exec vitest run src/components/help/`
Expected: PASS (callout test now green; step tests still green; if `help-article-body.render.test.tsx` asserts old markup, leave it — Task 10 rewrites it).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/help/mdx-components.tsx apps/web/src/components/help/article-feedback.tsx apps/web/src/components/help/__tests__/callout.test.tsx
git commit -m "refactor(help): tokenize callouts/feedback, map markdown img, delete unused Screenshot"
```

---

## Task 7: Frontmatter heroMedia/upNext + metadata plumbing + upNext resolution

**Files:**
- Modify: `apps/web/src/lib/help/frontmatter-schema.ts`
- Modify: `apps/web/src/lib/services/help-article-service.ts` (`HelpArticleMetadata` + `parseArticleFrontmatter` mapping near line 155)
- Modify: `apps/web/src/app/api/v1/help/article/route.ts` (resolve `upNext`)
- Modify: `apps/web/src/hooks/use-help.ts` (`HelpArticleResponse`)
- Test: extend `apps/web/src/lib/help/__tests__/` frontmatter tests (check `ls apps/web/src/lib/help/__tests__/` — if no frontmatter test exists, create `frontmatter-schema.test.ts`)

- [ ] **Step 1: Write the failing schema test**

```ts
// apps/web/src/lib/help/__tests__/frontmatter-schema.test.ts (create or extend)
import { describe, expect, it } from 'vitest';
import { validateFrontmatter } from '@/lib/help/frontmatter-schema';

const base = {
  title: 'T',
  description: 'D',
  category: 'compliance',
  slug: 'test-article',
  updatedAt: '2026-06-10',
};

describe('heroMedia / upNext frontmatter', () => {
  it('accepts a complete heroMedia object', () => {
    const r = validateFrontmatter({
      ...base,
      heroMedia: { src: '/help/compliance/test-article/hero.mp4', alt: 'A', width: 1440, height: 900 },
      upNext: 'fixing-compliance-gaps',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects heroMedia src outside /help/', () => {
    const r = validateFrontmatter({
      ...base,
      heroMedia: { src: '/images/x.webp', alt: 'A', width: 1, height: 1 },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects non-slug upNext', () => {
    const r = validateFrontmatter({ ...base, upNext: 'Not A Slug' });
    expect(r.ok).toBe(false);
  });
});
```

Run: `cd apps/web && pnpm exec vitest run src/lib/help/__tests__/frontmatter-schema.test.ts` — Expected: FAIL (unknown keys pass through via `.passthrough()`, but the src/upNext rejection cases fail because no validation exists).

- [ ] **Step 2: Extend the schema**

In `frontmatter-schema.ts`, inside the `z.object({...})` before `.passthrough()`, after `lastReviewedAt`:

```ts
    heroMedia: z
      .object({
        src: z
          .string()
          .min(1)
          .regex(/^\/help\//, 'heroMedia.src must be a repo asset path starting with /help/'),
        alt: z.string().min(1, 'heroMedia.alt is required'),
        caption: z.string().optional(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        /** Required in practice for .mp4/.webm heroes; enforced by guard. */
        poster: z
          .string()
          .regex(/^\/help\//, 'heroMedia.poster must start with /help/')
          .optional(),
      })
      .optional(),
    upNext: z
      .string()
      .regex(SLUG_REGEX, 'upNext must be an article slug (lowercase kebab-case)')
      .optional(),
```

- [ ] **Step 3: Plumb through metadata**

In `help-article-service.ts`:
- Add to `HelpArticleMetadata` (after `readTimeMinutes`):
```ts
  heroMedia?: {
    src: string;
    alt: string;
    caption?: string;
    width: number;
    height: number;
    poster?: string;
  };
  upNext?: string;
```
- In `parseArticleFrontmatter`'s metadata construction (near line 155, alongside `contextPaths: valid.contextPaths ?? [],`):
```ts
    heroMedia: valid.heroMedia,
    upNext: valid.upNext,
```

- [ ] **Step 4: Resolve upNext in the article route**

In `apps/web/src/app/api/v1/help/article/route.ts`, after `const related = getRelatedArticles(...)`:

```ts
    const upNext = resolveUpNext(article, effectiveRole, features);

    return {
      html: compiled.html,
      toc: compiled.toc,
      metadata: article.metadata,
      related,
      upNext,
    };
```

And add below `getRelatedArticles`:

```ts
/**
 * Resolves the optional frontmatter `upNext` slug to full metadata with the
 * same role/feature visibility rules as related articles. Null when unset,
 * unresolvable, or not visible to this viewer.
 */
function resolveUpNext(
  article: HelpArticleSource,
  effectiveRole: string,
  features: ReturnType<typeof getFeaturesForCommunity>,
): HelpArticleMetadata | null {
  const slug = article.metadata.upNext;
  if (!slug) return null;
  const target = getAllArticles().find((a) => a.slug === slug);
  if (
    !target ||
    !isArticleVisibleToRole(target, effectiveRole) ||
    filterArticlesByFeatures([target], features).length === 0
  ) {
    return null;
  }
  return target;
}
```

Check the route's contract (`apps/web/src/app/api/v1/help/article/contract.ts`): if `response` is `z.unknown()` (the bundle convention), no contract change. If it's typed, add `upNext`.

- [ ] **Step 5: Update the client type**

In `use-help.ts`, extend `HelpArticleResponse`:

```ts
export interface HelpArticleResponse {
  html: string;
  toc: TocItem[];
  metadata: HelpArticleMetadata;
  related: HelpArticleMetadata[];
  upNext: HelpArticleMetadata | null;
}
```

- [ ] **Step 6: vi.mock sweep (repo trap)**

Run: `grep -rln "vi.mock('@/lib/services/help-article-service'" apps/web/__tests__ apps/web/src`
Any mock factory for this module must keep exporting everything the route imports (no new exports were added here, but verify `getAllArticles` etc. are present in each factory). Also run the article route's unit tests and fix assertions that snapshot the response shape (they must now include `upNext: null`).

- [ ] **Step 7: Run tests, then commit**

Run: `cd apps/web && pnpm exec vitest run src/lib/help/ && pnpm exec vitest run --dir __tests__ -t "article" 2>&1 | tail -20`
Expected: PASS.

```bash
git add apps/web/src/lib/help/frontmatter-schema.ts apps/web/src/lib/help/__tests__/frontmatter-schema.test.ts apps/web/src/lib/services/help-article-service.ts apps/web/src/app/api/v1/help/article/route.ts apps/web/src/hooks/use-help.ts
git commit -m "feat(help): heroMedia + upNext frontmatter, resolved upNext in article response"
```

---

## Task 8: Asset guard — media existence + size budgets + upNext integrity

Extend `scripts/verify-help-content.ts` (the existing `guard:help-content`, wired into `pnpm lint`).

**Files:**
- Modify: `scripts/verify-help-content.ts`

- [ ] **Step 1: Read the script's existing error-reporting helpers**

Run: `sed -n '40,120p' scripts/verify-help-content.ts` — identify how existing checks push errors (there will be an `errors`/`warnings` accumulator and a per-article loop with `frontmatter` + `content` from gray-matter). Reuse those exact mechanisms.

- [ ] **Step 2: Add the media-integrity check**

Add constants and a check function (adapt accumulator names to what Step 1 found):

```ts
const publicHelpRoot = join(repoRoot, 'apps', 'web', 'public');

const MEDIA_BUDGETS: Array<{ pattern: RegExp; maxBytes: number; label: string }> = [
  { pattern: /\.(webp|png|jpg|jpeg)$/i, maxBytes: 250 * 1024, label: 'image ≤ 250KB' },
  { pattern: /\.(mp4|webm)$/i, maxBytes: 1.5 * 1024 * 1024, label: 'clip ≤ 1.5MB' },
];

/** Collect every media path referenced by an article (frontmatter + body). */
function collectMediaPaths(frontmatter: Record<string, unknown>, body: string): string[] {
  const paths: string[] = [];
  const hero = frontmatter.heroMedia as { src?: string; poster?: string } | undefined;
  if (hero?.src) paths.push(hero.src);
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

function checkMediaIntegrity(filePath: string, frontmatter: Record<string, unknown>, body: string): void {
  for (const mediaPath of collectMediaPaths(frontmatter, body)) {
    if (!mediaPath.startsWith('/help/')) {
      addError(filePath, `media path "${mediaPath}" must start with /help/ (repo-hosted under apps/web/public/help)`);
      continue;
    }
    const abs = join(publicHelpRoot, mediaPath);
    let size: number;
    try {
      size = statSync(abs).size;
    } catch {
      addError(filePath, `media file missing: ${mediaPath} (expected at apps/web/public${mediaPath})`);
      continue;
    }
    const budget = MEDIA_BUDGETS.find((b) => b.pattern.test(mediaPath));
    if (budget && size > budget.maxBytes) {
      addError(
        filePath,
        `media over budget: ${mediaPath} is ${(size / 1024).toFixed(0)}KB (budget: ${budget.label}). Re-export smaller or split the clip.`,
      );
    }
  }
}
```

Wire `checkMediaIntegrity(...)` into the per-article loop, and extend the existing relatedArticles-integrity check to ALSO validate `upNext` (frontmatter `upNext` slug must resolve to an existing article file — same mechanism, same error style).

(`addError` here stands for whatever accumulator Step 1 found — use the script's real helper.)

- [ ] **Step 3: Verify the guard passes on current content and catches a planted error**

Run: `pnpm guard:help-content` — Expected: exit 0 (no articles reference media yet).
Plant a test: temporarily add `heroMedia: { src: "/help/nope/missing.webp", alt: "x", width: 1, height: 1 }` to any article's frontmatter, run again — Expected: exit 1 naming the file and missing path. Revert the plant.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-help-content.ts
git commit -m "feat(guard): help media integrity — existence, /help/ prefix, size budgets, upNext resolution"
```

---

## Task 9: Provider navigation stack

**Files:**
- Modify: `apps/web/src/components/help/help-widget-provider.tsx`
- Create: `apps/web/src/components/help/__tests__/help-widget-provider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/help/__tests__/help-widget-provider.test.tsx
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { HelpWidgetProvider, useHelpWidget } from '@/components/help/help-widget-provider';

const wrapper = ({ children }: { children: ReactNode }) => (
  <HelpWidgetProvider>{children}</HelpWidgetProvider>
);

describe('HelpWidgetProvider article stack', () => {
  it('pushes on openArticle, exposes top as selectedArticle', () => {
    const { result } = renderHook(() => useHelpWidget(), { wrapper });
    act(() => result.current.openArticle('compliance', 'a'));
    act(() => result.current.openArticle('compliance', 'b'));
    expect(result.current.selectedArticle).toEqual({ category: 'compliance', slug: 'b' });
    expect(result.current.stackDepth).toBe(2);
    expect(result.current.isOpen).toBe(true);
  });

  it('does not push a duplicate of the current top', () => {
    const { result } = renderHook(() => useHelpWidget(), { wrapper });
    act(() => result.current.openArticle('compliance', 'a'));
    act(() => result.current.openArticle('compliance', 'a'));
    expect(result.current.stackDepth).toBe(1);
  });

  it('back pops to the previous article, then to the default view', () => {
    const { result } = renderHook(() => useHelpWidget(), { wrapper });
    act(() => result.current.openArticle('compliance', 'a'));
    act(() => result.current.openArticle('meetings', 'b'));
    act(() => result.current.back());
    expect(result.current.selectedArticle).toEqual({ category: 'compliance', slug: 'a' });
    act(() => result.current.back());
    expect(result.current.selectedArticle).toBeNull();
    expect(result.current.stackDepth).toBe(0);
    expect(result.current.isOpen).toBe(true);
  });

  it('close clears the stack', () => {
    const { result } = renderHook(() => useHelpWidget(), { wrapper });
    act(() => result.current.openArticle('compliance', 'a'));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.stackDepth).toBe(0);
    expect(result.current.selectedArticle).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/components/help/__tests__/help-widget-provider.test.tsx`
Expected: FAIL — `stackDepth`/`back` don't exist.

- [ ] **Step 3: Implement the stack**

In `help-widget-provider.tsx`, replace the `selectedArticle` state and related callbacks (keep `markCloseAsNavigation`/`consumeNavigationCloseFlag`/`?`-shortcut verbatim):

```tsx
interface HelpWidgetContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Top of the article stack, or null when on the default view. */
  selectedArticle: SelectedArticle | null;
  /** Number of explicitly opened articles. 0 = default (contextual/search) view. */
  stackDepth: number;
  openArticle: (category: string, slug: string) => void;
  /** Pop one article; at depth 0 this is a no-op (modal stays open). */
  back: () => void;
  markCloseAsNavigation: () => void;
  /** @internal — read by HelpDeepLinkHandler only. */
  consumeNavigationCloseFlag: () => boolean;
}
```

```tsx
  const [articleStack, setArticleStack] = useState<SelectedArticle[]>([]);
  const selectedArticle =
    articleStack.length > 0 ? articleStack[articleStack.length - 1]! : null;

  const close = useCallback(() => {
    setIsOpen(false);
    setArticleStack([]);
  }, []);

  const openArticle = useCallback((category: string, slug: string) => {
    setArticleStack((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.category === category && top.slug === slug) return prev;
      return [...prev, { category, slug }];
    });
    setIsOpen(true);
  }, []);

  const back = useCallback(() => {
    setArticleStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  }, []);
```

Provide `stackDepth: articleStack.length` and `back` in the context value. URL RULE (spec §4.1): pushes never touch the URL; `HelpDeepLinkHandler` is unchanged — it already calls `openArticle` once on deep-link entry (seeding depth 1) and strips `?help=` on close.

- [ ] **Step 4: Run tests**

Run: `cd apps/web && pnpm exec vitest run src/components/help/__tests__/help-widget-provider.test.tsx`
Expected: PASS. Also run the deep-link handler's tests if present: `grep -rl "help-deep-link" apps/web --include="*.test.tsx" | head` and run matches.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/help/help-widget-provider.tsx apps/web/src/components/help/__tests__/help-widget-provider.test.tsx
git commit -m "feat(help): article navigation stack in HelpWidgetProvider (push/back/clear)"
```

---

## Task 10: HelpArticleBody redesign — flat layout, hero, chips, related-push, enhancer + lightbox

`HelpArticleBody` is modal-only (verified: sole consumer is `help-docs-modal.tsx`). Drop the `displayMode` prop and the dead route branch; rebuild for the modal.

**Files:**
- Create: `apps/web/src/components/help/help-media-lightbox.tsx`
- Rewrite: `apps/web/src/components/help/help-article-body.tsx`
- Rewrite: `apps/web/src/components/help/__tests__/help-article-body.render.test.tsx`

- [ ] **Step 1: Write the lightbox**

```tsx
// apps/web/src/components/help/help-media-lightbox.tsx
'use client';

/**
 * Full-size zoom for help article media. A NESTED Radix Dialog: the parent
 * help modal must suppress its own outside-pointer/escape dismissal while
 * this is open (clicks on this overlay land outside the parent's content) —
 * see HelpDocsModal's onPointerDownOutside/onEscapeKeyDown guards.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export interface LightboxMedia {
  src: string;
  alt: string;
  kind: 'image' | 'clip';
}

interface HelpMediaLightboxProps {
  media: LightboxMedia | null;
  onClose: () => void;
}

export function HelpMediaLightbox({ media, onClose }: HelpMediaLightboxProps) {
  return (
    <Dialog open={media !== null} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="w-[95vw] max-w-[1200px] p-2">
        <DialogTitle className="sr-only">{media?.alt ?? 'Media preview'}</DialogTitle>
        <DialogDescription className="sr-only">
          Enlarged view. Press Escape to close.
        </DialogDescription>
        {media?.kind === 'clip' ? (
          <video
            src={media.src}
            controls
            muted
            loop
            playsInline
            className="block h-auto max-h-[85vh] w-full rounded-[var(--radius-md)]"
            aria-label={media.alt}
          />
        ) : media ? (
          <img
            src={media.src}
            alt={media.alt}
            className="block h-auto max-h-[85vh] w-full rounded-[var(--radius-md)] object-contain"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Rewrite HelpArticleBody**

```tsx
// apps/web/src/components/help/help-article-body.tsx
'use client';

/**
 * <HelpArticleBody/> — article renderer for the help docs modal (sole
 * consumer; the /help route pages render their own JSX via compileMDX).
 *
 * The html prop is server-rendered, sanitized static markup. React event
 * handlers inside it do not exist — ALL interactivity is provided here by
 * delegation on the content container:
 *   - [data-zoomable] click  → lightbox
 *   - [data-media-play]      → toggle clip playback (reduced-motion path)
 *   - a[href^="#"]           → scroll within the modal, never mutate the URL
 *   - clips autoplay via IntersectionObserver unless prefers-reduced-motion
 */
import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { MediaFrame } from '@/components/help/media-frame';
import { HelpMediaLightbox, type LightboxMedia } from '@/components/help/help-media-lightbox';
import { ArticleFeedback } from '@/components/help/article-feedback';
import { ArticleViewTracker } from '@/components/help/article-view-tracker';
import type { HelpArticleMetadata } from '@/lib/services/help-article-service';

function formatUpdatedAt(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

export interface HelpArticleBodyProps {
  html: string;
  metadata: HelpArticleMetadata;
  related: HelpArticleMetadata[];
  communityId: number;
  onOpenArticle: (category: string, slug: string) => void;
  onLightboxOpenChange?: (open: boolean) => void;
}

const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-full border border-edge px-2.5 py-0.5 text-xs text-content-secondary';

export function HelpArticleBody({
  html,
  metadata,
  related,
  communityId,
  onOpenArticle,
  onLightboxOpenChange,
}: HelpArticleBodyProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<LightboxMedia | null>(null);
  const formattedUpdatedAt = formatUpdatedAt(metadata.updatedAt);

  useEffect(() => {
    onLightboxOpenChange?.(lightbox !== null);
  }, [lightbox, onLightboxOpenChange]);

  // Delegated interactivity over the injected static HTML.
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;

      const playButton = target.closest<HTMLElement>('[data-media-play]');
      if (playButton) {
        e.preventDefault();
        const video = playButton.parentElement?.querySelector('video');
        if (video) {
          if (video.paused) void video.play().catch(() => {});
          else video.pause();
        }
        return;
      }

      const zoomable = target.closest<HTMLElement>('[data-zoomable]');
      if (zoomable) {
        e.preventDefault();
        const kind = zoomable.dataset.mediaKind === 'clip' ? 'clip' : 'image';
        const src =
          kind === 'clip'
            ? zoomable.querySelector('source')?.getAttribute('src')
            : zoomable.getAttribute('src');
        if (src) {
          setLightbox({
            src,
            alt: zoomable.dataset.mediaAlt ?? zoomable.getAttribute('alt') ?? '',
            kind,
          });
        }
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]');
      if (anchor) {
        e.preventDefault();
        const id = decodeURIComponent(anchor.getAttribute('href')!.slice(1));
        if (!id) return;
        root.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: 'start' });
      }
    }

    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [html]);

  // Clip playback: autoplay in-viewport unless reduced motion; sync the
  // play-button overlay to playback state either way.
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const videos = Array.from(root.querySelectorAll<HTMLVideoElement>('video[data-media-kind="clip"]'));
    if (videos.length === 0) return;

    const cleanups: Array<() => void> = [];
    for (const video of videos) {
      const button = video.parentElement?.querySelector<HTMLElement>('[data-media-play]');
      if (button) {
        const sync = () => {
          button.toggleAttribute('hidden', !video.paused);
        };
        video.addEventListener('play', sync);
        video.addEventListener('pause', sync);
        cleanups.push(() => {
          video.removeEventListener('play', sync);
          video.removeEventListener('pause', sync);
        });
      }
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion && typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const video = entry.target as HTMLVideoElement;
            if (entry.isIntersecting) void video.play().catch(() => {});
            else video.pause();
          }
        },
        { threshold: 0.4 },
      );
      videos.forEach((v) => io.observe(v));
      cleanups.push(() => io.disconnect());
    }

    return () => cleanups.forEach((fn) => fn());
  }, [html]);

  return (
    <div className="space-y-6 pb-4">
      <ArticleViewTracker
        communityId={communityId}
        articleSlug={metadata.slug}
        articleCategory={metadata.category}
      />

      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-content">{metadata.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {typeof metadata.readTimeMinutes === 'number' && (
            <span className={CHIP_CLASS}>{metadata.readTimeMinutes} min read</span>
          )}
          {formattedUpdatedAt && <span className={CHIP_CLASS}>Updated {formattedUpdatedAt}</span>}
          {metadata.roles.length > 0 && (
            <span className={CHIP_CLASS}>
              {metadata.roles.map((r) => r.replace(/_/g, ' ')).join(' · ')}
            </span>
          )}
          {(metadata.statutes ?? []).map((statute) => (
            <a
              key={statute}
              href={`/help/statutes/${encodeURIComponent(statute)}?communityId=${communityId}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-full border border-status-brand-border bg-status-brand-subtle px-2.5 py-0.5 text-xs text-status-brand hover:underline"
              aria-label={`See all articles tagged with ${statute} (opens in a new tab)`}
            >
              {statute}
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          ))}
        </div>
      </header>

      {metadata.heroMedia && (
        <MediaFrame
          src={metadata.heroMedia.src}
          alt={metadata.heroMedia.alt}
          caption={metadata.heroMedia.caption}
          width={metadata.heroMedia.width}
          height={metadata.heroMedia.height}
          poster={metadata.heroMedia.poster}
        />
      )}

      <div ref={contentRef} dangerouslySetInnerHTML={{ __html: html }} />

      <ArticleFeedback
        communityId={communityId}
        articleSlug={metadata.slug}
        articleCategory={metadata.category}
      />

      {related.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-content">Related guides</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {related.map((candidate) => (
              <button
                key={candidate.slug}
                type="button"
                onClick={() => onOpenArticle(candidate.category, candidate.slug)}
                className="rounded-[var(--radius-md)] border border-edge bg-surface-card p-4 text-left transition-colors hover:border-edge-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <h3 className="text-sm font-semibold text-content">{candidate.title}</h3>
                <p className="mt-1 text-sm leading-6 text-content-secondary">
                  {candidate.description}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      <HelpMediaLightbox media={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
```

Notes against the old file: the inner `rounded-2xl … shadow-sm` article card is gone (flat on the dialog surface); TOC rail and `<details>` TOC are gone (modal is single-column; the `toc` prop is dropped from this component — the API keeps returning it, harmless); related links are push-buttons; statute pills are tokenized and open new tabs; `next/link` import removed.

- [ ] **Step 3: Rewrite the render test**

Rewrite `apps/web/src/components/help/__tests__/help-article-body.render.test.tsx` with RTL. Mock `ArticleViewTracker` and `ArticleFeedback` (they hit hooks/network): `vi.mock('@/components/help/article-view-tracker', () => ({ ArticleViewTracker: () => null }));` and same for feedback. Provide `window.matchMedia` mock in setup if not globally mocked.

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HelpArticleBody } from '@/components/help/help-article-body';
import type { HelpArticleMetadata } from '@/lib/services/help-article-service';

vi.mock('@/components/help/article-view-tracker', () => ({ ArticleViewTracker: () => null }));
vi.mock('@/components/help/article-feedback', () => ({ ArticleFeedback: () => null }));

const metadata: HelpArticleMetadata = {
  title: 'Reviewing the compliance dashboard',
  description: 'd',
  category: 'compliance',
  slug: 'reviewing-the-compliance-dashboard',
  roles: ['cam'],
  keywords: [],
  tags: [],
  relatedArticles: [],
  featured: false,
  filePath: 'x.mdx',
  statutes: ['§718.111(12)(g)'],
  updatedAt: '2026-05-01',
  readTimeMinutes: 4,
  contentHash: 'h',
  heroMedia: { src: '/help/compliance/r/hero.webp', alt: 'Hero', width: 1440, height: 900 },
};

function renderBody(html: string, overrides: Partial<Parameters<typeof HelpArticleBody>[0]> = {}) {
  const onOpenArticle = vi.fn();
  const onLightboxOpenChange = vi.fn();
  const utils = render(
    <HelpArticleBody
      html={html}
      metadata={metadata}
      related={[]}
      communityId={1}
      onOpenArticle={onOpenArticle}
      onLightboxOpenChange={onLightboxOpenChange}
      {...overrides}
    />,
  );
  return { ...utils, onOpenArticle, onLightboxOpenChange };
}

beforeEach(() => {
  window.matchMedia ??= vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
});

describe('HelpArticleBody', () => {
  it('renders title, chips, hero media, and flat content (no inner card)', () => {
    const { container } = renderBody('<p>body text</p>');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Reviewing the compliance dashboard');
    expect(screen.getByText('4 min read')).toBeInTheDocument();
    expect(container.querySelector('[data-media-frame]')).not.toBeNull();
    expect(container.querySelector('.rounded-2xl')).toBeNull();
  });

  it('statute chips open in a new tab', () => {
    renderBody('<p>x</p>');
    const link = screen.getByRole('link', { name: /§718\.111/ });
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('opens the lightbox when a zoomable image in injected HTML is clicked', () => {
    const { container, onLightboxOpenChange } = renderBody(
      '<img src="/help/c/s/shot.webp" alt="Shot" data-zoomable data-media-kind="image">',
    );
    fireEvent.click(container.querySelector('[data-zoomable]')!);
    expect(onLightboxOpenChange).toHaveBeenLastCalledWith(true);
  });

  it('intercepts same-document anchors: scrolls within content, never mutates the hash', () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    const { container } = renderBody('<a href="#section-2">jump</a><h2 id="section-2">Two</h2>');
    fireEvent.click(container.querySelector('a[href="#section-2"]')!);
    expect(scrollSpy).toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('related guides push in-modal instead of navigating', () => {
    const { onOpenArticle } = renderBody('<p>x</p>', {
      related: [{ ...metadata, slug: 'other', title: 'Other guide', heroMedia: undefined }],
    });
    fireEvent.click(screen.getByRole('button', { name: /Other guide/ }));
    expect(onOpenArticle).toHaveBeenCalledWith('compliance', 'other');
  });
});
```

- [ ] **Step 4: Run, fix, commit**

Run: `cd apps/web && pnpm exec vitest run src/components/help/__tests__/help-article-body.render.test.tsx`
Expected: PASS (the modal still imports the old props — fixed next task; typecheck of the full app comes after Task 11).

```bash
git add apps/web/src/components/help/help-article-body.tsx apps/web/src/components/help/help-media-lightbox.tsx apps/web/src/components/help/__tests__/help-article-body.render.test.tsx
git commit -m "feat(help): flat media-led article body with delegation enhancer and lightbox"
```

---

## Task 11: Modal shell — header nav, persistent search, slim footer, sheet parity, lightbox suppression

**Files:**
- Rewrite: `apps/web/src/components/help/help-docs-modal.tsx`
- Tests: `grep -rl "HelpDocsModal" apps/web --include="*.test.tsx"` → update matches; behaviors below must be covered.

- [ ] **Step 1: Rewrite the modal**

```tsx
// apps/web/src/components/help/help-docs-modal.tsx
'use client';

/**
 * <HelpDocsModal/> — "Showcase" help modal. Single-pane reader with an
 * in-modal navigation stack (HelpWidgetProvider), persistent header search,
 * and a slim Up-next footer. Nothing in here navigates the app away except
 * the two explicit affordances (open-full-page, browse-all) — both of which
 * call markCloseAsNavigation() to keep the ?help= deep-link strip race-free.
 *
 * While the media lightbox is open (nested dialog), outside-pointer and
 * escape dismissal of THIS dialog are suppressed: lightbox overlay clicks
 * land outside our DialogContent and would otherwise close everything.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ExternalLink, Search } from 'lucide-react';
import { useHelpWidget } from '@/components/help/help-widget-provider';
import { useContextualHelp, useHelpArticle, useReadArticles } from '@/hooks/use-help';
import { HelpArticleBody } from '@/components/help/help-article-body';
import { HelpDocsModalSearchPanel } from '@/components/help/help-docs-modal-search-panel';
import { getHelpCategoryMeta } from '@/lib/help/category-meta';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { cn } from '@/lib/utils';

interface HelpDocsModalProps {
  communityId: number;
  flagEnabled: boolean;
}

export function HelpDocsModal({ communityId, flagEnabled }: HelpDocsModalProps) {
  const {
    isOpen,
    close,
    selectedArticle,
    stackDepth,
    openArticle,
    back,
    markCloseAsNavigation,
  } = useHelpWidget();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Reset transient UI state whenever the modal closes.
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setLightboxOpen(false);
    }
  }, [isOpen]);

  const { data: contextualArticles, isFetching: isFetchingContextual } =
    useContextualHelp(pathname, communityId, flagEnabled);

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
    flagEnabled,
  );
  const { data: readArticles } = useReadArticles(communityId);

  const isMobile = useIsMobile();

  if (!flagEnabled) return null;

  const isSearching = searchQuery.trim().length >= 2;
  const showSearchPanel = isSearching || !targetArticle;
  const categoryMeta = targetArticle ? getHelpCategoryMeta(targetArticle.category) : null;
  const CategoryIcon = categoryMeta?.icon ?? null;

  // Up next: server-resolved frontmatter slug, else first unread related.
  const upNext =
    articleQuery.data?.upNext ??
    articleQuery.data?.related.find((r) => !(readArticles?.slugs.has(r.slug) ?? false)) ??
    null;

  const header = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {stackDepth > 0 && (
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-content-secondary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
      )}
      {categoryMeta && CategoryIcon && !showSearchPanel && (
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
            categoryMeta.chipClass,
          )}
        >
          <CategoryIcon size={13} aria-hidden="true" />
          {categoryMeta.label}
        </span>
      )}
      <div className="relative min-w-0 flex-1">
        <Search
          size={14}
          aria-hidden="true"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search help…"
          aria-label="Search help articles"
          className="h-8 w-full rounded-[var(--radius-sm)] border border-edge bg-surface-card pl-8 pr-2 text-sm text-content placeholder:text-content-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </div>
      {targetArticle && (
        <Link
          href={`/help/${targetArticle.category}/${targetArticle.slug}?communityId=${communityId}`}
          onClick={() => {
            markCloseAsNavigation();
            close();
          }}
          aria-label="Open as full page"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-content-secondary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ExternalLink size={15} aria-hidden="true" />
        </Link>
      )}
    </div>
  );

  const body = (
    <ModalBody
      showSearchPanel={showSearchPanel}
      searchQuery={searchQuery}
      isLoading={Boolean(targetArticle) && articleQuery.isLoading}
      isError={Boolean(articleQuery.isError)}
      onRetry={() => articleQuery.refetch?.()}
      articleData={articleQuery.data ?? null}
      communityId={communityId}
      contextualArticles={contextualArticles ?? []}
      isFetchingContextual={isFetchingContextual}
      readSlugs={readArticles?.slugs ?? null}
      onPickArticle={(category, slug) => {
        setSearchQuery('');
        openArticle(category, slug);
      }}
      onLightboxOpenChange={setLightboxOpen}
    />
  );

  const footer = (
    <div className="flex shrink-0 items-center justify-between gap-4 border-t border-edge px-4 py-2.5">
      {upNext && !showSearchPanel ? (
        <button
          type="button"
          onClick={() => openArticle(upNext.category, upNext.slug)}
          className="min-w-0 truncate text-sm text-content-secondary transition-colors hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span className="text-content-tertiary">Up next:</span>{' '}
          <span className="font-medium">{upNext.title}</span> →
        </button>
      ) : (
        <span />
      )}
      <Link
        href={`/help?communityId=${communityId}`}
        onClick={() => {
          markCloseAsNavigation();
          close();
        }}
        className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-[var(--interactive-primary)] hover:underline"
      >
        Browse all help articles
        <ExternalLink size={14} aria-hidden="true" />
      </Link>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(o) => (o ? null : close())}>
        <SheetContent side="bottom" className="flex h-[92vh] flex-col p-0">
          <SheetTitle className="sr-only">Help</SheetTitle>
          <SheetDescription className="sr-only">Help article viewer</SheetDescription>
          <div className="flex shrink-0 items-center border-b border-edge px-4 py-3 pr-12">
            {header}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{body}</div>
          {footer}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent
        onPointerDownOutside={(e) => {
          if (lightboxOpen) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (lightboxOpen) e.preventDefault();
        }}
        className={cn(
          'flex max-h-[90vh] w-[95vw] max-w-[960px] flex-col p-0',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
        )}
      >
        <DialogTitle className="sr-only">Help</DialogTitle>
        <DialogDescription className="sr-only">Help article viewer</DialogDescription>
        <div className="flex shrink-0 items-center border-b border-edge px-4 py-3 pr-12">
          {header}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{body}</div>
        {footer}
      </DialogContent>
    </Dialog>
  );
}

interface ModalBodyProps {
  showSearchPanel: boolean;
  searchQuery: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  articleData:
    | (NonNullable<ReturnType<typeof useHelpArticle>['data']>)
    | null;
  communityId: number;
  contextualArticles: Array<{ category: string; slug: string; title: string; description: string }>;
  isFetchingContextual: boolean;
  readSlugs: Set<string> | null;
  onPickArticle: (category: string, slug: string) => void;
  onLightboxOpenChange: (open: boolean) => void;
}

function ModalBody({
  showSearchPanel,
  searchQuery,
  isLoading,
  isError,
  onRetry,
  articleData,
  communityId,
  contextualArticles,
  isFetchingContextual,
  readSlugs,
  onPickArticle,
  onLightboxOpenChange,
}: ModalBodyProps) {
  if (showSearchPanel) {
    return (
      <HelpDocsModalSearchPanel
        communityId={communityId}
        query={searchQuery}
        contextualArticles={contextualArticles}
        readSlugs={readSlugs}
        onPickArticle={onPickArticle}
      />
    );
  }

  if (isLoading || isFetchingContextual) {
    return (
      <div className="space-y-3" aria-label="Loading article">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-48 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load this article."
        description={
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-medium underline underline-offset-2"
          >
            Retry
          </button>
        }
      />
    );
  }

  if (!articleData) return null;

  return (
    <HelpArticleBody
      html={articleData.html}
      metadata={articleData.metadata}
      related={articleData.related}
      communityId={communityId}
      onOpenArticle={onPickArticle}
      onLightboxOpenChange={onLightboxOpenChange}
    />
  );
}

function useIsMobile(): boolean {
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

Notes: the old "More for this page" muted card is REMOVED — that content now lives in the search panel's "Help for this page" section (Task 12). `useContextualHelp`'s `HelpArticleResult` includes `description` (verify the contextual route projection includes it — it does: `{ title, description, category, slug }`).

- [ ] **Step 2: Update/extend modal tests**

Find them: `grep -rl "HelpDocsModal" apps/web --include="*.test.tsx"`. Update for the new structure and ensure these behaviors are covered (write them if missing), using the existing test file's mocking conventions for hooks/provider:
1. Back button hidden at `stackDepth === 0`, visible and calls `back()` at depth > 0.
2. Typing ≥2 chars in header search shows the search panel even when an article is loaded.
3. Footer renders "Up next" from `articleQuery.data.upNext` and falls back to first unread related.
4. With `lightboxOpen` (simulate via `onLightboxOpenChange` from a zoom click), `onPointerDownOutside`/Escape do not close the dialog.
5. Mobile: `window.matchMedia('(max-width: 767px)')` mock → Sheet variant renders header + footer.

- [ ] **Step 3: Typecheck + run help suites**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm exec vitest run src/components/help/`
Expected: clean typecheck (Task 12 changes the search panel props in the same PR — if doing tasks strictly sequentially, expect a temporary type error against the old panel props; acceptable to commit Tasks 11+12 together if so).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/help/help-docs-modal.tsx <updated test files>
git commit -m "feat(help): showcase modal shell — back stack, persistent search, up-next footer, sheet parity"
```

---

## Task 12: Search panel rework — FAQ results + "Help for this page"

**Files:**
- Rewrite: `apps/web/src/components/help/help-docs-modal-search-panel.tsx`
- Test: create/extend `apps/web/src/components/help/__tests__/help-docs-modal-search-panel.test.tsx`

- [ ] **Step 1: Rewrite the panel**

```tsx
// apps/web/src/components/help/help-docs-modal-search-panel.tsx
'use client';

/**
 * <HelpDocsModalSearchPanel/> — browse/search view inside HelpDocsModal.
 * Shown when the user is searching (header input, query ≥ 2 chars) or when
 * no contextual article matches the route. Three sections:
 *   1. Search results — articles AND community FAQs (the API returns both;
 *      the old panel silently dropped faqs).
 *   2. "Help for this page" — ALL contextual matches with read checkmarks.
 *   3. Featured-for-role fallback when neither applies.
 * Query state lives in the modal header; this panel is presentational.
 */
import Link from 'next/link';
import { useState } from 'react';
import { Check } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useHelpSearch, useFeaturedArticles, type HelpArticleResult } from '@/hooks/use-help';
import { getHelpCategoryMeta } from '@/lib/help/category-meta';
import { cn } from '@/lib/utils';

const INITIAL_CONTEXTUAL_SHOWN = 4;

interface HelpDocsModalSearchPanelProps {
  communityId: number;
  query: string;
  contextualArticles: Array<{ category: string; slug: string; title: string; description: string }>;
  readSlugs: Set<string> | null;
  onPickArticle: (category: string, slug: string) => void;
}

function ArticleRow({
  article,
  read,
  onPick,
}: {
  article: Pick<HelpArticleResult, 'category' | 'slug' | 'title' | 'description'>;
  read: boolean;
  onPick: (category: string, slug: string) => void;
}) {
  const meta = getHelpCategoryMeta(article.category);
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={() => onPick(article.category, article.slug)}
      className={cn(
        'flex w-full items-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left transition-colors hover:bg-surface-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
      )}
    >
      <Icon size={15} className="mt-0.5 shrink-0 text-content-tertiary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-content">{article.title}</p>
        <p className="mt-0.5 text-sm text-content-secondary line-clamp-1">{article.description}</p>
      </div>
      {read && (
        <Check size={14} className="mt-1 shrink-0 text-status-success" aria-label="Read" />
      )}
    </button>
  );
}

export function HelpDocsModalSearchPanel({
  communityId,
  query,
  contextualArticles,
  readSlugs,
  onPickArticle,
}: HelpDocsModalSearchPanelProps) {
  const [showAllContextual, setShowAllContextual] = useState(false);
  const { data: searchResults, isFetching } = useHelpSearch(query, communityId);
  const { data: featured = [] } = useFeaturedArticles(communityId);
  const isSearching = query.trim().length >= 2;

  const visibleContextual = showAllContextual
    ? contextualArticles
    : contextualArticles.slice(0, INITIAL_CONTEXTUAL_SHOWN);
  const hiddenContextualCount = contextualArticles.length - visibleContextual.length;

  return (
    <div className="space-y-6">
      {isSearching && isFetching && (
        <div className="space-y-2" aria-label="Searching">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isSearching && !isFetching && searchResults && (
        <>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
              Articles
            </h3>
            {searchResults.articles.length === 0 ? (
              <p className="text-sm text-content-tertiary">No articles match "{query}".</p>
            ) : (
              <div className="space-y-1">
                {searchResults.articles.map((article) => (
                  <ArticleRow
                    key={`${article.category}/${article.slug}`}
                    article={article}
                    read={readSlugs?.has(article.slug) ?? false}
                    onPick={onPickArticle}
                  />
                ))}
              </div>
            )}
          </section>

          {searchResults.faqs.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
                From your community's FAQ
              </h3>
              <div className="space-y-2">
                {searchResults.faqs.map((faq) => (
                  <details
                    key={faq.id}
                    className="rounded-[var(--radius-md)] border border-edge px-3 py-2.5"
                  >
                    <summary className="cursor-pointer list-none text-sm font-medium text-content [&::-webkit-details-marker]:hidden">
                      {faq.question}
                    </summary>
                    <p className="mt-2 text-sm leading-6 text-content-secondary">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {searchResults.articles.length === 0 && searchResults.faqs.length === 0 && (
            <div className="rounded-[var(--radius-md)] border border-edge bg-surface-card p-6 text-center">
              <p className="text-sm text-content-secondary">
                Nothing matches "{query}" yet — try different words, or reach out.
              </p>
              <Link
                href={`/help/contact?communityId=${communityId}`}
                className="mt-2 inline-block text-sm font-medium text-[var(--interactive-primary)] hover:underline"
              >
                Contact support →
              </Link>
            </div>
          )}
        </>
      )}

      {!isSearching && contextualArticles.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
            Help for this page · {contextualArticles.length}{' '}
            {contextualArticles.length === 1 ? 'article' : 'articles'}
          </h3>
          <div className="space-y-1">
            {visibleContextual.map((article) => (
              <ArticleRow
                key={`${article.category}/${article.slug}`}
                article={article}
                read={readSlugs?.has(article.slug) ?? false}
                onPick={onPickArticle}
              />
            ))}
          </div>
          {hiddenContextualCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAllContextual(true)}
              className="mt-2 text-sm font-medium text-[var(--interactive-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Show {hiddenContextualCount} more
            </button>
          )}
        </section>
      )}

      {!isSearching && contextualArticles.length === 0 && featured.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-content-tertiary">
            Featured for you
          </h3>
          <div className="space-y-1">
            {featured.map((article) => (
              <ArticleRow
                key={`${article.category}/${article.slug}`}
                article={article}
                read={readSlugs?.has(article.slug) ?? false}
                onPick={onPickArticle}
              />
            ))}
          </div>
        </section>
      )}

      {!isSearching && contextualArticles.length === 0 && featured.length === 0 && (
        <div className="rounded-[var(--radius-md)] border border-edge bg-surface-card p-6 text-center">
          <p className="text-sm text-content-secondary">
            Help articles for your role haven't been written yet.
          </p>
          <Link
            href={`/help/contact?communityId=${communityId}`}
            className="mt-2 inline-block text-sm font-medium text-[var(--interactive-primary)] hover:underline"
          >
            Contact support →
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the panel tests**

Cover, using the existing help-test mocking conventions (mock `use-help` hooks):
1. FAQ results render when `useHelpSearch` returns faqs (regression for the silent drop).
2. All contextual articles listed; >4 shows "Show N more" which expands.
3. Read checkmark renders for slugs in `readSlugs`.
4. Featured fallback renders only when contextual list is empty.

```tsx
// apps/web/src/components/help/__tests__/help-docs-modal-search-panel.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HelpDocsModalSearchPanel } from '@/components/help/help-docs-modal-search-panel';

const searchMock = vi.fn();
const featuredMock = vi.fn();
vi.mock('@/hooks/use-help', () => ({
  useHelpSearch: (...args: unknown[]) => searchMock(...args),
  useFeaturedArticles: (...args: unknown[]) => featuredMock(...args),
}));

const contextual = Array.from({ length: 6 }, (_, i) => ({
  category: 'documents',
  slug: `doc-article-${i}`,
  title: `Doc article ${i}`,
  description: 'desc',
}));

function setup(props: Partial<Parameters<typeof HelpDocsModalSearchPanel>[0]> = {}) {
  searchMock.mockReturnValue({ data: undefined, isFetching: false });
  featuredMock.mockReturnValue({ data: [] });
  const onPickArticle = vi.fn();
  render(
    <HelpDocsModalSearchPanel
      communityId={1}
      query=""
      contextualArticles={contextual}
      readSlugs={new Set(['doc-article-0'])}
      onPickArticle={onPickArticle}
      {...props}
    />,
  );
  return { onPickArticle };
}

describe('HelpDocsModalSearchPanel', () => {
  it('lists all contextual matches behind a show-more toggle', () => {
    setup();
    expect(screen.getByText(/Help for this page · 6 articles/)).toBeInTheDocument();
    expect(screen.queryByText('Doc article 5')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show 2 more/ }));
    expect(screen.getByText('Doc article 5')).toBeInTheDocument();
  });

  it('marks read articles with a checkmark', () => {
    setup();
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
  });

  it('renders FAQ search results (previously dropped)', () => {
    searchMock.mockReturnValue({
      data: {
        articles: [],
        faqs: [{ id: 1, question: 'When are assessments posted?', answer: 'On the 1st.' }],
      },
      isFetching: false,
    });
    featuredMock.mockReturnValue({ data: [] });
    render(
      <HelpDocsModalSearchPanel
        communityId={1}
        query="assessments"
        contextualArticles={[]}
        readSlugs={null}
        onPickArticle={vi.fn()}
      />,
    );
    expect(screen.getByText('When are assessments posted?')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, typecheck, commit**

Run: `cd apps/web && pnpm exec vitest run src/components/help/ && pnpm exec tsc --noEmit`
Expected: PASS, clean typecheck (Tasks 10–12 together restore type consistency).

```bash
git add apps/web/src/components/help/help-docs-modal-search-panel.tsx apps/web/src/components/help/__tests__/help-docs-modal-search-panel.test.tsx
git commit -m "feat(help): search panel — FAQ results, full contextual list with read state"
```

---

## Task 13: Contextual cap raise + contextPaths rides + stale wording

**Files:**
- Modify: `apps/web/src/app/api/v1/help/contextual/route.ts` + its `contract.ts` docblock
- Modify: 5 MDX frontmatter blocks
- Modify: `apps/web/src/content/help/getting-started/welcome-to-propertypro.mdx`

- [ ] **Step 1: Raise the cap**

In `contextual/route.ts`, replace `getContextualArticles(query.path, effectiveRole, 3)` with:

```ts
    // All contextual matches, capped defensively. The modal's search panel
    // lists everything (with show-more); 3 was an arbitrary truncation that
    // silently hid articles on over-matched routes (/documents matches 6).
    const articles = getContextualArticles(query.path, effectiveRole, CONTEXTUAL_MATCH_CAP);
```

with `const CONTEXTUAL_MATCH_CAP = 8;` defined above the handler (local constant — keeps `vi.mock('@/lib/services/help-article-service')` factories untouched). Update the contract docblock "up to 3" → "up to 8". Update the route's unit tests asserting the limit argument.

- [ ] **Step 2: contextPaths additions (exact frontmatter edits)**

The matcher is exact-segment (`*` = exactly one segment). Add to each article's `contextPaths:` list:

| File | Add pattern(s) |
|---|---|
| `meetings/posting-meeting-minutes.mdx` | `/communities/*/meetings/*/minutes/author` |
| `documents/uploading-documents.mdx` | `/communities/*/documents/author/*` (covers BOTH `/new` and `/[draftId]` — same segment count) |
| `documents/organizing-the-document-library.mdx` | `/communities/*/documents/author/*` |
| `forum/using-the-board-forum.mdx` | `/communities/*/board` |
| `finance/paying-dues-and-assessments.mdx` | `/payments/success` |

- [ ] **Step 3: Fix stale drawer wording**

In `welcome-to-propertypro.mdx`, find the sentence describing the help button ("opens a contextual drawer" near line 40) and rewrite to describe the modal, e.g.: "opens a help window with guides for the page you're on — you can search all articles from there too."

- [ ] **Step 4: Verify and commit**

Run: `pnpm guard:help-content && cd apps/web && pnpm exec vitest run --dir __tests__ -t "contextual" 2>&1 | tail -10`
Expected: guard exit 0; contextual tests PASS.

```bash
git add apps/web/src/app/api/v1/help/contextual/ apps/web/src/content/help/
git commit -m "feat(help): raise contextual cap to 8; tie authoring/board/payment routes to existing articles"
```

---

## Task 14: Capture tooling (`scripts/help-capture/`) + AUTHORING.md

Local-only Playwright capture against the dev server + seeded demo data. Requires `ffmpeg` on PATH for clips (document `brew install ffmpeg`).

**Files:**
- Create: `scripts/help-capture/capture.ts`
- Create: `scripts/help-capture/manifest-schema.ts`
- Create: `scripts/help-capture/manifests/.gitkeep`
- Create: `apps/web/src/content/help/AUTHORING.md`
- Modify: root `package.json` (script `"help:capture": "tsx scripts/help-capture/capture.ts"`)

- [ ] **Step 1: Manifest schema**

```ts
// scripts/help-capture/manifest-schema.ts
import { z } from 'zod';

/**
 * One manifest per article: scripts/help-capture/manifests/<category>/<slug>.json
 * Re-running `pnpm help:capture <category>/<slug>` reproduces every asset.
 */
export const captureActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), selector: z.string() }),
  z.object({ type: z.literal('fill'), selector: z.string(), value: z.string() }),
  z.object({ type: z.literal('waitFor'), selector: z.string() }),
  z.object({ type: z.literal('wait'), ms: z.number().int().positive().max(10_000) }),
  z.object({ type: z.literal('scrollTo'), selector: z.string() }),
]);

export const captureShotSchema = z.object({
  /** Output name without extension; written as <name>.webp (+ @2x). */
  name: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(['still', 'clip']),
  route: z.string().startsWith('/'),
  /** /dev/agent-login role, e.g. "cam", "owner", "board_president". */
  role: z.string().min(1),
  actions: z.array(captureActionSchema).default([]),
  /** Optional CSS selector to clip the screenshot to (stills only). */
  clipTo: z.string().optional(),
  /** Clip duration in ms (clips only, max 8s — budget is 1.5MB). */
  durationMs: z.number().int().positive().max(8_000).optional(),
});

export const captureManifestSchema = z.object({
  category: z.string().min(1),
  slug: z.string().min(1),
  viewport: z.object({ width: z.number().int(), height: z.number().int() }).default({ width: 1440, height: 900 }),
  shots: z.array(captureShotSchema).min(1),
});

export type CaptureManifest = z.infer<typeof captureManifestSchema>;
export type CaptureShot = z.infer<typeof captureShotSchema>;
```

- [ ] **Step 2: Capture script**

```ts
// scripts/help-capture/capture.ts
#!/usr/bin/env tsx
/**
 * Help media capture — local-only tooling (never CI).
 *
 * Usage:
 *   pnpm dev                       # dev server on :3000 with seeded demo data
 *   pnpm help:capture compliance/reviewing-the-compliance-dashboard
 *   pnpm help:capture --all
 *
 * Stills:  full-page or element-clipped PNG → sharp → <name>.webp (1x, viewport
 *          width) + <name>@2x.webp (deviceScaleFactor 2 capture).
 * Clips:   context.recordVideo while actions run → ffmpeg → <name>.mp4
 *          (H.264, faststart, scaled to viewport width, capped fps 24)
 *          + <name>-poster.webp from the first frame.
 * Output:  apps/web/public/help/<category>/<slug>/
 * Budgets: enforced by guard:help-content; this script warns when exceeded.
 *
 * Requires: dev server running, ffmpeg on PATH (brew install ffmpeg),
 *           `pnpm playwright:install` done once.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from 'playwright';
import sharp from 'sharp';
import { captureManifestSchema, type CaptureManifest, type CaptureShot } from './manifest-schema';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const manifestsRoot = join(scriptDir, 'manifests');
const outputRoot = join(repoRoot, 'apps', 'web', 'public', 'help');
const BASE_URL = process.env.HELP_CAPTURE_BASE_URL ?? 'http://localhost:3000';

function loadManifests(filterArg: string | undefined): CaptureManifest[] {
  const manifests: CaptureManifest[] = [];
  for (const category of readdirSync(manifestsRoot, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    for (const file of readdirSync(join(manifestsRoot, category.name))) {
      if (!file.endsWith('.json')) continue;
      const raw = JSON.parse(readFileSync(join(manifestsRoot, category.name, file), 'utf8'));
      const manifest = captureManifestSchema.parse(raw);
      const id = `${manifest.category}/${manifest.slug}`;
      if (!filterArg || filterArg === '--all' || filterArg === id) manifests.push(manifest);
    }
  }
  return manifests;
}

async function login(page: Page, role: string): Promise<void> {
  const res = await page.goto(`${BASE_URL}/dev/agent-login?as=${role}`);
  if (!res || res.status() >= 400) {
    throw new Error(`agent-login failed for role "${role}" (is the dev server running at ${BASE_URL}?)`);
  }
  await page.waitForLoadState('networkidle');
}

async function runActions(page: Page, shot: CaptureShot): Promise<void> {
  for (const action of shot.actions) {
    if (action.type === 'click') await page.click(action.selector);
    else if (action.type === 'fill') await page.fill(action.selector, action.value);
    else if (action.type === 'waitFor') await page.waitForSelector(action.selector);
    else if (action.type === 'wait') await page.waitForTimeout(action.ms);
    else if (action.type === 'scrollTo') {
      await page.locator(action.selector).scrollIntoViewIfNeeded();
    }
  }
}

async function captureStill(
  context: BrowserContext,
  shot: CaptureShot,
  outDir: string,
  viewport: { width: number; height: number },
): Promise<void> {
  const page = await context.newPage();
  await login(page, shot.role);
  await page.goto(`${BASE_URL}${shot.route}`);
  await page.waitForLoadState('networkidle');
  await runActions(page, shot);

  const pngPath = join(outDir, `${shot.name}.tmp.png`);
  if (shot.clipTo) await page.locator(shot.clipTo).screenshot({ path: pngPath });
  else await page.screenshot({ path: pngPath });

  // The context captures at deviceScaleFactor 2, so the PNG is 2x pixels.
  // Emit it as @2x, then downscale to half width for the 1x source.
  const { width: pixelWidth } = await sharp(pngPath).metadata();
  await sharp(pngPath).webp({ quality: 88 }).toFile(join(outDir, `${shot.name}@2x.webp`));
  await sharp(pngPath)
    .resize({ width: Math.round((pixelWidth ?? viewport.width * 2) / 2) })
    .webp({ quality: 88 })
    .toFile(join(outDir, `${shot.name}.webp`));
  rmSync(pngPath);
  await page.close();
}

async function captureClip(
  shot: CaptureShot,
  outDir: string,
  viewport: { width: number; height: number },
): Promise<void> {
  const browser = await chromium.launch();
  const videoDir = join(outDir, '.video-tmp');
  mkdirSync(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    recordVideo: { dir: videoDir, size: viewport },
  });
  const page = await context.newPage();
  await login(page, shot.role);
  await page.goto(`${BASE_URL}${shot.route}`);
  await page.waitForLoadState('networkidle');
  await runActions(page, shot);
  if (shot.durationMs) await page.waitForTimeout(shot.durationMs);
  await context.close();
  await browser.close();

  const webm = readdirSync(videoDir).find((f) => f.endsWith('.webm'));
  if (!webm) throw new Error(`no video recorded for ${shot.name}`);
  const webmPath = join(videoDir, webm);
  const mp4Path = join(outDir, `${shot.name}.mp4`);
  execFileSync('ffmpeg', [
    '-y', '-i', webmPath,
    '-vf', `scale=${viewport.width}:-2,fps=24`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '28',
    '-movflags', '+faststart', '-an',
    mp4Path,
  ]);
  execFileSync('ffmpeg', ['-y', '-i', mp4Path, '-vframes', '1', join(outDir, `${shot.name}-poster.tmp.png`)]);
  await sharp(join(outDir, `${shot.name}-poster.tmp.png`))
    .webp({ quality: 80 })
    .toFile(join(outDir, `${shot.name}-poster.webp`));
  rmSync(join(outDir, `${shot.name}-poster.tmp.png`));
  rmSync(videoDir, { recursive: true });

  const size = statSync(mp4Path).size;
  if (size > 1.5 * 1024 * 1024) {
    console.warn(`⚠ ${shot.name}.mp4 is ${(size / 1024 / 1024).toFixed(2)}MB — over the 1.5MB budget. Shorten or split the clip.`);
  }
}

async function main(): Promise<void> {
  const manifests = loadManifests(process.argv[2]);
  if (manifests.length === 0) {
    console.error('No manifests matched. Usage: pnpm help:capture <category>/<slug> | --all');
    process.exit(1);
  }
  for (const manifest of manifests) {
    const outDir = join(outputRoot, manifest.category, manifest.slug);
    mkdirSync(outDir, { recursive: true });
    console.log(`Capturing ${manifest.category}/${manifest.slug} (${manifest.shots.length} shots)…`);
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: manifest.viewport, deviceScaleFactor: 2 });
    for (const shot of manifest.shots) {
      if (shot.kind === 'still') await captureStill(context, shot, outDir, manifest.viewport);
      else await captureClip(shot, outDir, manifest.viewport);
      console.log(`  ✓ ${shot.name}`);
    }
    await context.close();
    await browser.close();
  }
}

void main();
```

- [ ] **Step 3: Add the package script + AUTHORING.md**

Root `package.json` scripts: `"help:capture": "tsx scripts/help-capture/capture.ts"`.

```md
<!-- apps/web/src/content/help/AUTHORING.md -->
# Help Content Authoring

## Media
- Use `<MediaFrame src alt width height caption? />` for screenshots and clips. Markdown `![...]` renders a basic framed image with NO layout-shift protection — avoid it for real media.
- Hero media goes in frontmatter `heroMedia: { src, alt, width, height, caption? }`.
- `upNext: <slug>` sets the footer "Up next" article.
- Assets live at `apps/web/public/help/<category>/<slug>/` and are referenced as `/help/<category>/<slug>/<name>.webp`. CI (`guard:help-content`) fails on missing files or budget violations (image ≤ 250KB, clip ≤ 1.5MB).
- Clips are short looping MP4s (≤ 8s), captured muted; always provide the `-poster.webp` as `poster=`.

## Capture
- Captures are scripted: `scripts/help-capture/manifests/<category>/<slug>.json`, run with `pnpm help:capture <category>/<slug>` against `pnpm dev` + seeded demo data (Sunset Condos). Roles via `/dev/agent-login` — see `.claude/rules/agent-testing.md` for the role list.
- Viewport 1440×900 @2x. Demo data only; never real-community data or PII.
- After any UI change that affects a captured page, re-run the manifest and re-commit the assets (the `HELP_RENDER_VERSION` bump in `apps/web/src/lib/help/render-version.ts` may also be needed if component markup changed).

## Steps
- `<StepByStep>` + `<Step title image? imageAlt? imageWidth? imageHeight?>` — numbers render automatically; per-step screenshots use the same asset convention.
```

- [ ] **Step 4: Smoke-test the tooling**

Prereq: `pnpm dev` running, `pnpm playwright:install` done, ffmpeg installed. Create a throwaway manifest `scripts/help-capture/manifests/compliance/smoke.json` targeting `/dashboard` as `cam` with one still; run `pnpm help:capture compliance/smoke`; confirm `apps/web/public/help/compliance/smoke/*.webp` exist and open; delete the throwaway manifest + assets.

- [ ] **Step 5: Commit**

```bash
git add scripts/help-capture package.json apps/web/src/content/help/AUTHORING.md
git commit -m "feat(help): scripted media capture tooling (playwright + sharp + ffmpeg) and authoring doc"
```

---

## Task 15: Seed the worked example — `compliance/reviewing-the-compliance-dashboard`

**Files:**
- Create: `scripts/help-capture/manifests/compliance/reviewing-the-compliance-dashboard.json`
- Create (generated): `apps/web/public/help/compliance/reviewing-the-compliance-dashboard/*`
- Modify: `apps/web/src/content/help/compliance/reviewing-the-compliance-dashboard.mdx`

- [ ] **Step 1: Write the manifest**

```json
{
  "category": "compliance",
  "slug": "reviewing-the-compliance-dashboard",
  "viewport": { "width": 1440, "height": 900 },
  "shots": [
    {
      "name": "hero",
      "kind": "clip",
      "route": "/compliance",
      "role": "cam",
      "actions": [{ "type": "waitFor", "selector": "main" }],
      "durationMs": 5000
    },
    {
      "name": "dashboard",
      "kind": "still",
      "route": "/compliance",
      "role": "cam",
      "actions": [{ "type": "waitFor", "selector": "main" }]
    }
  ]
}
```

(Adjust the route/selectors to reality when running — the compliance dashboard route for the CAM demo user; check the audit's route list. Add `scrollTo`/`click` actions to make the hero clip show meaningful motion, e.g. scrolling to the gaps panel.)

- [ ] **Step 2: Capture**

Run: `pnpm dev` (separate terminal, seeded data) then `pnpm help:capture compliance/reviewing-the-compliance-dashboard`.
Expected: `hero.mp4`, `hero-poster.webp`, `dashboard.webp`, `dashboard@2x.webp` under `apps/web/public/help/compliance/reviewing-the-compliance-dashboard/`. Open each file and eyeball: no PII, demo data only, legible at article width.

- [ ] **Step 3: Wire into the MDX**

Frontmatter additions:

```yaml
heroMedia:
  src: "/help/compliance/reviewing-the-compliance-dashboard/hero.mp4"
  poster: "/help/compliance/reviewing-the-compliance-dashboard/hero-poster.webp"
  alt: "Scrolling through the compliance dashboard score card and gaps panel"
  width: 1440
  height: 900
upNext: "fixing-compliance-gaps"
```

(`heroMedia.poster` is already in the Task 7 schema and passed through by Task 10's `HelpArticleBody`.)

In the body, attach the still to the most appropriate step, e.g.:

```mdx
<Step title="Review the dashboard" image="/help/compliance/reviewing-the-compliance-dashboard/dashboard.webp" imageAlt="The compliance dashboard with score card and gaps panel">
```

- [ ] **Step 4: Verify the full chain**

Run: `pnpm guard:help-content` (exit 0, budgets pass) and `cd apps/web && pnpm exec vitest run src/components/help/ src/lib/help/`.
Then live: with `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED=true` in the dev env, agent-login as `cam`, navigate to `/compliance`, open Help — hero clip should autoplay muted, lightbox on click, step screenshot framed.

- [ ] **Step 5: Commit**

```bash
git add scripts/help-capture/manifests/compliance/ apps/web/public/help/compliance/ apps/web/src/content/help/compliance/reviewing-the-compliance-dashboard.mdx
git commit -m "content(help): seed media for reviewing-the-compliance-dashboard (worked example)"
```

---

## Task 16: Seed the remaining ~9 articles

- [ ] **Step 1: Pick the list from production data**

Query prod (Supabase MCP, read-only):
```sql
select article_slug, count(*) as views
from help_article_views
group by article_slug
order by views desc
limit 15;
```
If results are sparse (<50 total rows), use the spec's fallback list: `submitting-a-maintenance-request`, `paying-dues-and-assessments`, `uploading-documents`, `creating-meeting-notices`, `creating-and-publishing-announcements`, `joining-your-community`, `understanding-your-dashboard`, `fixing-compliance-gaps`, `logging-visitors` (+ the Task 15 article = 10).

- [ ] **Step 2: Per article (repeat the Task 15 procedure)**

For each: write manifest (hero still or clip + step stills for `<StepByStep>` sections; pick the role from the article's frontmatter `roles`) → capture → wire frontmatter `heroMedia`/`upNext` + `<Step image=…>` → eyeball assets → `pnpm guard:help-content`. Commit per article or in batches of 3:

```bash
git add scripts/help-capture/manifests/ apps/web/public/help/ apps/web/src/content/help/
git commit -m "content(help): seed media for <slugs>"
```

- [ ] **Step 3: Repo-size sanity check**

Run: `du -sh apps/web/public/help`
Expected: ≤ ~40MB total. If over, re-encode the heaviest clips (raise CRF / shorten) before merging.

---

## Task 17: Verification sweep (run per PR; full pass before the final PR merges)

- [ ] **Step 1: Local gates (turbo-cache trap: use --force / direct tsc)**

```bash
pnpm turbo run build --filter='./packages/*'   # fresh-worktree prerequisite
cd apps/web && pnpm exec tsc --noEmit          # NOT `tsc -p` from repo root
cd ../.. && pnpm typecheck --force
pnpm lint                                       # includes guard:help-content, guard:db-access
cd apps/web && pnpm exec vitest run
```
Expected: all green. Fix forward; never skip.

- [ ] **Step 2: vi.mock factory sweep (repo trap)**

```bash
grep -rln "vi.mock('@/lib/services/help-article-service'\|vi.mock('@/hooks/use-help'\|vi.mock('@/components/help" apps/web/__tests__ apps/web/src --include="*.test.*"
```
Every factory must export the symbols its importers now use (`upNext` in responses, new panel props, `stackDepth`/`back` on the provider). A missing export 500s every test in the file at module load.

- [ ] **Step 3: Live verification (preview tools, flag on in dev)**

With `NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED=true`:
1. Agent-login as `cam` → `/compliance` → open Help: hero plays muted; click → lightbox; ESC closes lightbox ONLY; click lightbox backdrop closes lightbox ONLY; ESC again closes modal.
2. Open a related guide → back chevron appears → back returns; URL never changes during pushes.
3. Type in header search while reading → panel appears; results include FAQ section for a query like "assessments"; pick result → pushes article; clear search restored on close.
4. `/documents` as `cam`: "Help for this page" shows all 6 matches with show-more.
5. Deep link: `/compliance?help=compliance/fixing-compliance-gaps` opens that article; closing strips `?help=`.
6. Resize to mobile width: sheet shows pinned header/footer.
7. Screenshot evidence of the redesigned modal for the PR description.

- [ ] **Step 4: Commit any fixes, push, PR**

Per the PR grouping at the top. PR descriptions note: the Step-numbering deviation (Children-index vs CSS counters), the `HELP_RENDER_VERSION` bump requirement for future markup changes, and that the prod flag value must be checked before assuming user visibility.
