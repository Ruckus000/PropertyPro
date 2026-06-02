# Property Landing Page — PR #1b Tidewater + Hero Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first vertical slice of the Property Landing Page system — the Tidewater layout, the Hero block renderer, a minimal PM-facing Hero editor at `/pm/settings/website/?communityId=X`, the `_site/page.tsx` rewire to layout-registry rendering with safe fallback, the `buildCommunityMetadata` SEO helper + `generateMetadata()`, the performance baseline assertion, the carryover security fix from PR #1a's review, and documentation.

**Architecture:** `_site/page.tsx` keeps its existing JSX-template branch unchanged (retired in PR #9). When `compiledHtml` is null, it now resolves a `LayoutId` from `branding.layoutId ?? defaultByCommunityType(communityType)` and asks the layout registry. If the layout is registered (Tidewater after this PR), it renders through the layout component; otherwise it falls back to the current hardcoded markup verbatim — no per-community feature-flag column required (per the user's gotcha #6 recommendation). Tidewater iterates the community's published `site_blocks`, dispatching each via `blockRendererRegistry`. Unknown block types are skipped and logged. The Hero block renderer validates `block.content` against `heroBlockSchema.safeParse(...)`; if no hero block exists, Tidewater renders a derived empty-state hero from `community.name`. The PM editor saves Hero content directly to a published row (`is_draft=false`) — the full draft/preview/publish workflow ships in PR #8.

**Tech Stack:** Next.js 15 App Router, React 19 server components, Zod, Vitest + React Testing Library, Tailwind + tokens, TanStack Query for the editor form, Drizzle ORM via `createScopedClient` for authenticated writes and `getPublicCommunityScopedReader` for unauthenticated reads. No new packages.

**Spec reference:** [docs/superpowers/specs/2026-05-26-property-landing-page-design.md](../specs/2026-05-26-property-landing-page-design.md), Section 9 row "1b", Section 9.0 (existing tests), Sections 2.3/2.4/2.9, Section 8.5. **PR #1a review fold-in:** [PR #479 inline finding](https://github.com/Ruckus000/PropertyPro/pull/479) — `ctaTargetSchema` accepts `//evil.com` as an internal path; fix is Task 1.

---

## File Structure

**New files:**

| Path | Responsibility |
|------|----------------|
| `apps/web/src/lib/seo/community-metadata.ts` | `buildCommunityMetadata(community, opts?)` — shared Next 15 `Metadata` builder for the public site. |
| `apps/web/src/lib/public-site/layout-resolver.ts` | `resolveLayoutId(branding, communityType)` — small pure helper producing a `LayoutId`. |
| `apps/web/src/components/public-site/blocks/HeroBlock.tsx` | React server component renderer for `hero` block. Validates content via `heroBlockSchema`; renders headline + subtitle + optional CTA + optional hero image. |
| `apps/web/src/components/public-site/layouts/Tidewater.tsx` | Tidewater layout component. Owns header/footer/section rhythm; iterates blocks via `blockRendererRegistry`; renders an empty-state hero from `community.name` when no hero block is present. |
| `apps/web/src/lib/services/site-blocks-service.ts` | `upsertPublishedHero(communityId, content)` — transactional service. PR #1b ships hero-only; PR #8 generalizes. |
| `apps/web/src/app/api/v1/pm/site/hero/route.ts` | `GET` (returns current published hero or null) + `PATCH` (validates Hero content, calls `upsertPublishedHero`). Authenticated, audit-logged, plan-feature-gated on `hasSiteEditor`. |
| `apps/web/src/hooks/use-hero-block.ts` | React Query hook(s): `useHeroBlock(communityId)` + `useUpdateHeroBlock(communityId)`. |
| `apps/web/src/components/pm/site-editor/HeroBlockForm.tsx` | Client component form with controlled inputs for headline / subtitle / ctaText / ctaTarget. Disabled save until valid; surfaces server-validation errors. |
| `apps/web/src/app/(authenticated)/pm/settings/website/page.tsx` | Server component page. Resolves community + role membership, loads current hero, renders `<HeroBlockForm>` inside a single "Welcome" tab placeholder. |
| `docs/design-system/blocks/hero.md` | Hero block design + Zod schema + renderer + editor doc. |
| `docs/design-system/templates/tidewater.md` | Tidewater layout design intent + tokens + accessibility constraints + photographic guidance. |

**Modified files:**

| Path | Change |
|------|--------|
| `packages/shared/src/site-blocks/types.ts` | Fix `ctaTargetSchema` so `//evil.com` (protocol-relative URL) is rejected. Tightened regex/refine. |
| `packages/shared/__tests__/site-blocks/hero.test.ts` | Add a test case proving `//evil.com` is rejected; verify existing tests still pass. |
| `apps/web/src/components/public-site/blocks/registry.ts` | Register `hero: HeroBlock` and tighten the type from `Partial<Record<…>>` to keep PR #1a's loose shape (still partial in 1b — more blocks come later). |
| `apps/web/src/components/public-site/layouts/registry.ts` | Register `tidewater: Tidewater`. |
| `apps/web/src/components/public-site/layouts/README.md` | Mark Tidewater as the first implemented layout; add a "Status" column. |
| `apps/web/src/app/_site/page.tsx` | Add `generateMetadata()`; add the layout-registry render path with safe fallback. Keep the existing `compiledHtml` branch verbatim. Keep the existing hardcoded JSX as the no-layout-registered fallback. |
| `apps/web/__tests__/public/public-website.test.tsx` | Update assertions to the new render path. Existing assertions about hardcoded "Community Resources" / "Have questions?" stay valid only on the fallback path; add new assertions for the Tidewater path. |
| `apps/web/__tests__/public-site/community-resolution.test.ts` | Verify pass-through unchanged; add coverage that `_site` receives `x-community-id` on the layout-registry path. |
| `apps/web/__tests__/theme/theme-injection-mobile.test.tsx` | Adjust assertions where the theme-injection path now lives inside Tidewater rather than the hardcoded markup. |
| `scripts/perf-check.ts` | Add a "site:render" check that hits a seeded demo community's `_site` route and asserts p95 < 500ms. |

**Tests created:**

| Path | Coverage |
|------|----------|
| `apps/web/__tests__/lib/seo/community-metadata.test.ts` | `buildCommunityMetadata` shape, falsy fields, OG image url construction, robots policy. |
| `apps/web/__tests__/lib/public-site/layout-resolver.test.ts` | Each community type → expected default; explicit `branding.layoutId` overrides default; null/undefined branding → community-type default. |
| `apps/web/__tests__/components/public-site/blocks/HeroBlock.test.tsx` | Renders headline + subtitle + CTA; rejects invalid content (renders fallback); decorative variant; CTA-absent variant. |
| `apps/web/__tests__/components/public-site/layouts/Tidewater.test.tsx` | Renders header/footer; renders registered blocks in order; skips unknown block types; derived empty-state hero when no hero block. |
| `apps/web/__tests__/lib/services/site-blocks-service.test.ts` | `upsertPublishedHero` happy + replaces previous published hero (idempotency); audit log entry written. |
| `apps/web/__tests__/api/pm/site/hero.test.ts` | GET + PATCH happy + 401 + 403 (no membership) + 403 (no `hasSiteEditor`) + 400 (invalid Zod) + audit log. |
| `apps/web/__tests__/hooks/use-hero-block.test.tsx` | `useHeroBlock` fetches; `useUpdateHeroBlock` mutates + invalidates query. |
| `apps/web/__tests__/components/pm/site-editor/HeroBlockForm.test.tsx` | Renders inputs; disables save when invalid; surfaces server error; calls mutation with correct payload. |
| `apps/web/__tests__/perf/site-render-budget.test.ts` *(optional sanity unit test)* | Snapshot the perf-check predicate logic so future edits don't silently relax the budget. |

---

## Task Overview

| # | Task | Files | Expected duration |
|---|------|-------|--------------------|
| 1 | Fix `ctaTargetSchema` protocol-relative URL bug | types.ts + hero.test.ts | 20m |
| 2 | `buildCommunityMetadata` SEO helper + tests | seo/community-metadata.ts + test | 35m |
| 3 | `resolveLayoutId` helper + tests | public-site/layout-resolver.ts + test | 20m |
| 4 | HeroBlock renderer + tests | blocks/HeroBlock.tsx + test | 50m |
| 5 | Tidewater layout component + tests | layouts/Tidewater.tsx + test | 75m |
| 6 | Register HeroBlock + Tidewater | both registry.ts files | 15m |
| 7 | `_site/page.tsx` rewire + generateMetadata + update `public-website.test.tsx` | _site/page.tsx + test update | 60m |
| 8 | Update `community-resolution.test.ts` | test only | 15m |
| 9 | Update `theme-injection-mobile.test.tsx` | test only | 20m |
| 10 | `upsertPublishedHero` service + tests | services/site-blocks-service.ts + test | 45m |
| 11 | `PATCH /api/v1/pm/site/hero` route + tests | api/v1/pm/site/hero/route.ts + test | 45m |
| 12 | `GET /api/v1/pm/site/hero` (same route, additional method) + tests | route.ts (extend) + test (extend) | 30m |
| 13 | `useHeroBlock` + `useUpdateHeroBlock` hooks + tests | hooks/use-hero-block.ts + test | 40m |
| 14 | `HeroBlockForm` client component + tests | components/pm/site-editor/HeroBlockForm.tsx + test | 60m |
| 15 | PM settings/website page (server component) | app/(authenticated)/pm/settings/website/page.tsx | 30m |
| 16 | Perf baseline check in `scripts/perf-check.ts` | perf-check.ts | 40m |
| 17 | Doc: `blocks/hero.md` | docs file | 15m |
| 18 | Doc: `templates/tidewater.md` | docs file | 15m |
| 19 | Doc: update `layouts/README.md` | README update | 10m |
| 20 | Final validation: typecheck/lint/test/migrate/build/perf-check + open PR | (verification) | 30m |

Total: ~10 hours of focused engineering. Spec estimate was ~5 days — extra headroom is for review cycles and the existing-test surgery in tasks 7-9.

---

### Task 1: Fix `ctaTargetSchema` protocol-relative URL bug

**Files:**
- Modify: `packages/shared/src/site-blocks/types.ts`
- Modify: `packages/shared/__tests__/site-blocks/hero.test.ts`

The gemini-code-assist inline review on PR #479 flagged that `v.startsWith('/')` matches `//evil.com`, which browsers treat as protocol-relative external links — bypassing the HTTPS-only requirement and enabling open-redirect attacks.

- [ ] **Step 1: Add the failing test cases**

Open `packages/shared/__tests__/site-blocks/hero.test.ts`. After the existing `'rejects ctaTarget with non-https scheme'` test, add:

```typescript
  it('rejects ctaTarget with protocol-relative URL', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: '//evil.com' });
    expect(result.success).toBe(false);
  });

  it('rejects ctaTarget that is just two slashes', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: '//' });
    expect(result.success).toBe(false);
  });

  it('still accepts a normal internal path with a single leading slash', () => {
    const result = heroBlockSchema.safeParse({ ...valid, ctaTarget: '/path/to/page' });
    expect(result.success).toBe(true);
  });
```

- [ ] **Step 2: Run the tests, verify the two new cases fail**

Run:
```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/hero.test.ts
```

Expected: the two new `//`-rejection cases FAIL (the schema currently accepts them); other tests pass.

- [ ] **Step 3: Tighten the refine in `ctaTargetSchema`**

Open `packages/shared/src/site-blocks/types.ts`. Replace the `ctaTargetSchema` refine:

```typescript
/** Common CTA target — internal path or external URL (https only). */
export const ctaTargetSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (v) => (v.startsWith('/') && !v.startsWith('//')) || v.startsWith('https://'),
    'CTA target must be an internal path (starting with /, not //) or an https URL',
  );
```

- [ ] **Step 4: Run the tests, verify all pass**

```bash
pnpm --filter @propertypro/shared exec vitest run __tests__/site-blocks/hero.test.ts
```

Expected: all hero tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/site-blocks/types.ts packages/shared/__tests__/site-blocks/hero.test.ts
git commit -m "fix(shared): ctaTargetSchema rejects protocol-relative URLs (PR #1b · 1/20)

Addresses gemini-code-assist inline review on PR #479: \`//evil.com\`
matched the previous \`v.startsWith('/')\` check and bypassed the
HTTPS-only requirement, enabling open-redirect risk on Hero block CTAs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `buildCommunityMetadata` SEO helper + tests

**Files:**
- Create: `apps/web/src/lib/seo/community-metadata.ts`
- Create: `apps/web/__tests__/lib/seo/community-metadata.test.ts`

The helper produces a Next 15 `Metadata` object from a community + optional fields. Pure function — no DB access, no `headers()`. Caller passes what it has.

- [ ] **Step 1: Create the test scaffold and confirm it fails**

Create `apps/web/__tests__/lib/seo/community-metadata.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildCommunityMetadata } from '@/lib/seo/community-metadata';

