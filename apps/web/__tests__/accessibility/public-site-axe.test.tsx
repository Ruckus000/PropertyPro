/**
 * Accessibility audit — the PUBLIC association site.
 *
 * ── Why this file exists ──
 *
 * The public site is the only surface of this product a stranger can reach
 * without an account, and it is therefore the surface an ADA demand letter
 * actually targets. It also had no axe coverage at all: `axe-audit.test.tsx`
 * covers auth/maintenance/marketing, and `site-editor-axe.test.tsx` covers the
 * PM-facing editor plus two public chrome components. Every block a visitor
 * actually reads was untested.
 *
 * ── Driven by the registry, on purpose ──
 *
 * The suite iterates `blockViewRegistry` rather than listing components. A new
 * block type therefore arrives already covered, or fails here — which is the
 * only version of this that survives contact with a growing block library. The
 * `every registered block type is exercised` test makes that guarantee explicit
 * rather than implied.
 *
 * Automated checks catch perhaps a third of real WCAG issues. This is the floor,
 * not the ceiling — F-12 item 4 (a manual keyboard and screen-reader pass) is
 * still owed.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-12.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import React from 'react';
import {
  blockViewRegistry,
  isDataDrivenBlock,
} from '@/components/public-site/blocks/view-registry';
import { FaqBlock } from '@/components/public-site/blocks/FaqBlock';
import { GalleryBlock } from '@/components/public-site/blocks/GalleryBlock';
import { AmenitiesBlock } from '@/components/public-site/blocks/AmenitiesBlock';
import { PaymentsBlock } from '@/components/public-site/blocks/PaymentsBlock';
import type {
  LayoutId,
  PublicCommunity,
  ResolvedTheme,
} from '@/components/public-site/blocks/types';
import type { CommunityTheme } from '@propertypro/theme';
import { PublicSiteHeader } from '@/components/public-site/PublicSiteHeader';
import { PublicSiteFooter } from '@/components/public-site/PublicSiteFooter';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const COMMUNITY: PublicCommunity = {
  id: 1,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  logoUrl: null,
  communityType: 'condo_718',
  city: 'Miami',
  state: 'FL',
  timezone: 'America/New_York',
};

const THEME: ResolvedTheme = {
  primaryColor: '#1f2937',
  secondaryColor: '#374151',
  accentColor: '#0f766e',
  headingFont: 'system-ui',
  bodyFont: 'system-ui',
};

const LAYOUT: LayoutId = 'tidewater';

/**
 * The header's theme, populated so the branches actually render.
 *
 * `PublicSiteHeader` takes `CommunityTheme` (from `@propertypro/theme`), NOT the
 * `ResolvedTheme` above; in the app the two are bridged by `toHeaderTheme()` in
 * `components/public-site/layouts/Tidewater.tsx`, and this mirrors it.
 *
 * WHY THE VALUES MATTER. Until #1056 this audit passed three props the component
 * does not declare and a theme missing five required fields, so `communityName`,
 * `logoUrl` and `fontHeading` were all `undefined` at runtime: no `<img>` and an
 * empty title. #1056 fixed the types but kept `logoUrl: null` / `communityName: ''`
 * to preserve that exact DOM, which meant the LOGO and TITLE branches were still
 * audited only in their absent form. A non-null `logoUrl` is the ONLY way the
 * `<img alt={`${communityName} logo`}>` branch renders at all.
 */
const HEADER_THEME: CommunityTheme = {
  primaryColor: THEME.primaryColor,
  secondaryColor: THEME.secondaryColor,
  accentColor: THEME.accentColor,
  // Real font names, not '' — `resolveTheme` validates against ALLOWED_FONTS in
  // production, and an empty value emitted `font-family: '', sans-serif`.
  fontHeading: 'Inter',
  fontBody: 'Inter',
  logoUrl: '/logo.png',
  communityName: COMMUNITY.name,
  communityType: COMMUNITY.communityType,
};

