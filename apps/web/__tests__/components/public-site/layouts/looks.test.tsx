/**
 * The four looks: Bayfront, Heritage, Palm Grove and Plain & Simple.
 *
 * Each look draws the hero its `LOOK_STYLES` entry names, and its page chrome
 * (section rhythm, where the accent goes, text size) follows the same entry. The
 * three legacy layouts render exactly as they did before the looks existed.
 *
 * The block registry is cut down to blocks that need no database: the real
 * HeroBlock and TextBlock, plus a stand-in for the data sections that records
 * what the layout handed it. That renders a whole page, chrome included.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { contrastRatio } from '@propertypro/shared';
import { tokenDefinitions, toHex } from '@propertypro/tokens';
import type { BlockRendererProps, LayoutId } from '@/components/public-site/blocks/types';
import { HeroBlock } from '@/components/public-site/blocks/HeroBlock';
import { LOOK_STYLES, paintsSecondary, type LookLayoutId } from '@/components/public-site/layouts/look-styles';
import { Bayfront } from '@/components/public-site/layouts/Bayfront';
import { Heritage } from '@/components/public-site/layouts/Heritage';
import { PalmGrove } from '@/components/public-site/layouts/PalmGrove';
import { PlainSimple } from '@/components/public-site/layouts/PlainSimple';
import type { LayoutComponent, SiteBlock } from '@/components/public-site/layouts/types';

const received = vi.hoisted(() => ({ props: [] as unknown[] }));

vi.mock('@/components/public-site/blocks/registry', async () => {
  const { HeroBlock: Hero } = await import('@/components/public-site/blocks/HeroBlock');
  const { TextBlock } = await import('@/components/public-site/blocks/TextBlock');
  // Stands in for the database-backed sections: records its props, renders a
  // headed section the way the real ones do.
  const DataSection = (props: BlockRendererProps) => {
    received.props.push(props);
    return (
      <section id={props.anchorId} aria-labelledby={`data-${props.block.id}`} className="px-4 py-12">
        <h2 id={`data-${props.block.id}`}>{props.block.blockType}</h2>
      </section>
    );
  };
  const registry: Record<string, unknown> = {
    hero: Hero,
    text: TextBlock,
    meetings: DataSection,
    contact: DataSection,
    quicklinks: DataSection,
  };
  return {
    blockRendererRegistry: registry,
    hasRenderer: (type: string) => type in registry,
  };
});

const LOOKS: ReadonlyArray<readonly [LookLayoutId, LayoutComponent]> = [
  ['bayfront', Bayfront],
  ['heritage', Heritage],
  ['palm-grove', PalmGrove],
  ['plain-simple', PlainSimple],
];
const PHOTO_LOOKS = LOOKS.filter(([id]) => LOOK_STYLES[id].heroStyle !== 'text');

const community = {
  id: 1,
  slug: 'harbor-pointe',
  name: 'Harbor Pointe',
  shortName: null,
  logoUrl: null,
  communityType: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  unitCount: 120,
  timezone: 'America/New_York',
};
// Bayfront's preset. Only the header paints these directly; everything else
// reads the theme's custom properties.
const theme = {
  primaryColor: '#0B4F5C',
  secondaryColor: '#F5EFE6',
  accentColor: '#E9A23B',
  headingFont: 'Playfair Display',
  bodyFont: 'Source Sans 3',
};

const SUNSET = { stock: 'sunset', alt: 'Sunset over the water, with palm trees in silhouette' };
const PALMS = { stock: 'palms', alt: 'A quiet street lined with tall palm trees' };
const POOL = { path: '1/hero/pool', alt: 'The pool deck' };
const CTA = { ctaText: 'Owner sign in', ctaTarget: '/auth/login' };

function heroBlock(content: Record<string, unknown> = {}): SiteBlock {
  return {
    id: 11,
    blockType: 'hero',
    blockOrder: 1,
    content: { headline: 'Welcome to {{name}}', ...content },
  };
}

const TEXT_BLOCK: SiteBlock = {
  id: 12,
  blockType: 'text',
  blockOrder: 2,
  content: { heading: 'About us', body: 'A condominium on the bay.' },
};

function renderHero(layout: LayoutId, content: Record<string, unknown> = {}) {
  return render(
    <HeroBlock
      block={{ id: 11, blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome to {{name}}', ...content } }}
      community={community}
      theme={theme}
      layout={layout}
    />,
  );
}

function heroOf(container: HTMLElement): HTMLElement {
  const heroes = container.querySelectorAll<HTMLElement>('[data-hero-style]');
  expect(heroes).toHaveLength(1);
  return heroes[0]!;
}

const savedEnv = process.env.NEXT_PUBLIC_SUPABASE_URL;
beforeEach(() => {
  received.props = [];
  // Upload URLs are relative without a CDN, which keeps the markup stable.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv;
});

describe('LOOK_STYLES', () => {
  it('is the table the plan gives each look, with the colour of each page', () => {
    expect(LOOK_STYLES).toEqual({
      bayfront: { heroStyle: 'photo-full', pageBackground: 'white', sectionTint: 'alternate', radius: 'pill', accentUse: 'background', onAccent: 'text' },
      heritage: { heroStyle: 'photo-split', pageBackground: 'secondary', sectionTint: 'none', radius: 'square', accentUse: 'text', onAccent: 'inverse' },
      'palm-grove': { heroStyle: 'photo-card', pageBackground: 'white', sectionTint: 'alternate', radius: 'rounded', accentUse: 'background', onAccent: 'inverse' },
      'plain-simple': { heroStyle: 'text', pageBackground: 'white', sectionTint: 'none', radius: 'rounded', accentUse: 'background', onAccent: 'text' },
    });
  });
});

describe('each look renders its hero style', () => {
  it.each(LOOKS)('%s draws the hero its LOOK_STYLES entry names', (id, Layout) => {
    const { container } = render(
      <Layout community={community} theme={theme} blocks={[heroBlock({ photos: [SUNSET], ...CTA }), TEXT_BLOCK]} />,
    );
    expect(heroOf(container)).toHaveAttribute('data-hero-style', LOOK_STYLES[id].heroStyle);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to Harbor Pointe');
  });

  it.each(PHOTO_LOOKS)('%s draws the text hero when the manager has removed the photos', (_id, Layout) => {
    const { container } = render(<Layout community={community} theme={theme} blocks={[heroBlock()]} />);
    const hero = heroOf(container);
    expect(hero).toHaveAttribute('data-hero-style', 'text');
    expect(hero.querySelector('img')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to Harbor Pointe');
  });

  it('plain-simple keeps its text hero and still shows a photo the manager added', () => {
    const { container } = render(
      <PlainSimple community={community} theme={theme} blocks={[heroBlock({ photos: [PALMS] })]} />,
    );
    const hero = heroOf(container);
    expect(hero).toHaveAttribute('data-hero-style', 'text');
    expect(within(hero).getByAltText(PALMS.alt)).toBeInTheDocument();
  });
});

describe('the full-photo hero (Bayfront)', () => {
  it('sets the words in white over the photo, with the photo described', () => {
    const { container } = renderHero('bayfront', { subtitle: 'News and records.', photos: [SUNSET] });
    const hero = heroOf(container);
    expect(within(hero).getByAltText(SUNSET.alt)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-content-inverse');
    expect(screen.getByText('News and records.')).toHaveClass('text-content-inverse');
  });

  it('keeps the words at AA over any photo: white text over a white photo under the scrim', () => {
    const { container } = renderHero('bayfront', { photos: [SUNSET] });
    const hero = heroOf(container);
    const [photo, scrim, words] = Array.from(hero.children);
    // Photo, then scrim, then words: the scrim sits between the two.
    expect(photo?.tagName).toBe('IMG');
    expect(scrim).toHaveAttribute('aria-hidden', 'true');
    expect(words?.querySelector('h1')).not.toBeNull();

    const alpha = Number(/\bbg-black\/(\d+)\b/.exec(scrim?.className ?? '')?.[1]) / 100;
    expect(alpha).toBeGreaterThan(0);
    // The lightest pixel a photo can have is white; black at `alpha` over it.
    const channel = Math.round(255 * (1 - alpha)).toString(16).padStart(2, '0').toUpperCase();
    const worstBackground = `#${channel}${channel}${channel}`;
    const white = toHex(tokenDefinitions.text.inverse);
    expect(contrastRatio(white, worstBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it('with two or more photos, the photo behind the words is decorative and the strip shows each photo once', () => {
    const { container } = renderHero('bayfront', { photos: [SUNSET, POOL] });
    const hero = heroOf(container);
    expect(hero).toHaveAttribute('data-hero-style', 'photo-full');
    expect(hero.firstElementChild).toHaveAttribute('alt', '');
    expect(within(hero).getByRole('group', { name: 'Community photos, 2 total' })).toBeInTheDocument();
    expect(within(hero).getAllByAltText(SUNSET.alt)).toHaveLength(1);
    expect(within(hero).getAllByAltText(POOL.alt)).toHaveLength(1);
  });
});

describe.each([
  ['heritage', 'photo-split'],
  ['palm-grove', 'photo-card'],
] as const)('the %s hero (%s)', (id, style) => {
  it('shows one photo, described, and no carousel', () => {
    const { container } = renderHero(id, { photos: [PALMS] });
    const hero = heroOf(container);
    expect(hero).toHaveAttribute('data-hero-style', style);
    expect(within(hero).getAllByRole('img')).toHaveLength(1);
    expect(within(hero).getByAltText(PALMS.alt)).toBeInTheDocument();
    expect(within(hero).queryByRole('group')).toBeNull();
  });

  it("puts two or more photos in a strip in the photo's place, each once, with focus rings that show on a light page", () => {
    const { container } = renderHero(id, { photos: [SUNSET, POOL] });
    const hero = heroOf(container);
    const strip = within(hero).getByRole('group', { name: 'Community photos, 2 total' });
    expect(within(hero).getAllByRole('img')).toHaveLength(2);
    // The legacy strip's white ring sits on the dark hero band; on a light page
    // it would vanish, so the light strip rings in the primary colour.
    expect(strip).toHaveClass('focus-visible:ring-primary');
    expect(strip).not.toHaveClass('focus-visible:ring-content-inverse');
    for (const dot of within(hero).getAllByRole('link', { name: /Go to photo/ })) {
      expect(dot).toHaveClass('focus-visible:ring-primary');
    }
  });

  it('sets the headline in the primary colour on a light background', () => {
    renderHero(id, { photos: [PALMS] });
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-primary');
  });
});

describe("the hero's button follows LOOK_STYLES", () => {
  const RADIUS = { square: 'rounded-none', rounded: 'rounded-md', pill: 'rounded-full' } as const;

  it.each(LOOKS)('%s', (id) => {
    renderHero(id, { photos: [SUNSET], ...CTA });
    const button = screen.getByRole('link', { name: 'Owner sign in' });
    const look = LOOK_STYLES[id];
    expect(button).toHaveAttribute('href', '/auth/login');
    expect(button).toHaveClass(RADIUS[look.radius]);
    // 44px tall, the touch target on a phone.
    expect(button).toHaveClass('min-h-11');
    if (look.accentUse === 'background') {
      expect(button).toHaveClass('bg-accent');
      const onAccent = look.onAccent === 'inverse' ? 'text-content-inverse' : 'text-content';
      expect(button.classList.contains(onAccent)).toBe(true);
    } else {
      expect(button).toHaveClass('bg-primary');
      expect(button.classList.contains('text-content-inverse')).toBe(true);
      expect(button).not.toHaveClass('bg-accent');
    }
  });
});

describe('linked fields in a look hero (D4)', () => {
  it.each(LOOKS)('%s keeps its heading, showing the name, when the whole headline drops', (id) => {
    render(
      <HeroBlock
        block={{ id: 11, blockType: 'hero', blockOrder: 1, content: { headline: '{{city}}' } }}
        community={{ ...community, city: null }}
        theme={theme}
        layout={id}
      />,
    );
    // No city, so the headline drops; the display name stands in.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Harbor Pointe');
  });

  it.each(LOOKS)('%s renders no subtitle paragraph when every sentence drops', (id) => {
    const { container } = render(
      <HeroBlock
        block={{ id: 11, blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome', subtitle: '{{units}} homes.' } }}
        community={{ ...community, unitCount: null }}
        theme={theme}
        layout={id}
      />,
    );
    expect(heroOf(container).querySelector('p')).toBeNull();
  });

  it('renders a name holding markup as text', () => {
    const { container } = render(
      <HeroBlock
        block={{ id: 11, blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome to {{name}}' } }}
        community={{ ...community, name: '<b>Harbor</b> {{city}}' }}
        theme={theme}
        layout="bayfront"
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to <b>Harbor</b> {{city}}');
    expect(container.querySelector('b')).toBeNull();
  });
});

describe('the page around the hero follows LOOK_STYLES', () => {
  function renderPage(Layout: LayoutComponent) {
    const { container } = render(
      <Layout community={community} theme={theme} blocks={[heroBlock({ photos: [SUNSET] }), TEXT_BLOCK]} />,
    );
    const root = container.querySelector<HTMLElement>('[data-layout]')!;
    const list = heroOf(container).parentElement!;
    return { root, list };
  }

  it.each(LOOKS)('%s: section rhythm, where the accent goes, and headings', (id, Layout) => {
    const { root, list } = renderPage(Layout);
    const look = LOOK_STYLES[id];
    expect(root).toHaveAttribute('data-layout', id);

    // Every other section on the theme's secondary colour, or hairline rules.
    const alternate = '[&>section:nth-of-type(even)]:bg-[var(--theme-secondary)]';
    expect(list.classList.contains(alternate)).toBe(look.sectionTint === 'alternate');
    expect(list.classList.contains('divide-y')).toBe(look.sectionTint === 'none');

    // A look whose accent is a background colour never sets text in it: a
    // section's accent-coloured text (an announcement's "Pinned") is redrawn in
    // the primary. A look whose accent is a text colour sets its dates in it.
    expect(list.classList.contains('[&_.text-accent]:text-primary')).toBe(look.accentUse === 'background');
    expect(list.classList.contains('[&_time]:text-accent')).toBe(look.accentUse === 'text');

    // Section headings in the theme's primary colour.
    expect(list).toHaveClass('[&_h2]:text-primary');
  });

  it.each(LOOKS)('%s: only plain-simple sets every text size one step up', (id, Layout) => {
    const { root } = renderPage(Layout);
    expect(root.classList.contains('large-text')).toBe(id === 'plain-simple');
  });

  it.each(LOOKS)("%s: paints the theme's secondary exactly where the publish check looks for it", (id, Layout) => {
    const { root, list } = renderPage(Layout);
    // The page colour comes from LOOK_STYLES too, so the check cannot miss a page.
    expect(root.classList.contains('bg-[var(--theme-secondary)]')).toBe(LOOK_STYLES[id].pageBackground === 'secondary');
    const painted = `${root.className} ${list.className}`.includes('--theme-secondary');
    expect(painted).toBe(paintsSecondary(id));
  });

  it('.large-text really is a step up: the body size grows from the default', () => {
    // The class lives in the design tokens; this pins what plain-simple relies on.
    const css = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', '..', 'packages', 'ui', 'src', 'styles', 'tokens.css'),
      'utf8',
    );
    const base = (block: string) => Number(/--font-size-base:\s*([\d.]+)rem/.exec(block)?.[1]);
    const defaultBase = base(css.slice(css.indexOf(':root')));
    const largeBase = base(css.slice(css.indexOf('.large-text {')));
    expect(defaultBase).toBeGreaterThan(0);
    expect(largeBase).toBeGreaterThan(defaultBase);
  });
});

describe.each(LOOKS)('the %s layout', (id, Layout) => {
  const DATA_BLOCKS: SiteBlock[] = [
    { id: 15, blockType: 'meetings', blockOrder: 5, content: {} },
    { id: 11, blockType: 'hero', blockOrder: 1, content: { headline: 'Welcome' } },
    { id: 16, blockType: 'contact', blockOrder: 6, content: {} },
    { id: 12, blockType: 'quicklinks', blockOrder: 2, content: {} },
    { id: 13, blockType: 'meetings', blockOrder: 3, content: {} },
    { id: 17, blockType: 'unicorn', blockOrder: 4, content: {} },
  ];

  it("hands each section, in order, the look's layout id, the page's sections and its anchor", () => {
    render(<Layout community={community} theme={theme} blocks={DATA_BLOCKS} />);
    const props = received.props as BlockRendererProps[];
    expect(props.map((p) => p.block.id)).toEqual([12, 13, 15, 16]);
    for (const p of props) {
      expect(p.layout).toBe(id);
      expect(p.pageSections?.map((s) => s.id)).toEqual([11, 12, 13, 17, 15, 16]);
    }
    expect(Object.fromEntries(props.map((p) => [p.block.id, p.anchorId]))).toEqual({
      12: 'quicklinks',
      13: 'meetings',
      15: undefined,
      16: 'contact',
    });
  });

  it('headlines a sub-page with its own name, in the empty-state hero (D18)', () => {
    const { container } = render(
      <Layout community={community} theme={theme} blocks={[]} page={{ name: 'About Us', isHome: false }} />,
    );
    const headings = container.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('About Us');
  });

  it('keeps an <h1> when the hero block fails its schema', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Layout community={community} theme={theme} blocks={[heroBlock({ headline: '' })]} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Harbor Pointe');
    warn.mockRestore();
  });

  it('threads the page nav to the header and the footer fields through', () => {
    const { container } = render(
      <Layout
        community={community}
        theme={theme}
        blocks={[]}
        nav={{
          items: [
            { id: 1, name: 'Home', slug: '', isHome: true },
            { id: 7, name: 'About Us', slug: 'about', isHome: false },
          ],
          currentSlug: '',
        }}
        footer={{ associationName: 'Harbor Pointe Condominium Association, Inc.', note: null, showStatutoryLine: false }}
      />,
    );
    const links = Array.from(container.querySelectorAll('nav[aria-label="Site pages"] a'));
    expect(links.map((a) => a.textContent)).toEqual(['Home', 'About Us']);
    expect(screen.getByText(/Harbor Pointe Condominium Association, Inc\./)).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  // jsdom paints nothing, so axe cannot measure colour contrast here (it tries a
  // canvas jsdom does not have). The arithmetic is in look-contrast.test.ts.
  const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };

  it.each(LOOKS)('a %s home page has no axe violations', async (_id, Layout) => {
    const { container } = render(
      <Layout
        community={community}
        theme={theme}
        blocks={[
          heroBlock({ subtitle: '{{units}} homes in {{city}}.', photos: [SUNSET], ...CTA }),
          TEXT_BLOCK,
          { id: 13, blockType: 'meetings', blockOrder: 3, content: {} },
        ]}
      />,
    );
    // Anti-vacuity: the page under audit has its hero, its photo and its sections.
    expect(container.querySelector('[data-hero-style]')).not.toBeNull();
    expect(container.querySelectorAll('h2').length).toBeGreaterThanOrEqual(2);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it.each(LOOKS)('a %s hero with two photos has no axe violations', async (id) => {
    const { container } = renderHero(id, { photos: [SUNSET, POOL], ...CTA });
    expect(container.querySelector('[aria-roledescription="carousel"]')).not.toBeNull();
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it.each(LOOKS)('a %s sub-page (empty-state hero) has no axe violations', async (_id, Layout) => {
    const { container } = render(
      <Layout community={community} theme={theme} blocks={[TEXT_BLOCK]} page={{ name: 'About Us', isHome: false }} />,
    );
    expect(container.querySelector('h1')).toHaveTextContent('About Us');
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});

describe('legacy layouts render unchanged', () => {
  // Captured from HeroBlock at 9cdb5e55a, before the looks existed. A legacy
  // hero must stay byte-identical: the looks branch off before its markup.
  const TWO_PHOTOS_AND_A_BUTTON = [
    '<section class="bg-primary px-4 py-20 text-center site-sm:px-6 site-lg:px-8"><div class="mx-auto max-w-3xl">',
    '<h1 class="font-heading text-4xl font-bold text-content-inverse site-sm:text-5xl">Welcome to Sunset Condos</h1>',
    '<p class="mt-4 text-lg text-content-inverse">120 homes in Miami.</p><div class="mt-8">',
    '<a href="/auth/login" class="inline-flex items-center rounded-md bg-surface-card px-6 py-3 text-base font-medium text-primary shadow-e2 hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content-inverse">Owner sign in</a></div>',
    '<div class="mt-10"><div role="group" aria-roledescription="carousel" aria-label="Community photos, 2 total" tabindex="0" class="flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content-inverse">',
    '<figure id="hero-7-photo-0" role="group" aria-roledescription="slide" aria-label="Photo 1 of 2" class="w-full shrink-0 snap-center"><img alt="Sunset over the water" width="1440" height="1080" class="w-full rounded-md shadow-e1" loading="eager" src="/site-looks/sunset.webp">',
    '</figure>',
    '<figure id="hero-7-photo-1" role="group" aria-roledescription="slide" aria-label="Photo 2 of 2" class="w-full shrink-0 snap-center"><img sizes="(min-width: 1024px) 768px, 100vw" alt="The pool" width="1600" height="900" class="w-full rounded-md shadow-e1" loading="lazy" srcset="/site-assets/1/hero/abc.800w.webp 800w, /site-assets/1/hero/abc.1600w.webp 1600w" src="/site-assets/1/hero/abc.1600w.webp">',
    '</figure></div>',
    '<ul class="mt-4 flex justify-center gap-2">',
    '<li><a href="#hero-7-photo-0" aria-label="Go to photo 1 of 2" class="block h-6 w-6 rounded-full p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content-inverse"><span aria-hidden="true" class="block h-2 w-2 rounded-full bg-white/60"></span></a></li>',
    '<li><a href="#hero-7-photo-1" aria-label="Go to photo 2 of 2" class="block h-6 w-6 rounded-full p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content-inverse"><span aria-hidden="true" class="block h-2 w-2 rounded-full bg-white/60"></span></a></li>',
    '</ul></div></div></section>',
  ].join('');
  const ONE_PHOTO = [
    '<section class="bg-primary px-4 py-20 text-center site-sm:px-6 site-lg:px-8"><div class="mx-auto max-w-3xl">',
    '<h1 class="font-heading text-4xl font-bold text-content-inverse site-sm:text-5xl">Hello</h1>',
    '<div class="mt-10 flex justify-center"><img alt="Palms" width="1100" height="1100" class="rounded-md shadow-e1" loading="eager" src="/site-looks/palms.webp"></div>',
    '</div></section>',
  ].join('');

  const legacyCommunity = { ...community, slug: 'sunset-condos', name: 'Sunset Condos' };

  it.each(['tidewater', 'boulevard', 'sable'] as const)('%s hero markup is byte-identical', (layout) => {
    const twoPhotos = render(
      <HeroBlock
        block={{
          id: 7,
          blockType: 'hero',
          blockOrder: 1,
          content: {
            headline: 'Welcome to {{name}}',
            subtitle: '{{units}} homes in {{city}}.',
            ...CTA,
            photos: [
              { stock: 'sunset', alt: 'Sunset over the water' },
              { path: '1/hero/abc', alt: 'The pool' },
            ],
          },
        }}
        community={legacyCommunity}
        theme={theme}
        layout={layout}
      />,
    );
    expect(twoPhotos.container.innerHTML).toBe(TWO_PHOTOS_AND_A_BUTTON);
    twoPhotos.unmount();

    const onePhoto = render(
      <HeroBlock
        block={{
          id: 7,
          blockType: 'hero',
          blockOrder: 1,
          content: { headline: 'Hello', photos: [{ stock: 'palms', alt: 'Palms' }] },
        }}
        community={legacyCommunity}
        theme={theme}
        layout={layout}
      />,
    );
    expect(onePhoto.container.innerHTML).toBe(ONE_PHOTO);
  });
});