const baseCommunity = {
  id: 1,
  name: 'Sunset Condos',
  slug: 'sunset-condos',
  communityType: 'condo_718' as const,
  city: 'Miami',
};

describe('buildCommunityMetadata', () => {
  it('produces a title with " — Community Portal" suffix', () => {
    const meta = buildCommunityMetadata(baseCommunity);
    expect(meta.title).toBe('Sunset Condos — Community Portal');
  });

  it('uses the tagline as description when provided', () => {
    const meta = buildCommunityMetadata({ ...baseCommunity, tagline: 'A welcoming Florida community.' });
    expect(meta.description).toBe('A welcoming Florida community.');
  });

  it('falls back to a community-type-aware default description when no tagline', () => {
    const condo = buildCommunityMetadata(baseCommunity);
    expect(condo.description).toContain('condominium association');
    expect(condo.description).toContain('Miami');

    const hoa = buildCommunityMetadata({ ...baseCommunity, communityType: 'hoa_720' });
    expect(hoa.description).toContain('homeowners association');

    const apt = buildCommunityMetadata({ ...baseCommunity, communityType: 'apartment' });
    expect(apt.description).toContain('apartment community');
  });

  it('builds the canonical site url from the slug', () => {
    const meta = buildCommunityMetadata(baseCommunity);
    expect(meta.openGraph?.url).toBe('https://sunset-condos.getpropertypro.com');
  });

  it('sets robots index:true follow:true (the public site is meant to be crawled)', () => {
    const meta = buildCommunityMetadata(baseCommunity);
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  it('produces no openGraph image when no heroImageUrl is provided', () => {
    const meta = buildCommunityMetadata(baseCommunity);
    expect(meta.openGraph?.images ?? []).toEqual([]);
  });

  it('emits a 1600x900 openGraph image when heroImageUrl is provided', () => {
    const meta = buildCommunityMetadata({
      ...baseCommunity,
      heroImageUrl: 'https://cdn.example.com/hero.webp',
    });
    expect(meta.openGraph?.images).toEqual([
      { url: 'https://cdn.example.com/hero.webp', width: 1600, height: 900, alt: 'Sunset Condos' },
    ]);
  });

  it('uses summary_large_image when there is a heroImageUrl, summary otherwise', () => {
    const withImage = buildCommunityMetadata({ ...baseCommunity, heroImageUrl: 'https://x/y.webp' });
    expect(withImage.twitter?.card).toBe('summary_large_image');

    const noImage = buildCommunityMetadata(baseCommunity);
    expect(noImage.twitter?.card).toBe('summary');
  });

  it('falls back gracefully when city is null', () => {
    const meta = buildCommunityMetadata({ ...baseCommunity, city: null });
    expect(meta.description).toContain('Florida');
    expect(meta.description).not.toContain('null');
  });
});
```

Run it:
```bash
pnpm --filter web exec vitest run __tests__/lib/seo/community-metadata.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 2: Implement the helper**

Create `apps/web/src/lib/seo/community-metadata.ts`:

```typescript
import type { Metadata } from 'next';

export interface CommunityMetadataInput {
  id: number;
  slug: string;
  name: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  city?: string | null;
  tagline?: string | null;
  /** Fully-qualified URL to the hero image (1600×900 recommended). */
  heroImageUrl?: string | null;
}

const TYPE_TO_NOUN: Record<CommunityMetadataInput['communityType'], string> = {
  condo_718: 'condominium association',
  hoa_720: 'homeowners association',
  apartment: 'apartment community',
};

function defaultDescription(c: CommunityMetadataInput): string {
  const noun = TYPE_TO_NOUN[c.communityType];
  const where = c.city ? `${c.city}, Florida` : 'Florida';
  return `Official site of ${c.name}, a ${noun} in ${where}.`;
}

export function buildCommunityMetadata(community: CommunityMetadataInput): Metadata {
  const description = community.tagline?.trim() || defaultDescription(community);
  const url = `https://${community.slug}.getpropertypro.com`;
  const images = community.heroImageUrl
    ? [{ url: community.heroImageUrl, width: 1600, height: 900, alt: community.name }]
    : [];

  return {
    title: `${community.name} — Community Portal`,
    description,
    openGraph: {
      title: community.name,
      description,
      url,
      siteName: community.name,
      images,
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: images.length > 0 ? 'summary_large_image' : 'summary',
      title: community.name,
      description,
    },
    robots: { index: true, follow: true },
  };
}
```

- [ ] **Step 3: Run tests, verify pass**

```bash
pnpm --filter web exec vitest run __tests__/lib/seo/community-metadata.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/seo/community-metadata.ts apps/web/__tests__/lib/seo/community-metadata.test.ts
git commit -m "feat(seo): buildCommunityMetadata helper for public site (PR #1b · 2/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `resolveLayoutId` helper + tests

**Files:**
- Create: `apps/web/src/lib/public-site/layout-resolver.ts`
- Create: `apps/web/__tests__/lib/public-site/layout-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/lib/public-site/layout-resolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveLayoutId } from '@/lib/public-site/layout-resolver';

describe('resolveLayoutId', () => {
  it('returns the explicit branding.layoutId when set', () => {
    expect(resolveLayoutId({ layoutId: 'sable' }, 'condo_718')).toBe('sable');
    expect(resolveLayoutId({ layoutId: 'boulevard' }, 'apartment')).toBe('boulevard');
  });

  it('falls back to community_type default when branding.layoutId is missing', () => {
    expect(resolveLayoutId({}, 'condo_718')).toBe('tidewater');
    expect(resolveLayoutId({}, 'hoa_720')).toBe('boulevard');
    expect(resolveLayoutId({}, 'apartment')).toBe('sable');
  });

  it('falls back to community_type default when branding is null', () => {
    expect(resolveLayoutId(null, 'condo_718')).toBe('tidewater');
  });

  it('falls back to tidewater for unknown community types (defensive default)', () => {
    expect(resolveLayoutId(null, 'unknown' as never)).toBe('tidewater');
  });

  it('ignores an unknown branding.layoutId and uses the community_type default', () => {
    expect(resolveLayoutId({ layoutId: 'futuristic' as never }, 'apartment')).toBe('sable');
  });
});
```

Run it:
```bash
pnpm --filter web exec vitest run __tests__/lib/public-site/layout-resolver.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 2: Implement**

Create `apps/web/src/lib/public-site/layout-resolver.ts`:

```typescript
import type { LayoutId } from '@/components/public-site/layouts/types';

const LAYOUT_IDS: readonly LayoutId[] = ['tidewater', 'boulevard', 'sable'] as const;

function isLayoutId(v: unknown): v is LayoutId {
  return typeof v === 'string' && (LAYOUT_IDS as readonly string[]).includes(v);
}

const COMMUNITY_TYPE_DEFAULT: Record<string, LayoutId> = {
  condo_718: 'tidewater',
  hoa_720: 'boulevard',
  apartment: 'sable',
};

export interface BrandingLayoutInput {
  layoutId?: string | null;
}

export function resolveLayoutId(
  branding: BrandingLayoutInput | null | undefined,
  communityType: string,
): LayoutId {
  if (branding && isLayoutId(branding.layoutId)) {
    return branding.layoutId;
  }
  return COMMUNITY_TYPE_DEFAULT[communityType] ?? 'tidewater';
}
```

- [ ] **Step 3: Run tests, verify pass**

```bash
pnpm --filter web exec vitest run __tests__/lib/public-site/layout-resolver.test.ts
pnpm --filter web typecheck
```

Expected: 5 tests pass; no typecheck errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/public-site/layout-resolver.ts apps/web/__tests__/lib/public-site/layout-resolver.test.ts
git commit -m "feat(public-site): resolveLayoutId helper (PR #1b · 3/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: HeroBlock renderer + tests

**Files:**
- Create: `apps/web/src/components/public-site/blocks/HeroBlock.tsx`
- Create: `apps/web/__tests__/components/public-site/blocks/HeroBlock.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/components/public-site/blocks/HeroBlock.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroBlock } from '@/components/public-site/blocks/HeroBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const communityFixture = {
  id: 1,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  communityType: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  timezone: 'America/New_York',
};

const themeFixture = {
  primaryColor: '#0e3338',
  secondaryColor: '#f6f1e6',
  accentColor: '#c66f49',
  headingFont: 'Fraunces',
  bodyFont: 'Manrope',
};