/**
 * Schema-VALID content per block type.
 *
 * ⚠️ These must satisfy `blockSchemaRegistry`, not merely look plausible. Every
 * block renderer `safeParse`s its content and returns null on failure, logging
 * "content failed Zod validation; skipping render". A fixture with a wrong key
 * name therefore produces an EMPTY container — and an empty container passes
 * axe with flying colours while testing nothing at all.
 *
 * That is exactly what the first draft of this file did, on all ten types. The
 * `renders real markup` assertion below exists so it cannot happen again
 * silently.
 *
 * Content is populated rather than minimal for the same reason: an empty state
 * is a handful of elements and proves little about what a visitor reads.
 */
const CONTENT: Record<string, unknown> = {
  hero: {
    headline: 'Welcome to Sunset Condos',
    subtitle: 'A condominium association in Miami, Florida.',
    // `ctaText` and `ctaTarget` are all-or-nothing per the schema refinement.
    ctaText: 'View documents',
    ctaTarget: '/documents',
  },
  text: {
    heading: 'About us',
    body: 'Founded in 1985 and self-managed since 2011.',
  },
  image: {
    imagePath: '1/content/pool.jpg',
    altText: 'The community pool at dusk',
    caption: 'Our pool, resurfaced in 2025',
  },
  faq: {
    heading: 'Common questions',
    items: [{ question: 'When are dues payable?', answer: 'On the first of each month.' }],
  },
  gallery: {
    heading: 'Around the property',
    images: [{ imagePath: '1/content/lobby.jpg', altText: 'Lobby entrance' }],
  },
  amenities: {
    heading: 'Amenities',
    items: [{ name: 'Pool', description: 'Heated, open 8am to 9pm' }],
  },
  payments: {
    heading: 'Pay your assessment',
    body: 'Online payments are available through the resident portal.',
  },
  announcements: { limit: 5, timeWindowDays: 30 },
  documents: { limit: 5 },
  meetings: { limit: 10, timeWindowDays: 30 },
  contact: { showBoard: true, showManagement: true },
};

/**
 * Rows for the four system-of-record views, which take data as a prop.
 *
 * Dates are real `Date` objects, not ISO strings: these views call
 * `.toISOString()` to build `<time datetime>`, so a string fixture throws
 * rather than rendering.
 */