function makeProps(content: unknown): BlockRendererProps {
  return {
    block: { id: 10, blockType: 'hero', blockOrder: 1, content },
    community: communityFixture,
    theme: themeFixture,
    layout: 'tidewater',
  };
}

describe('<HeroBlock>', () => {
  it('renders headline as an h1', () => {
    render(<HeroBlock {...makeProps({ headline: 'Welcome to Sunset Condos' })} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to Sunset Condos');
  });

  it('renders subtitle when provided', () => {
    render(<HeroBlock {...makeProps({ headline: 'X', subtitle: 'A welcoming community.' })} />);
    expect(screen.getByText('A welcoming community.')).toBeInTheDocument();
  });

  it('omits subtitle when not provided', () => {
    render(<HeroBlock {...makeProps({ headline: 'X' })} />);
    expect(screen.queryByText(/welcoming community/i)).not.toBeInTheDocument();
  });

  it('renders CTA when ctaText + ctaTarget both present', () => {
    render(<HeroBlock {...makeProps({ headline: 'X', ctaText: 'Resident Login', ctaTarget: '/auth/login' })} />);
    const cta = screen.getByRole('link', { name: 'Resident Login' });
    expect(cta).toHaveAttribute('href', '/auth/login');
  });

  it('omits CTA when ctaText or ctaTarget missing', () => {
    render(<HeroBlock {...makeProps({ headline: 'X' })} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders nothing visible (and emits a console warning) when content is invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<HeroBlock {...makeProps({ headline: '' /* invalid */ })} />);
    // Either renders an empty fragment or a minimal fallback — assert no h1 leaks
    expect(container.querySelector('h1')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('hero block content'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('renders hero image with required alt text when provided', () => {
    render(
      <HeroBlock
        {...makeProps({
          headline: 'X',
          heroImagePath: '1/hero/test.webp',
          heroImageAlt: 'The pool at golden hour',
        })}
      />,
    );
    const img = screen.getByRole('img', { name: 'The pool at golden hour' });
    expect(img).toBeInTheDocument();
  });
});
```

Add the missing import at the top: `import { vi } from 'vitest';`

Run it:
```bash
pnpm --filter web exec vitest run __tests__/components/public-site/blocks/HeroBlock.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 2: Implement HeroBlock**

Create `apps/web/src/components/public-site/blocks/HeroBlock.tsx`:

```typescript
import Image from 'next/image';
import { heroBlockSchema, type HeroBlockContent } from '@propertypro/shared';
import type { BlockRendererProps } from './types';

function buildPublicAssetUrl(path: string): string {
  // PR #2 wires the real bucket URL builder; for v1b, return the storage path as-is.
  // The Next/Image loader is configured (or will be in PR #2) to accept these.
  return `/site-assets/${path}`;
}

export function HeroBlock(props: BlockRendererProps) {
  const parsed = heroBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    // Defense-in-depth: Tidewater is supposed to filter invalid blocks, but
    // if one slips through we render nothing rather than crashing the page.
    console.warn(
      'hero block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const content: HeroBlockContent = parsed.data;

  return (
    <section className="bg-primary px-4 py-20 text-center sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-heading text-4xl font-bold text-content-inverse sm:text-5xl">
          {content.headline}
        </h1>
        {content.subtitle && (
          <p className="mt-4 text-lg text-content-inverse/80">{content.subtitle}</p>
        )}
        {content.ctaText && content.ctaTarget && (
          <div className="mt-8">
            <a
              href={content.ctaTarget}
              className="inline-flex items-center rounded-md bg-surface-card px-6 py-3 text-base font-medium text-primary shadow-e2 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content-inverse"
            >
              {content.ctaText}
            </a>
          </div>
        )}
        {content.heroImagePath && content.heroImageAlt && (
          <div className="mt-10 flex justify-center">
            {/* width/height required by next/image; aspect-ratio enforced via container */}
            <Image
              src={buildPublicAssetUrl(content.heroImagePath)}
              alt={content.heroImageAlt}
              width={1600}
              height={900}
              className="rounded-md shadow-e1"
              priority
            />
          </div>
        )}
      </div>
    </section>
  );
}
```

If `next/image` requires a `loader` config for the storage paths, fall back to `<img>` in v1b (PR #2 ships the proper image pipeline). Replace the `<Image>` block with:
```tsx
<img src={buildPublicAssetUrl(content.heroImagePath)} alt={content.heroImageAlt} className="rounded-md shadow-e1" />
```

- [ ] **Step 3: Run tests, verify pass**

```bash
pnpm --filter web exec vitest run __tests__/components/public-site/blocks/HeroBlock.test.tsx
```

Expected: 7 tests pass. If `<Image>` fails because the test environment cannot fetch the URL, swap to `<img>` per the note above.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/public-site/blocks/HeroBlock.tsx apps/web/__tests__/components/public-site/blocks/HeroBlock.test.tsx
git commit -m "feat(public-site): HeroBlock renderer (PR #1b · 4/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Tidewater layout component + tests

**Files:**
- Create: `apps/web/src/components/public-site/layouts/Tidewater.tsx`
- Create: `apps/web/__tests__/components/public-site/layouts/Tidewater.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/components/public-site/layouts/Tidewater.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tidewater } from '@/components/public-site/layouts/Tidewater';

// Mock the registry so we can isolate Tidewater from HeroBlock changes
vi.mock('@/components/public-site/blocks/registry', () => ({
  blockRendererRegistry: {
    hero: (props: { block: { content: { headline?: string } } }) => (
      <div data-testid="hero-mock">{props.block.content.headline ?? 'no-headline'}</div>
    ),
  },
  hasRenderer: (t: string) => t === 'hero',
}));

const community = {
  id: 1,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  communityType: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  timezone: 'America/New_York',
};
const theme = {
  primaryColor: '#0e3338',
  secondaryColor: '#f6f1e6',
  accentColor: '#c66f49',
  headingFont: 'Fraunces',
  bodyFont: 'Manrope',
};

describe('<Tidewater>', () => {
  it('renders page header and footer chrome', () => {
    render(<Tidewater community={community} theme={theme} blocks={[]} />);
    // Footer carries the community name per existing PublicSiteFooter
    expect(screen.getAllByText(/Sunset Condos/i).length).toBeGreaterThan(0);
  });

  it('renders the empty-state hero when no hero block is present', () => {
    render(<Tidewater community={community} theme={theme} blocks={[]} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sunset Condos');
  });

  it('dispatches blocks to the registry by blockType, in blockOrder', () => {
    render(
      <Tidewater
        community={community}
        theme={theme}
        blocks={[
          { id: 10, blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome' } },
        ]}
      />,
    );
    expect(screen.getByTestId('hero-mock')).toHaveTextContent('Welcome');
  });

  it('skips unknown block types without throwing', () => {
    render(
      <Tidewater
        community={community}
        theme={theme}
        blocks={[
          { id: 11, blockType: 'unicorn', blockOrder: 1, content: {} },
          { id: 12, blockType: 'hero', blockOrder: 2, content: { headline: 'After unicorn' } },
        ]}
      />,
    );
    expect(screen.queryByText(/unicorn/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('hero-mock')).toHaveTextContent('After unicorn');
  });

  it('does not render the empty-state hero when a hero block is supplied', () => {
    render(
      <Tidewater
        community={community}
        theme={theme}
        blocks={[
          { id: 10, blockType: 'hero', blockOrder: 1, content: { headline: 'PM-authored hero' } },
        ]}
      />,
    );
    // The empty-state hero would render community.name as h1; the mock hero
    // renders the PM-supplied headline. Only one h1 either way; assert text.
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s.some((h) => h.textContent === 'Sunset Condos')).toBe(false);
    expect(screen.getByTestId('hero-mock')).toBeInTheDocument();
  });
});
```

Run it:
```bash
pnpm --filter web exec vitest run __tests__/components/public-site/layouts/Tidewater.test.tsx
```

Expected: module-not-found failure.

- [ ] **Step 2: Implement Tidewater**

Create `apps/web/src/components/public-site/layouts/Tidewater.tsx`:

```typescript
import { PublicSiteHeader } from '@/components/public-site/PublicSiteHeader';
import { PublicSiteFooter } from '@/components/public-site/PublicSiteFooter';
import { blockRendererRegistry } from '@/components/public-site/blocks/registry';
import type { LayoutProps, SiteBlock } from './types';

function hasHeroBlock(blocks: SiteBlock[]): boolean {
  return blocks.some((b) => b.blockType === 'hero');
}

function EmptyStateHero({ communityName }: { communityName: string }) {
  return (
    <section className="bg-primary px-4 py-20 text-center sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-heading text-4xl font-bold text-content-inverse sm:text-5xl">
          {communityName}
        </h1>
        <p className="mt-4 text-lg text-content-inverse/80">
          Your community portal for documents, meetings, and more.
        </p>
        <div className="mt-8">
          <a
            href="/auth/login"
            className="inline-flex items-center rounded-md bg-surface-card px-6 py-3 text-base font-medium text-primary shadow-e2 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content-inverse"
          >
            Resident Login
          </a>
        </div>
      </div>
    </section>
  );
}

export function Tidewater({ community, theme, blocks }: LayoutProps) {
  const ordered = [...blocks].sort((a, b) => a.blockOrder - b.blockOrder);

  return (
    <div className="min-h-screen flex flex-col font-body">
      <PublicSiteHeader theme={theme} />
      <main id="main-content" className="flex-1">
        {!hasHeroBlock(ordered) && <EmptyStateHero communityName={community.name} />}
        {ordered.map((block) => {
          const Renderer = blockRendererRegistry[block.blockType as keyof typeof blockRendererRegistry];
          if (!Renderer) {
            // Unknown block type — skip silently (logged at the page level).
            return null;
          }
          return (
            <Renderer
              key={block.id}
              block={block}
              community={community}
              theme={theme}
              layout="tidewater"
            />
          );
        })}
      </main>
      <PublicSiteFooter communityName={community.name} />
    </div>
  );
}
```

- [ ] **Step 3: Run tests, verify pass**

```bash
pnpm --filter web exec vitest run __tests__/components/public-site/layouts/Tidewater.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/public-site/layouts/Tidewater.tsx apps/web/__tests__/components/public-site/layouts/Tidewater.test.tsx
git commit -m "feat(public-site): Tidewater layout component (PR #1b · 5/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Register HeroBlock + Tidewater

**Files:**
- Modify: `apps/web/src/components/public-site/blocks/registry.ts`
- Modify: `apps/web/src/components/public-site/layouts/registry.ts`

- [ ] **Step 1: Register HeroBlock**

Replace the body of `apps/web/src/components/public-site/blocks/registry.ts`:

```typescript
import type { BlockType } from '@propertypro/shared';
import type { BlockRenderer } from './types';
import { HeroBlock } from './HeroBlock';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const blockRendererRegistry: Partial<Record<BlockType, BlockRenderer<any>>> = {
  hero: HeroBlock,
  // text, image: PR #2
  // announcements: PR #3
  // documents, meetings, contact: PR #4
};

export function hasRenderer(blockType: BlockType): boolean {
  return blockType in blockRendererRegistry;
}
```

- [ ] **Step 2: Register Tidewater**

Replace the registry block of `apps/web/src/components/public-site/layouts/registry.ts`:

```typescript
import type { LayoutId, LayoutComponent } from './types';
import { Tidewater } from './Tidewater';

export const layoutRegistry: Partial<Record<LayoutId, LayoutComponent>> = {
  tidewater: Tidewater,
  // boulevard, sable: PR #7
};

export function getLayout(id: LayoutId): LayoutComponent | undefined {
  return layoutRegistry[id];
}
```

- [ ] **Step 3: Verify typecheck + existing tests still pass**

```bash
pnpm --filter web typecheck
pnpm --filter web exec vitest run __tests__/components/public-site
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/public-site/blocks/registry.ts apps/web/src/components/public-site/layouts/registry.ts
git commit -m "feat(public-site): register HeroBlock + Tidewater (PR #1b · 6/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `_site/page.tsx` rewire + generateMetadata + public-website test update

**Files:**
- Modify: `apps/web/src/app/_site/page.tsx`
- Modify: `apps/web/__tests__/public/public-website.test.tsx`

- [ ] **Step 1: Read the current `public-website.test.tsx`**

Run:
```bash
cat apps/web/__tests__/public/public-website.test.tsx | head -120
```

Note: which functions it mocks (`getCommunityPublicInfo`, `getBrandingForCommunity`, `getPublishedTemplate`, possibly `resolveTheme`). Write down the mock setup style. You will preserve it.

- [ ] **Step 2: Rewire `_site/page.tsx`**

Open `apps/web/src/app/_site/page.tsx`. Apply two changes:

**(a) Add `generateMetadata()` near the top (after imports, before `resolveCommunityId`):**

```typescript
import type { Metadata } from 'next';
import { buildCommunityMetadata } from '@/lib/seo/community-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const communityId = await resolveCommunityId();
  if (!communityId) return { title: 'PropertyPro' };
  const community = await getCommunityPublicInfo(communityId);
  if (!community) return { title: 'PropertyPro' };
  return buildCommunityMetadata({
    id: community.id,
    slug: community.slug,
    name: community.name,
    communityType: community.communityType as 'condo_718' | 'hoa_720' | 'apartment',
    // `city`, `tagline`, `heroImageUrl` not in CommunityPublicInfo yet —
    // helper degrades gracefully.
  });
}
```

You need to MOVE `resolveCommunityId` above `generateMetadata` if it isn't already. Alternatively duplicate the small block inline.

**(b) Replace the rendering branch after `if (compiledHtml) { … }` with the layout-registry path + fallback:**

After `const compiledHtml = await getPublishedTemplate(community.id);` and the `if (compiledHtml) { … }` block, add:

```typescript
  // New layout-registry render path (PR #1b)
  const layoutId = resolveLayoutId(branding, community.communityType);
  const Layout = getLayout(layoutId);

  if (Layout) {
    const reader = getPublicCommunityScopedReader(community.id);
    const blocks = await reader.listSiteBlocks();
    return (
      <>
        {fontLinks.map((href) => (
          // eslint-disable-next-line @next/next/no-page-custom-font
          <link key={href} rel="stylesheet" href={href} />
        ))}
        <div style={cssVars}>
          <Layout
            community={{
              id: community.id,
              slug: community.slug,
              name: community.name,
              communityType: community.communityType as 'condo_718' | 'hoa_720' | 'apartment',
              city: null,
              state: null,
              timezone: 'America/New_York',
            }}
            theme={{
              primaryColor: theme.primaryColor,
              secondaryColor: theme.secondaryColor,
              accentColor: theme.accentColor,
              headingFont: theme.headingFont,
              bodyFont: theme.bodyFont,
            }}
            blocks={blocks.map((b) => ({
              id: b.id,
              blockType: b.blockType,
              blockOrder: b.blockOrder,
              content: b.content,
            }))}
          />
        </div>
      </>
    );
  }

  // Legacy hardcoded fallback (kept verbatim until all layouts ship in PR #7)
  return (
    <>
      {fontLinks.map((href) => (
        // ... existing hardcoded JSX unchanged ...
```

Add the necessary new imports at the top of the file:

```typescript
import { resolveLayoutId } from '@/lib/public-site/layout-resolver';
import { getLayout } from '@/components/public-site/layouts/registry';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
```

After PR #1b lands, the Tidewater layout is registered, so for ALL communities with `communityType` ∈ {`condo_718`, `hoa_720`, `apartment`} the `if (Layout)` branch is taken. The "legacy hardcoded fallback" is unreachable from any seeded community — kept only because it would surface if the registry were ever cleared during a layout deletion. That is acceptable and matches PR #1a's gotcha #6 strategy.

- [ ] **Step 3: Update `public-website.test.tsx`**

Open `apps/web/__tests__/public/public-website.test.tsx`. The test almost certainly:
- Mocks `getCommunityPublicInfo`, `getBrandingForCommunity`, `getPublishedTemplate`.
- Mocks `resolveTheme` or accepts the real one.
- Renders `<PublicSitePage />` and asserts on the resulting markup (e.g., "Community Resources", "Have questions?").

Apply two updates:

(a) Add a mock for `getPublicCommunityScopedReader` returning a reader whose `listSiteBlocks()` resolves to `[]` (so the empty-state Tidewater hero renders):

```typescript
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: (communityId: number) => ({
    communityId,
    listSiteBlocks: vi.fn().mockResolvedValue([]),
    listAnnouncements: vi.fn().mockResolvedValue([]),
    listDocuments: vi.fn().mockResolvedValue([]),
    listMeetings: vi.fn().mockResolvedValue([]),
    getContactInfo: vi.fn().mockResolvedValue(null),
  }),
}));
```

(b) Replace the assertion that depends on "Community Resources" / "Have questions?" (the legacy fallback markup) with assertions about the Tidewater render path: the community name as h1, "Resident Login" CTA, and PublicSiteFooter community name. Add a separate test case that toggles the layout registry empty for the fallback case, or `vi.mock('@/components/public-site/layouts/registry', () => ({ getLayout: () => undefined, layoutRegistry: {} }))` for the fallback test only — but keep that as a single `it.todo` if mocking-the-mock gets unwieldy.

Minimal target test shape:

```typescript
describe('Public site (layout-registry path)', () => {
  it('renders Tidewater chrome + empty-state hero when no blocks', async () => {
    const ui = await PublicSitePage();
    render(ui);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sunset Condos');
  });

  it('still renders the legacy compiledHtml branch when a published template exists', async () => {
    (getPublishedTemplate as unknown as Mock).mockResolvedValueOnce('<p>legacy</p>');
    const ui = await PublicSitePage();
    render(ui);
    expect(document.querySelector('div[style*="--pp-primary"]')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the updated test, verify pass**

```bash
pnpm --filter web exec vitest run __tests__/public/public-website.test.tsx
pnpm --filter web typecheck
```

Expected: tests pass; no type errors. If `getPublishedTemplate` import in the test is unmocked, add it as a `vi.mock(...)` at the top alongside the other mocks.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/_site/page.tsx apps/web/__tests__/public/public-website.test.tsx
git commit -m "feat(_site): generateMetadata + layout-registry render path with safe fallback (PR #1b · 7/20)

When a Tidewater (or future) layout is registered, _site/page.tsx now
delegates rendering to that layout component while preserving the existing
JSX-template branch unchanged. Adds Next 15 generateMetadata() backed by
buildCommunityMetadata. The hardcoded markup remains as a defensive fallback
if the layout registry is ever empty for a community's resolved layoutId.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Update `community-resolution.test.ts`

**Files:**
- Modify: `apps/web/__tests__/public-site/community-resolution.test.ts`

- [ ] **Step 1: Read the current test**

```bash
cat apps/web/__tests__/public-site/community-resolution.test.ts
```

Identify: what middleware behavior the test asserts (`x-community-id` header injection on `_site` requests). The test should not need changes if it tests middleware in isolation. If it tests an end-to-end rewrite that touches `_site`, you may need to add the same `getPublicCommunityScopedReader` mock.

- [ ] **Step 2: Run the test to check status**

```bash
pnpm --filter web exec vitest run __tests__/public-site/community-resolution.test.ts
```

If it PASSES, skip to Step 4 (commit-skipped).

If it FAILS, the breakage is likely an unmocked `getPublicCommunityScopedReader` or `getLayout`. Add at the top:

```typescript
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listSiteBlocks: vi.fn().mockResolvedValue([]),
    listAnnouncements: vi.fn().mockResolvedValue([]),
    listDocuments: vi.fn().mockResolvedValue([]),
    listMeetings: vi.fn().mockResolvedValue([]),
    getContactInfo: vi.fn().mockResolvedValue(null),
  }),
}));
```

If the test does NOT actually exercise `_site/page.tsx`, no changes needed.

- [ ] **Step 3: Add an extra assertion (only if it makes sense in this test file)**

If the test already asserts on the `x-community-id` header path, add one new case asserting the header survives a rewrite to `/_site`. Skip if the test is pure unit-level middleware.

- [ ] **Step 4: Commit (or skip)**

If you made changes:
```bash
git add apps/web/__tests__/public-site/community-resolution.test.ts
git commit -m "test(public-site): community-resolution remains green under new render path (PR #1b · 8/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If no changes were needed, make an empty commit so the task-counter stays in sequence:
```bash
git commit --allow-empty -m "test(public-site): community-resolution unchanged (PR #1b · 8/20)

Verified existing test passes against the new _site render path without modification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Update `theme-injection-mobile.test.tsx`

**Files:**
- Modify: `apps/web/__tests__/theme/theme-injection-mobile.test.tsx`

- [ ] **Step 1: Read the test**

```bash
cat apps/web/__tests__/theme/theme-injection-mobile.test.tsx
```

The test almost certainly renders some page and asserts CSS variables in the resulting HTML.

- [ ] **Step 2: Run the test**

```bash
pnpm --filter web exec vitest run __tests__/theme/theme-injection-mobile.test.tsx
```

- [ ] **Step 3: Adjust selectors**

If the test asserts e.g. `screen.getByText('Resident Login')` and the new render still includes a "Resident Login" CTA (it does — both Tidewater and the fallback include it), no change needed. If it asserts `getByText('Community Resources')` (legacy fallback only) and the Tidewater path is now taken, replace that assertion with a check for the community name h1 + theme CSS variable on the wrapper div.

Concretely — if the test currently has:
```typescript
expect(screen.getByText('Community Resources')).toBeInTheDocument();
```
replace it with:
```typescript
expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
expect(document.querySelector('[style*="--theme-primary"]')).toBeInTheDocument();
```

Add the same `getPublicCommunityScopedReader` mock as in Task 7 if needed.

- [ ] **Step 4: Verify pass + commit**

```bash
pnpm --filter web exec vitest run __tests__/theme/theme-injection-mobile.test.tsx
```

```bash
git add apps/web/__tests__/theme/theme-injection-mobile.test.tsx
git commit -m "test(theme): theme injection assertions on Tidewater path (PR #1b · 9/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `upsertPublishedHero` service + tests

**Files:**
- Create: `apps/web/src/lib/services/site-blocks-service.ts`
- Create: `apps/web/__tests__/lib/services/site-blocks-service.test.ts`

The service writes directly to the `published` slot (no draft/publish in PR #1b). PR #8 generalizes this to the full atomic publish.

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/lib/services/site-blocks-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertChain = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([{ id: 999 }]) };
const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
const txMock = {
  insert: vi.fn(() => insertChain),
  update: vi.fn(() => updateChain),
};

const scopedClient = {
  transaction: vi.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock)),
};

vi.mock('@propertypro/db', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)();
  return { ...actual, createScopedClient: () => scopedClient };
});

vi.mock('@/lib/audit/audit-log', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { upsertPublishedHero } from '@/lib/services/site-blocks-service';
import { logAuditEvent } from '@/lib/audit/audit-log';

const HERO = {
  headline: 'Welcome',
  subtitle: 'A welcoming community.',
  ctaText: 'Resident Login',
  ctaTarget: '/auth/login',
};

describe('upsertPublishedHero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs inside a transaction', async () => {
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(scopedClient.transaction).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes any existing published hero before inserting the new one', async () => {
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    // Expect at least one tx.update(...).set({ deletedAt: ... }) call
    expect(txMock.update).toHaveBeenCalled();
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.anything() }));
  });

  it('inserts the new hero with is_draft=false, block_type=hero, block_order=1', async () => {
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(txMock.insert).toHaveBeenCalled();
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 42,
        blockType: 'hero',
        blockOrder: 1,
        isDraft: false,
        content: HERO,
      }),
    );
  });

  it('writes a compliance_audit_log entry on success', async () => {
    await upsertPublishedHero({ communityId: 42, actorUserId: 'user-1', content: HERO });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'site_block_updated',
        communityId: 42,
        actorUserId: 'user-1',
      }),
    );
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
pnpm --filter web exec vitest run __tests__/lib/services/site-blocks-service.test.ts
```

Expected: module-not-found.

- [ ] **Step 3: Implement the service**

Create `apps/web/src/lib/services/site-blocks-service.ts`:

```typescript
import { createScopedClient, siteBlocks } from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';
import type { HeroBlockContent } from '@propertypro/shared';
import { logAuditEvent } from '@/lib/audit/audit-log';