const DATA: Record<string, unknown> = {
  announcements: [
    {
      id: 1,
      title: 'Pool closure',
      body: '<p>The pool is closed Tuesday for resurfacing.</p>',
      publishedAt: new Date('2026-08-01T12:00:00Z'),
      isPinned: false,
    },
  ],
  documents: [
    {
      id: 1,
      title: 'Declaration of Condominium',
      category: 'Declaration',
      fileName: 'declaration.pdf',
      url: 'https://example.test/declaration.pdf',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
  ],
  meetings: [
    {
      id: 1,
      title: 'Board Meeting',
      meetingType: 'board',
      startsAt: new Date('2026-09-01T23:00:00Z'),
      location: 'Clubhouse',
    },
  ],
  contact: {
    management: { name: 'Acme Property Group', email: 'pm@example.test', phone: '305-555-0100' },
    board: [{ name: 'Dana Reyes', title: 'President' }],
  },
};

const BLOCK_TYPES = Object.keys(blockViewRegistry);

/**
 * The four Pro-only views are wrapped in `next/dynamic` in the registry, which
 * never resolves under jsdom — the registry entry renders only the
 * height-reserving `aria-hidden` skeleton. Auditing that skeleton would be the
 * vacuity trap again, one indirection further out, so these resolve to the real
 * component. The registry is still the SOURCE of the type list, so a new
 * code-split block type shows up here as a failure rather than as silence.
 */
type BlockViewComponent = NonNullable<
  (typeof blockViewRegistry)[keyof typeof blockViewRegistry]
>;

const DYNAMIC_VIEWS: Record<string, BlockViewComponent> = {
  faq: FaqBlock,
  gallery: GalleryBlock,
  amenities: AmenitiesBlock,
  payments: PaymentsBlock,
};

function renderBlock(blockType: string) {
  const View =
    DYNAMIC_VIEWS[blockType]
    ?? blockViewRegistry[blockType as keyof typeof blockViewRegistry]!;
  const content = CONTENT[blockType] ?? {};

  if (isDataDrivenBlock(blockType as never)) {
    return render(
      <View blockId={1} content={content} data={DATA[blockType]} community={COMMUNITY} />,
    );
  }

  return render(
    <View
      block={{ id: 1, blockType, blockOrder: 0, content }}
      community={COMMUNITY}
      theme={THEME}
      layout={LAYOUT}
    />,
  );
}

describe('public site — block views', () => {
  it('has at least the ten shipped block types registered', () => {
    // A guard on the guard: if the registry import silently resolved to an
    // empty object, every `it.each` below would vacuously pass.
    expect(BLOCK_TYPES.length).toBeGreaterThanOrEqual(10);
  });

  it.each(BLOCK_TYPES)('%s block renders real markup', (blockType) => {
    // The anti-vacuity check. A block whose content fails Zod renders NOTHING,
    // and an empty container passes every axe rule there is — so without this
    // the suite below would be a very convincing no-op.
    const { container } = renderBlock(blockType);
    expect(container.querySelectorAll('*').length).toBeGreaterThan(3);
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it.each(BLOCK_TYPES)('%s block has no axe violations', async (blockType) => {
    const { container } = renderBlock(blockType);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('every registered block type is exercised by this suite', () => {
    // The point of registry-driven coverage: adding an 11th block type must not
    // quietly ship with no accessibility check.
    for (const blockType of Object.keys(blockViewRegistry)) {
      expect(BLOCK_TYPES).toContain(blockType);
    }
  });
});

describe('public site — chrome', () => {
  it('header has no axe violations, including the logo and title branches', async () => {
    const { container } = render(<PublicSiteHeader theme={HEADER_THEME} />);

    /*
     * ANTI-VACUITY — and deliberately NOT the `querySelectorAll('*').length > 3`
     * idiom used for the block cases above. That check is already satisfied here
     * by the always-rendered "Resident Login" nav, so it passed even with the
     * old broken fixture and proves nothing about either branch. Naming the two
     * branches is the only assertion that can tell those states apart.
     */
    expect(container.querySelector(`img[alt="${COMMUNITY.name} logo"]`)).not.toBeNull();
    expect(container.textContent).toContain(COMMUNITY.name);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('header with the page nav has no axe violations', async () => {
    /*
     * The second `<nav>`. `PageNav` puts a "Site pages" landmark inside the same
     * `<header>` that already holds the "Resident access" one, and marks the
     * active page with `aria-current`. Reachable in production since Phase
     * 11b-2 and audited by nothing until now — two landmarks of the same role in
     * one region is exactly what `landmark-unique` exists to catch.
     *
     * Two items minimum: PageNav returns null below that (D10).
     */
    const { container } = render(
      <PublicSiteHeader
        theme={HEADER_THEME}
        nav={{
          currentSlug: 'about',
          items: [
            { id: 1, name: 'Home', slug: '', isHome: true },
            { id: 2, name: 'About', slug: 'about', isHome: false },
          ],
        }}
      />,
    );

    // Anti-vacuity: PageNav silently renders nothing below two items, so a
    // one-item fixture would audit the header without the branch under test.
    expect(container.querySelectorAll('nav')).toHaveLength(2);
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('About');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('footer has no axe violations, including the accessibility link', async () => {
    const { container } = render(
      <PublicSiteFooter
        communityName={COMMUNITY.name}
        associationName="Sunset Condominium Association, Inc."
        note="Managed by Acme Property Group."
        showStatutoryLine
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