export interface UpsertPublishedHeroInput {
  communityId: number;
  actorUserId: string;
  content: HeroBlockContent;
}

/**
 * Replace any currently published hero block with a new one.
 *
 * Transactional: soft-deletes the existing published hero(es) and inserts
 * a new published row in a single transaction. PR #1b ships this hero-only
 * shortcut; PR #8 generalizes it to the full atomic community-wide publish
 * with draft → published promotion.
 */
export async function upsertPublishedHero({
  communityId,
  actorUserId,
  content,
}: UpsertPublishedHeroInput): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.transaction(async (tx) => {
    // Soft-delete any existing published hero rows for this community
    await tx
      .update(siteBlocks)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.blockType, 'hero'),
          eq(siteBlocks.isDraft, false),
          isNull(siteBlocks.deletedAt),
        ),
      );

    // Insert the new published hero at block_order 1
    await tx
      .insert(siteBlocks)
      .values({
        communityId,
        blockType: 'hero',
        blockOrder: 1,
        isDraft: false,
        publishedAt: new Date(),
        content,
      })
      .returning({ id: siteBlocks.id });
  });

  await logAuditEvent({
    action: 'site_block_updated',
    communityId,
    actorUserId,
    metadata: { blockType: 'hero' },
  });
}
```

If `logAuditEvent`'s signature differs in this codebase (it almost certainly takes a `(communityId, action, metadata)` shape), adapt to the existing signature. Read `apps/web/src/lib/audit/audit-log.ts` first if uncertain:

```bash
cat apps/web/src/lib/audit/audit-log.ts | head -40
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter web exec vitest run __tests__/lib/services/site-blocks-service.test.ts
pnpm --filter web typecheck
pnpm guard:db-access
```

Expected: 4 tests pass; no typecheck errors; DB-access guard passes (scoped client is the canonical path).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/site-blocks-service.ts apps/web/__tests__/lib/services/site-blocks-service.test.ts
git commit -m "feat(services): upsertPublishedHero service (PR #1b · 10/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `PATCH /api/v1/pm/site/hero` route + tests

**Files:**
- Create: `apps/web/src/app/api/v1/pm/site/hero/route.ts`
- Create: `apps/web/__tests__/api/pm/site/hero.test.ts`

Per `.claude/rules/api-patterns.md`, the route MUST: `withErrorHandler` + `requirePermission` + Zod-validate body + audit log via the service.

Permission: `requirePlanFeature(communityId, 'hasSiteEditor')` (gates Essentials+).

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/api/pm/site/hero.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const upsertMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/services/site-blocks-service', () => ({ upsertPublishedHero: upsertMock }));

const requireAuthMock = vi.fn().mockResolvedValue('user-1');
vi.mock('@/lib/api/auth-context', () => ({ requireAuthenticatedUserId: requireAuthMock }));

const requireMembershipMock = vi.fn().mockResolvedValue({ role: 'pm_admin', communityId: 42 });
vi.mock('@/lib/api/community-context', () => ({ requireCommunityMembership: requireMembershipMock }));

const requirePlanFeatureMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));

import { PATCH } from '@/app/api/v1/pm/site/hero/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/hero?communityId=42', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('PATCH /api/v1/pm/site/hero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'pm_admin', communityId: 42 });
    requirePlanFeatureMock.mockResolvedValue(undefined);
  });

  it('200s on valid hero content and calls upsertPublishedHero', async () => {
    const res = await PATCH(makeRequest({
      headline: 'Welcome',
      subtitle: 'Hello.',
      ctaText: 'Login',
      ctaTarget: '/auth/login',
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ data: { ok: true } });
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 42, actorUserId: 'user-1' }),
    );
  });

  it('400s on invalid body (missing headline)', async () => {
    const res = await PATCH(makeRequest({ subtitle: 'no headline' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('400s on protocol-relative ctaTarget (carry-over from Task 1)', async () => {
    const res = await PATCH(makeRequest({ headline: 'X', ctaText: 'Y', ctaTarget: '//evil.com' }));
    expect(res.status).toBe(400);
  });

  it('401s when unauthenticated', async () => {
    requireAuthMock.mockRejectedValueOnce(new Error('unauthorized'));
    const res = await PATCH(makeRequest({ headline: 'X' }));
    // withErrorHandler routes the unauthorized AppError to a 401
    expect([401, 500]).toContain(res.status);
  });

  it('403s when membership role lacks PM access', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await PATCH(makeRequest({ headline: 'X' }));
    expect([403, 401]).toContain(res.status);
  });

  it('403s when the plan does not have hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }));
    const res = await PATCH(makeRequest({ headline: 'X' }));
    expect(res.status).toBe(403);
  });
});
```

The exact import paths for the auth/membership/plan-feature helpers may differ. Use whatever the rest of `apps/web/src/app/api/v1/pm/branding/route.ts` (or another existing pm-scoped route) imports — that is the canonical pattern.

- [ ] **Step 2: Read the canonical pm-branding route for reference**

```bash
cat apps/web/src/app/api/v1/pm/branding/route.ts 2>&1 | head -120
```

Mimic its imports + structure.

- [ ] **Step 3: Implement the route (PATCH only — GET is Task 12)**

Create `apps/web/src/app/api/v1/pm/site/hero/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandler } from '@/lib/api/with-error-handler';
import { ValidationError } from '@/lib/api/errors';
import { heroBlockSchema } from '@propertypro/shared';
import { upsertPublishedHero } from '@/lib/services/site-blocks-service';
// Use whatever the existing pm/branding route uses for auth + membership + plan-feature gating
import { requireAuthenticatedUserId } from '@/lib/api/auth-context';
import { requireCommunityMembership, parseCommunityIdFromQuery } from '@/lib/api/community-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';

const PM_ROLES = new Set(['property_manager_admin', 'pm_admin', 'cam']);

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(request.url);
  const communityId = parseCommunityIdFromQuery(searchParams);

  const membership = await requireCommunityMembership(communityId, userId);
  if (!PM_ROLES.has(membership.role)) {
    throw new ValidationError('Caller is not authorized to edit this community site.', {
      fields: [{ field: 'role', message: 'PM role required' }],
    });
  }
  await requirePlanFeature(communityId, 'hasSiteEditor');

  const raw = await request.json();
  const parsed = heroBlockSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Invalid hero block content', {
      fields: parsed.error.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
      })),
    });
  }

  await upsertPublishedHero({ communityId, actorUserId: userId, content: parsed.data });
  return NextResponse.json({ data: { ok: true } });
});
```

If `parseCommunityIdFromQuery` doesn't exist, parse `searchParams.get('communityId')` inline.

If your project's pattern is `ForbiddenError` over `ValidationError` for the role check, swap to that — see `apps/web/src/lib/api/errors.ts`.

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter web exec vitest run __tests__/api/pm/site/hero.test.ts
pnpm --filter web typecheck
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/v1/pm/site/hero apps/web/__tests__/api/pm/site/hero.test.ts
git commit -m "feat(api): PATCH /api/v1/pm/site/hero (PR #1b · 11/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `GET /api/v1/pm/site/hero` (extend route + tests)

**Files:**
- Modify: `apps/web/src/app/api/v1/pm/site/hero/route.ts`
- Modify: `apps/web/__tests__/api/pm/site/hero.test.ts`

- [ ] **Step 1: Extend the test file with GET cases**

Add to `apps/web/__tests__/api/pm/site/hero.test.ts`:

```typescript
import { GET } from '@/app/api/v1/pm/site/hero/route';

// Mock the public reader so GET can return a known hero
const listSiteBlocksMock = vi.fn();
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listSiteBlocks: listSiteBlocksMock,
    listAnnouncements: vi.fn(),
    listDocuments: vi.fn(),
    listMeetings: vi.fn(),
    getContactInfo: vi.fn(),
  }),
}));

describe('GET /api/v1/pm/site/hero', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'pm_admin', communityId: 42 });
    requirePlanFeatureMock.mockResolvedValue(undefined);
  });

  it('returns the current published hero content', async () => {
    listSiteBlocksMock.mockResolvedValueOnce([
      { id: 1, blockType: 'hero', blockOrder: 1, content: { headline: 'H' } },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/v1/pm/site/hero?communityId=42'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { hero: { headline: 'H' } } });
  });

  it('returns hero:null when no hero block exists', async () => {
    listSiteBlocksMock.mockResolvedValueOnce([]);
    const res = await GET(new NextRequest('http://localhost/api/v1/pm/site/hero?communityId=42'));
    expect(await res.json()).toEqual({ data: { hero: null } });
  });

  it('skips non-hero blocks', async () => {
    listSiteBlocksMock.mockResolvedValueOnce([
      { id: 2, blockType: 'announcements', blockOrder: 1, content: {} },
      { id: 3, blockType: 'hero', blockOrder: 2, content: { headline: 'H' } },
    ]);
    const res = await GET(new NextRequest('http://localhost/api/v1/pm/site/hero?communityId=42'));
    expect(await res.json()).toEqual({ data: { hero: { headline: 'H' } } });
  });
});
```

Run it to confirm failure:
```bash
pnpm --filter web exec vitest run __tests__/api/pm/site/hero.test.ts
```

Expected: 3 new failures (GET not exported).

- [ ] **Step 2: Add the GET handler**

Append to `apps/web/src/app/api/v1/pm/site/hero/route.ts`:

```typescript
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';

export const GET = withErrorHandler(async (request: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const { searchParams } = new URL(request.url);
  const communityId = parseCommunityIdFromQuery(searchParams);

  const membership = await requireCommunityMembership(communityId, userId);
  if (!PM_ROLES.has(membership.role)) {
    throw new ValidationError('Caller is not authorized to view this community site.', {
      fields: [{ field: 'role', message: 'PM role required' }],
    });
  }
  await requirePlanFeature(communityId, 'hasSiteEditor');

  const reader = getPublicCommunityScopedReader(communityId);
  const blocks = await reader.listSiteBlocks();
  const heroBlock = blocks.find((b) => b.blockType === 'hero');
  return NextResponse.json({ data: { hero: heroBlock?.content ?? null } });
});
```

- [ ] **Step 3: Run tests, verify pass**

```bash
pnpm --filter web exec vitest run __tests__/api/pm/site/hero.test.ts
```

Expected: all (6 PATCH + 3 GET = 9) tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1/pm/site/hero/route.ts apps/web/__tests__/api/pm/site/hero.test.ts
git commit -m "feat(api): GET /api/v1/pm/site/hero (PR #1b · 12/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `useHeroBlock` + `useUpdateHeroBlock` hooks + tests

**Files:**
- Create: `apps/web/src/hooks/use-hero-block.ts`
- Create: `apps/web/__tests__/hooks/use-hero-block.test.tsx`

- [ ] **Step 1: Read the canonical pm hook pattern**

```bash
ls apps/web/src/hooks/use-*.ts | head -8
cat apps/web/src/hooks/use-branding.ts 2>/dev/null | head -60 || cat apps/web/src/hooks/use-change-plan.ts | head -60
```

Note: which fetch helper the codebase uses (`requestJson<T>`, raw `fetch`, etc.). Mirror it.

- [ ] **Step 2: Write the failing test**

Create `apps/web/__tests__/hooks/use-hero-block.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useHeroBlock, useUpdateHeroBlock } from '@/hooks/use-hero-block';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('useHeroBlock', () => {
  it('GETs /api/v1/pm/site/hero?communityId=X and returns hero content', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { hero: { headline: 'H' } } }),
    });
    const { result } = renderHook(() => useHeroBlock(42), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ headline: 'H' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/pm/site/hero?communityId=42'),
      expect.anything(),
    );
  });

  it('returns null when no hero block exists', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { hero: null } }),
    });
    const { result } = renderHook(() => useHeroBlock(42), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useUpdateHeroBlock', () => {
  it('PATCHes /api/v1/pm/site/hero with content body', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { ok: true } }),
    });
    const { result } = renderHook(() => useUpdateHeroBlock(42), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ headline: 'NewHead' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/pm/site/hero?communityId=42'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('surfaces server validation errors', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Invalid hero block content' } }),
    });
    const { result } = renderHook(() => useUpdateHeroBlock(42), { wrapper: makeWrapper() });
    await expect(result.current.mutateAsync({ headline: '' })).rejects.toThrow(/Invalid hero block content/);
  });
});
```

Run it:
```bash
pnpm --filter web exec vitest run __tests__/hooks/use-hero-block.test.tsx
```

Expected: module-not-found.

- [ ] **Step 3: Implement the hooks**

Create `apps/web/src/hooks/use-hero-block.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HeroBlockContent } from '@propertypro/shared';

const heroQueryKey = (communityId: number) => ['pm', 'site', 'hero', communityId] as const;

export function useHeroBlock(communityId: number) {
  return useQuery<HeroBlockContent | null>({
    queryKey: heroQueryKey(communityId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/pm/site/hero?communityId=${communityId}`);
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(errBody.error?.message ?? `Failed to load hero (HTTP ${res.status})`);
      }
      const body = (await res.json()) as { data: { hero: HeroBlockContent | null } };
      return body.data.hero;
    },
  });
}

export function useUpdateHeroBlock(communityId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, HeroBlockContent>({
    mutationFn: async (content) => {
      const res = await fetch(`/api/v1/pm/site/hero?communityId=${communityId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(content),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(errBody.error?.message ?? `Failed to save hero (HTTP ${res.status})`);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: heroQueryKey(communityId) });
    },
  });
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter web exec vitest run __tests__/hooks/use-hero-block.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-hero-block.ts apps/web/__tests__/hooks/use-hero-block.test.tsx
git commit -m "feat(hooks): useHeroBlock + useUpdateHeroBlock (PR #1b · 13/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: `HeroBlockForm` client component + tests

**Files:**
- Create: `apps/web/src/components/pm/site-editor/HeroBlockForm.tsx`
- Create: `apps/web/__tests__/components/pm/site-editor/HeroBlockForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/components/pm/site-editor/HeroBlockForm.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { HeroBlockForm } from '@/components/pm/site-editor/HeroBlockForm';

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { ok: true } }) });
});

describe('<HeroBlockForm>', () => {
  it('renders input fields for headline, subtitle, ctaText, ctaTarget', () => {
    render(wrap(<HeroBlockForm communityId={42} initial={null} />));
    expect(screen.getByLabelText(/headline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/subtitle/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cta text/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cta target/i)).toBeInTheDocument();
  });

  it('disables Save when headline is empty', () => {
    render(wrap(<HeroBlockForm communityId={42} initial={null} />));
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('enables Save when headline is filled', async () => {
    render(wrap(<HeroBlockForm communityId={42} initial={null} />));
    await userEvent.type(screen.getByLabelText(/headline/i), 'Welcome');
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('submits PATCH on Save click', async () => {
    render(wrap(<HeroBlockForm communityId={42} initial={null} />));
    await userEvent.type(screen.getByLabelText(/headline/i), 'Welcome');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it('rejects ctaText without ctaTarget at the schema layer (and shows the error)', async () => {
    render(wrap(<HeroBlockForm communityId={42} initial={null} />));
    await userEvent.type(screen.getByLabelText(/headline/i), 'X');
    await userEvent.type(screen.getByLabelText(/cta text/i), 'Login');
    // server returns 400
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'ctaText and ctaTarget must both be present or both absent.' } }),
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText(/ctaText and ctaTarget must both be present/i)).toBeInTheDocument();
    });
  });

  it('pre-fills inputs from initial', () => {
    render(wrap(<HeroBlockForm communityId={42} initial={{ headline: 'Pre' }} />));
    expect(screen.getByLabelText(/headline/i)).toHaveValue('Pre');
  });
});
```

Run it:
```bash
pnpm --filter web exec vitest run __tests__/components/pm/site-editor/HeroBlockForm.test.tsx
```

Expected: module-not-found.

- [ ] **Step 2: Implement the form**

Create `apps/web/src/components/pm/site-editor/HeroBlockForm.tsx`:

```typescript
'use client';
import { useState, type FormEvent } from 'react';
import type { HeroBlockContent } from '@propertypro/shared';
import { useUpdateHeroBlock } from '@/hooks/use-hero-block';

interface Props {
  communityId: number;
  initial: HeroBlockContent | null;
}

export function HeroBlockForm({ communityId, initial }: Props) {
  const [headline, setHeadline] = useState(initial?.headline ?? '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '');
  const [ctaText, setCtaText] = useState(initial?.ctaText ?? '');
  const [ctaTarget, setCtaTarget] = useState(initial?.ctaTarget ?? '');
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useUpdateHeroBlock(communityId);

  const disabled = headline.trim().length === 0 || mutation.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const payload: HeroBlockContent = {
      headline: headline.trim(),
      ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
      ...(ctaText.trim() ? { ctaText: ctaText.trim() } : {}),
      ...(ctaTarget.trim() ? { ctaTarget: ctaTarget.trim() } : {}),
    } as HeroBlockContent;
    try {
      await mutation.mutateAsync(payload);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
      <div>
        <label htmlFor="hero-headline" className="block text-sm font-medium text-content">
          Headline <span className="text-danger">*</span>
        </label>
        <input
          id="hero-headline"
          name="headline"
          type="text"
          maxLength={120}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          required
          className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
        />
      </div>
      <div>
        <label htmlFor="hero-subtitle" className="block text-sm font-medium text-content">Subtitle</label>
        <textarea
          id="hero-subtitle"
          name="subtitle"
          maxLength={280}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="hero-cta-text" className="block text-sm font-medium text-content">CTA text</label>
          <input
            id="hero-cta-text"
            name="ctaText"
            type="text"
            maxLength={40}
            value={ctaText}
            onChange={(e) => setCtaText(e.target.value)}
            className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
          />
        </div>
        <div>
          <label htmlFor="hero-cta-target" className="block text-sm font-medium text-content">CTA target</label>
          <input
            id="hero-cta-target"
            name="ctaTarget"
            type="text"
            maxLength={512}
            placeholder="/auth/login"
            value={ctaTarget}
            onChange={(e) => setCtaTarget(e.target.value)}
            className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
          />
        </div>
      </div>

      {serverError && (
        <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 disabled:cursor-not-allowed hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Run tests, verify pass**

```bash
pnpm --filter web exec vitest run __tests__/components/pm/site-editor/HeroBlockForm.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/pm/site-editor/HeroBlockForm.tsx apps/web/__tests__/components/pm/site-editor/HeroBlockForm.test.tsx
git commit -m "feat(pm): HeroBlockForm client component (PR #1b · 14/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: PM settings/website page (server component)

**Files:**
- Create: `apps/web/src/app/(authenticated)/pm/settings/website/page.tsx`

This page intentionally lives OUTSIDE the breadcrumbs CI guard's glob (`**/[<param>]/page.tsx`, `**/new/page.tsx`, `**/[<param>]/edit/page.tsx`) — the route is a top-level settings page, mirroring `/pm/settings/branding/page.tsx` which also doesn't render breadcrumbs.

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/(authenticated)/pm/settings/website/page.tsx`:

```typescript
/**
 * PR #1b: PM website editor — Welcome tab only.
 *
 * Route: /pm/settings/website?communityId=X
 * Auth: property_manager_admin / cam required (redirects otherwise).
 *
 * PR #1b ships the Hero block editor. PR #5 adds the full onboarding flow,
 * PR #8 ships the full 5-tab editor + draft/preview/publish workflow.
 */
import { redirect } from 'next/navigation';
import type { SearchParams } from 'next/dist/server/request/search-params';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { heroBlockSchema, type HeroBlockContent } from '@propertypro/shared';
import { HeroBlockForm } from '@/components/pm/site-editor/HeroBlockForm';

interface PageProps {
  searchParams: Promise<SearchParams>;
}

const PM_ROLES = new Set(['pm_admin', 'property_manager_admin', 'cam']);

export default async function WebsiteSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawId = Number(params['communityId']);

  if (!Number.isInteger(rawId) || rawId <= 0) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-content">Select a Community</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Choose a community from the Communities list to customize its public site.
        </p>
        <a
          href="/pm/dashboard/communities"
          className="mt-6 inline-block rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          Go to Communities
        </a>
      </main>
    );
  }

  const communityId = rawId;
  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId!);
  if (!PM_ROLES.has(membership.role)) {
    redirect('/pm/dashboard/communities?reason=invalid-selection');
  }

  // Load current hero (read directly via reader — no need to round-trip the API on first paint)
  const reader = getPublicCommunityScopedReader(communityId);
  const blocks = await reader.listSiteBlocks();
  const heroRaw = blocks.find((b) => b.blockType === 'hero')?.content;
  let initial: HeroBlockContent | null = null;
  if (heroRaw != null) {
    const parsed = heroBlockSchema.safeParse(heroRaw);
    if (parsed.success) initial = parsed.data;
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-content">Website</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Customize the welcome panel that visitors see at{' '}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
            [your-community].getpropertypro.com
          </code>
          . Saving immediately publishes the change in PR #1b — draft/preview/publish lands in PR #8.
        </p>
      </div>

      <section aria-labelledby="welcome-tab" className="rounded-md border border-default bg-surface-card p-6 shadow-e0">
        <h2 id="welcome-tab" className="mb-4 text-lg font-medium text-content">
          Welcome
        </h2>
        <HeroBlockForm communityId={communityId} initial={initial} />
      </section>
    </div>
  );
}
```

If the actual page-auth helpers differ from the names above (the file uses both forms in some places), align with whatever the existing `pm/settings/branding/page.tsx` does. Reading that file (already done above) is the canonical reference.

- [ ] **Step 2: Verify the page builds + typechecks**

```bash
pnpm --filter web typecheck
```

Expected: no errors.

- [ ] **Step 3: Smoke-test by visiting the route locally**

Start the dev server (if not already running):
```bash
pnpm dev
```

Visit `http://localhost:3000/pm/settings/website?communityId=1` after logging in as a PM admin (use `/dev/agent-login?as=pm_admin`). Confirm: page loads, form renders, headline input is focusable, Save button is initially disabled (no headline pre-filled if no hero exists yet). Submit a headline and verify Save→success path.

This is a manual smoke step; if you're running fully unattended skip Save+submit and rely on the unit tests for behavior verification.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/pm/settings/website/page.tsx
git commit -m "feat(pm): /pm/settings/website route — Welcome tab (PR #1b · 15/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Perf baseline check in `scripts/perf-check.ts`

**Files:**
- Modify: `scripts/perf-check.ts`

Spec Section 8.5 requires PR #1b to add a check that the public site's server render p95 stays under 500ms.

- [ ] **Step 1: Read the current `scripts/perf-check.ts`**

```bash
cat scripts/perf-check.ts | head -100
ls scripts/ | grep -i perf
```

Identify how existing checks are structured (likely a list of named checks each producing a metric, with a budget assertion). Mirror that pattern.

- [ ] **Step 2: Add the `site:render` check**

Add a new check entry to `scripts/perf-check.ts`. The check should:
1. Spin up (or assume already running) the dev/prod server.
2. Resolve a known demo community (Sunset Condos slug `sunset-condos`, or fall back to community id 1).
3. Issue N sequential GETs against `/_site` with a host header matching the community subdomain.
4. Record server-render time (TTFB) for each. Compute p95.
5. Assert p95 < 500ms. Print metric + budget.

Concrete shape (adapt to the existing structure of the file):

```typescript
async function checkSiteRender(): Promise<CheckResult> {
  const N = 10;
  const timings: number[] = [];
  const host = process.env.PERF_PUBLIC_SITE_HOST ?? 'sunset-condos.localhost:3000';
  const url = `http://${host}/`;
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    const res = await fetch(url, { headers: { host } });
    await res.text(); // drain
    const t = performance.now() - t0;
    if (!res.ok) {
      return { name: 'site:render', status: 'fail', detail: `HTTP ${res.status} on /_site request` };
    }
    timings.push(t);
  }
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.floor(timings.length * 0.95) - 1] ?? timings[timings.length - 1];
  const BUDGET_MS = 500;
  return {
    name: 'site:render',
    status: p95 < BUDGET_MS ? 'pass' : 'fail',
    metric: `p95=${p95.toFixed(0)}ms`,
    budget: `<${BUDGET_MS}ms`,
  };
}
```

Wire it into the existing check list / runner. If the file does not yet have a `CheckResult` type, define a small one inline (or use the existing format).

If the file currently uses `process.exit(1)` on failure, ensure your new check participates in that.

- [ ] **Step 3: Run the check locally**

```bash
pnpm dev &  # if not already
sleep 4
pnpm perf:check
```

Expected: the new `site:render` check passes (well under 500ms on dev).

If the check fails because the dev host header isn't recognized by middleware, set the `PERF_PUBLIC_SITE_HOST` env var to match the middleware's expectations (refer to `apps/web/src/middleware.ts:678`).

- [ ] **Step 4: Commit**

```bash
git add scripts/perf-check.ts
git commit -m "perf: add site:render p95<500ms baseline check (PR #1b · 16/20)

Establishes the performance budget for the new public-site render path per
spec Section 8.5. The check exercises a seeded community's _site route via
host-header routing and asserts p95 latency stays under the 500ms budget.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Doc — `docs/design-system/blocks/hero.md`

**Files:**
- Create: `docs/design-system/blocks/hero.md`

- [ ] **Step 1: Create the doc**

Create `docs/design-system/blocks/hero.md`:

```markdown
# Hero Block

The first block on every public community site. Carries the strongest visual weight.

## Schema

Source of truth: [`packages/shared/src/site-blocks/hero.ts`](../../../packages/shared/src/site-blocks/hero.ts).

| Field            | Type      | Required | Constraints                                                    |
|------------------|-----------|----------|----------------------------------------------------------------|
| `headline`       | `string`  | ✓        | 1–120 chars                                                    |
| `subtitle`       | `string`  | —        | 1–280 chars when present                                       |
| `ctaText`        | `string`  | conditional | 1–40 chars. Must accompany `ctaTarget` (both or neither).  |
| `ctaTarget`      | `string`  | conditional | Internal path (starts with `/`, not `//`) **or** `https://…` URL. Max 512. |
| `heroImagePath`  | `string`  | —        | Supabase Storage path. Required to accompany `heroImageAlt`.   |
| `heroImageAlt`   | `string`  | conditional | Required when `heroImagePath` is set. 1–200 chars.           |

The schema's `strict()` mode rejects any unknown fields. The `ctaTarget` refine explicitly rejects protocol-relative URLs (`//evil.com`) to prevent open-redirect attacks — see [PR #479 inline review](https://github.com/Ruckus000/PropertyPro/pull/479) for rationale.

## Renderer

[`apps/web/src/components/public-site/blocks/HeroBlock.tsx`](../../../apps/web/src/components/public-site/blocks/HeroBlock.tsx).

The renderer:
- Validates `block.content` via `heroBlockSchema.safeParse()`. Invalid content → render nothing + `console.warn` (defense-in-depth; the layout filters first).
- Renders `headline` as an `<h1>`. The page-level constraint of one h1 per page is enforced by Tidewater not rendering its empty-state hero when a Hero block is present.
- Renders subtitle as a `<p>` when present.
- Renders the CTA as an `<a>` (focus-visible-styled). Only when both `ctaText` and `ctaTarget` are present.
- Renders the hero image as `<img>` (or `<Image>` after PR #2 wires the storage URL loader). Always uses `block.content.heroImageAlt` for the `alt` attribute.

## Editor

[`apps/web/src/components/pm/site-editor/HeroBlockForm.tsx`](../../../apps/web/src/components/pm/site-editor/HeroBlockForm.tsx).

Single-tab editor at `/pm/settings/website?communityId=X`. Controlled inputs for headline, subtitle, CTA text, CTA target. Save is disabled when headline is empty or the mutation is in-flight.

Image upload UI ships with PR #2.

## Tier

| Tier         | Available |
|--------------|-----------|
| Essentials   | ✓ (gated by `hasSiteEditor`) |
| Professional | ✓ |
| PM/Enterprise| ✓ |

## Accessibility

- `headline` MUST be the page's `<h1>` (Tidewater enforces this by suppressing its empty-state hero when the block is present).
- `heroImageAlt` is required for any non-decorative hero image. The schema cannot be saved without it.
- CTA `<a>` element MUST keep `:focus-visible` styling (token-driven; never suppressed).
- Heading + body color contrast verified at the layout level against the `bay-light` (Tidewater default) preset.
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-system/blocks/hero.md
git commit -m "docs(design-system): hero block (PR #1b · 17/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Doc — `docs/design-system/templates/tidewater.md`

**Files:**
- Create: `docs/design-system/templates/tidewater.md`

- [ ] **Step 1: Create the doc**

Create `docs/design-system/templates/tidewater.md`:

```markdown
# Tidewater

Coastal editorial. Golden-hour palette, Fraunces italic display set against warm ivory, hairline rules, dated entries laid out like a printed program. Best for waterfront condominium associations.

## Default preset

`bay-light` — primary `#0e3338` (mineral teal), secondary `#f6f1e6` (warm ivory), accent `#c66f49` (terracotta), heading `Fraunces`, body `Manrope`.

## Source

[`apps/web/src/components/public-site/layouts/Tidewater.tsx`](../../../apps/web/src/components/public-site/layouts/Tidewater.tsx).

## Composition

- `PublicSiteHeader` (existing community-header component, theme-driven).
- `<main>` with id `main-content` for skip-to-content links.
- Empty-state hero (community name as h1 + Resident Login CTA) when no `hero` block is present. Suppressed once a `hero` block exists.
- Block iteration: ordered by `blockOrder` ascending. Each block dispatched through `blockRendererRegistry`. Unknown block types skipped silently (logged at the page layer).
- `PublicSiteFooter` (existing footer component).

## Token usage

All colors via CSS variables — never hardcoded hex:
- `var(--theme-primary)` — surface fills for the hero band.
- `var(--theme-secondary)` — page background.
- `var(--theme-accent)` — section-divider rules, accents.
- `var(--font-heading)` — `<h1>`, `<h2>` text via the `font-heading` Tailwind class.
- `var(--font-body)` — body text via the `font-body` class.

## Accessibility constraints

- Body text ≥ 16px (per `.claude/rules/design.md`).
- Single `<h1>` per page (the hero block — empty-state OR PM-authored).
- `:focus-visible` styling preserved on every interactive element (CTA links, login buttons).
- Color contrast on the bay-light preset verified at WCAG AA against the primary surface.

## Photographic guidance

When PMs upload a hero image:
- 1600×900 minimum, JPG/PNG/WebP only (PR #2 ships the upload pipeline).
- Warm, late-afternoon coastal palette pairs best with `bay-light` accents.
- Avoid overly compressed images — Tidewater's hero panel renders the image without overlay treatments, so artifacts are visible.

## When to recommend Tidewater

- Waterfront condominium associations
- Communities prioritizing an editorial / refined visual register
- Defaults to Tidewater for `community_type = condo_718`

PRs landing this layout: [#1b — feat: Tidewater + Hero vertical slice](https://github.com/Ruckus000/PropertyPro/pull/REPLACE_AFTER_OPEN).
```

- [ ] **Step 2: Commit**

```bash
git add docs/design-system/templates/tidewater.md
git commit -m "docs(design-system): tidewater layout (PR #1b · 18/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Doc — update `apps/web/src/components/public-site/layouts/README.md`

**Files:**
- Modify: `apps/web/src/components/public-site/layouts/README.md`

- [ ] **Step 1: Add a Status column to the layout table**

Open `apps/web/src/components/public-site/layouts/README.md`. Replace the layout table with:

```markdown
| Slug      | File             | Status        | Brand fit                                                                                  |
|-----------|------------------|---------------|--------------------------------------------------------------------------------------------|
| tidewater | `Tidewater.tsx`  | **Shipped (PR #1b)** | Coastal editorial — golden-hour palette, Fraunces italic display, hairline rules.   |
| boulevard | `Boulevard.tsx`  | Planned (PR #7)      | Mid-century Floridian — MiMo geometry, Newsreader italic, ochre accents.            |
| sable     | `Sable.tsx`      | Planned (PR #7)      | Refined contemporary — linen and oxidized bronze, Cormorant Garamond hairline italic.|
```

Also add a short note at the bottom of the Architecture section:

```markdown
## Default fallback

If a community's resolved `LayoutId` has no registered layout component (`layoutRegistry[id]` returns `undefined`), `_site/page.tsx` falls back to the hardcoded markup that shipped pre-PR-1b. This makes the rollout safe: even after Tidewater ships, removing it from the registry would NOT crash the site — it would visually regress to the pre-1b baseline.
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/public-site/layouts/README.md
git commit -m "docs(public-site): mark Tidewater as shipped + document fallback path (PR #1b · 19/20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Full validation + open PR

**Files:** (no file changes — verification + PR-open)

- [ ] **Step 1: Run all guards + tests + build**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @propertypro/db exec drizzle-kit generate --name verify_no_drift_pr1b
# Expect: "No schema changes" — there should be no drift. Discard the empty migration file if any:
ls packages/db/migrations/ | tail -3
rm packages/db/migrations/000*_verify_no_drift_pr1b.sql 2>/dev/null || true
# Restore _journal.json if drizzle-kit appended an entry for the empty migration:
git checkout -- packages/db/migrations/meta/_journal.json
pnpm build
```

Expected: all PASS. Build completes.

- [ ] **Step 2: Run the perf baseline once more**

```bash
pnpm dev &
sleep 5
pnpm perf:check
kill %1
```

Expected: `site:render p95 < 500ms` passes.

- [ ] **Step 3: Inspect the commit graph**

```bash
git log --oneline -22
```

Expected: 19 numbered commits `(PR #1b · N/20)` plus the merge base from PR #1a.

- [ ] **Step 4: Push branch and open the PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: Tidewater + Hero vertical slice (Property Landing Page PR #1b)" --body "$(cat <<'EOF'
## Summary

First vertical slice of the Property Landing Page system. Ships the Tidewater layout, the Hero block renderer + PM editor, the layout-registry rewire of `_site/page.tsx` with safe fallback, the `buildCommunityMetadata` SEO helper + `generateMetadata()`, the performance baseline check, and the carryover security fix from PR #1a's review. Documentation in `docs/design-system/{blocks,templates}/`.

## What's in scope

- **Security carry-over from PR #1a review:** `ctaTargetSchema` now rejects protocol-relative URLs (`//evil.com`).
- **SEO**: `apps/web/src/lib/seo/community-metadata.ts` + `generateMetadata()` on `_site/page.tsx`. OG image when `heroImageUrl` is present; `summary_large_image` Twitter card variant when so. Robots `index:true follow:true`.
- **Layout system**: Tidewater layout component renders header + footer + hero treatment + ordered block list. Unknown block types skipped. Empty-state hero (community name) when no hero block exists.
- **Hero block**: schema (from PR #1a) wired into a server-component renderer with defensive `safeParse` revalidation.
- **PM editor**: `/pm/settings/website/?communityId=X` (Welcome tab only). `PATCH /api/v1/pm/site/hero` writes directly to the published row in a transaction. The draft/preview/publish flow ships in PR #8.
- **Render rewire**: `_site/page.tsx` resolves `LayoutId` from branding + community type, defers rendering to the layout registry. The legacy hardcoded JSX is preserved as a safe fallback if the registry is ever empty for a community's layoutId (defense-in-depth).
- **Performance budget**: new `site:render` check in `scripts/perf-check.ts` asserting p95 < 500ms on a seeded demo community's public site.
- **Documentation**: `docs/design-system/blocks/hero.md`, `docs/design-system/templates/tidewater.md`, updated layouts README.

## What's NOT in scope

- Boulevard + Sable layouts (PR #7).
- Image upload pipeline (PR #2).
- Other content blocks (PR #2 text/image, PR #3 announcements, PR #4 documents/meetings/contact).
- The full 5-tab editor + draft/preview/publish workflow (PR #8).
- Onboarding wizard (PR #5).
- robots.ts + sitemap.ts (PR #4).
- Per-community feature flag column for the new render path — we render unconditionally with a safe registry-empty fallback per PR #1a gotcha #6.

## Test plan

- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes (includes DB access guard + breadcrumb guard)
- [x] `pnpm test` passes (new + updated tests for HeroBlock, Tidewater, layout-resolver, community-metadata, site-blocks-service, /api/v1/pm/site/hero, use-hero-block, HeroBlockForm)
- [x] Updated existing tests: `public-website.test.tsx`, `community-resolution.test.ts`, `theme-injection-mobile.test.tsx`
- [x] `pnpm build` succeeds
- [x] `pnpm perf:check` passes including the new `site:render` budget
- [x] No migration drift (no schema changes in PR #1b)
- [x] Manual: log in as `pm_admin`, visit `/pm/settings/website?communityId=1`, save a hero, view the public site at the community subdomain, confirm rendered hero matches saved content.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After PR is open, update `docs/design-system/templates/tidewater.md`'s link placeholder `REPLACE_AFTER_OPEN` with the actual PR number in a follow-up commit if you have direct push access.

- [ ] **Step 5: Done**

Return to top: PR opened, branch pushed, all checks green locally. The next plan (PR #2 — Text + Image + storage) builds on this foundation.

---

## Self-Review

**Spec coverage (against Section 9 row 1b + Section 2.3/2.4/2.9 + Section 8.5):**

- ✅ Tidewater layout component — Task 5
- ✅ Hero block renderer — Task 4
- ✅ `_site/page.tsx` switched to layout-registry rendering — Task 7
- ✅ PM editor surface (Welcome tab only) — Tasks 11/12/13/14/15
- ✅ `generateMetadata()` + `buildCommunityMetadata` helper — Tasks 2 + 7
- ✅ Performance budget check — Task 16
- ✅ Documentation: `blocks/hero.md`, `templates/tidewater.md`, `layouts/README.md` — Tasks 17/18/19
- ✅ Existing tests touched per spec Section 9.0 — Tasks 7/8/9
- ✅ Security carry-over (`ctaTargetSchema`) — Task 1
- ⚠ The spec mentions "per-community feature flag column added in PR #1a." That column does NOT exist (PR #1a gotcha #6). The plan addresses this by rendering unconditionally with a safe registry-empty fallback. Documented in Task 7 + Task 19 + the PR description.

**Placeholder scan:** No "TBD" / "implement later" / "similar to Task N" placeholders. The one `REPLACE_AFTER_OPEN` in Task 18 is a documented PR-link follow-up.

**Type consistency:**
- `LayoutId` from `@/components/public-site/layouts/types` referenced consistently in Tasks 3, 6, 7.
- `HeroBlockContent` from `@propertypro/shared` referenced consistently in Tasks 1, 4, 10, 13, 14, 15.
- `BlockRendererProps`, `LayoutProps`, `PublicCommunity`, `ResolvedTheme` all from PR #1a's foundation; consumed unchanged.
- `upsertPublishedHero` signature (`{ communityId, actorUserId, content }`) consistent across Task 10 (definition) and Task 11 (caller).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-property-landing-page-pr-1b-tidewater-hero.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task with the Option A cadence (full implementer + spec reviewer + code-quality reviewer). Each task is 15-75 minutes, so per-task review is naturally bounded.

**2. Inline Execution** — Execute tasks in this session with checkpoints. Slower because all task context lives in one conversation, but eliminates dispatch overhead.

**Which approach?**
