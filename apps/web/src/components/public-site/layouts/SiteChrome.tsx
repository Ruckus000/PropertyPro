import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PublicSiteHeader } from '@/components/public-site/PublicSiteHeader';
import { PublicSiteFooter } from '@/components/public-site/PublicSiteFooter';
import { LookHero } from '@/components/public-site/blocks/HeroBlock';
import { LOOK_STYLES, type LookLayoutId, type LookStyle } from './look-styles';
import type { LayoutId, LayoutProps } from './types';

/**
 * The page chrome of a layout — everything around the blocks: the header with
 * the page nav, the layout's background and block-list treatment, the
 * empty-state hero, and the footer.
 *
 * ## Why this is its own component
 *
 * A "template" in the Design panel is a layout plus a colour set. The three
 * legacy layouts differ ONLY in this chrome; the four looks differ in it and in
 * their hero, which `HeroBlock` draws from the `layout` prop (`LOOK_STYLES`). So
 * a canvas that rendered blocks without the chrome showed the same thing
 * whichever template was chosen. The editor canvas and the preview now render
 * the real chrome around the real block views, which is what makes "what you
 * see is what publishes" true for the template too.
 *
 * It is a plain synchronous component with no data access, for the same reason
 * the block *views* are (`blocks/types.ts`): the canvas is a client tree that
 * re-renders on every keystroke, and an async server component cannot sit in
 * it. The server layouts (`Tidewater`, `Boulevard`, `Sable` and the four looks)
 * compose this with the async block renderers; the canvas composes it with the
 * block views.
 *
 * The legacy layouts' markup here is their own, moved — not redesigned. A
 * layout test that passed before the move passes after it.
 */

/** The shape `PublicSiteHeader` takes (`CommunityTheme`), from the layout props. */
function toHeaderTheme(community: LayoutProps['community'], theme: LayoutProps['theme']) {
  return {
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
    accentColor: theme.accentColor,
    fontHeading: theme.headingFont,
    fontBody: theme.bodyFont,
    logoUrl: community.logoUrl,
    communityName: community.name,
    communityType: community.communityType,
  };
}

function TidewaterEmptyHero({ heading }: { heading: string }) {
  return (
    <section className="bg-primary px-4 py-20 text-center site-sm:px-6 site-lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-heading text-4xl font-bold text-content-inverse site-sm:text-5xl">
          {heading}
        </h1>
        <p className="mt-4 text-lg text-content-inverse">
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

function BoulevardEmptyHero({ heading }: { heading: string }) {
  return (
    <section className="border-y border-edge bg-secondary px-4 py-16 site-sm:px-6 site-lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 site-md:grid-cols-[1.2fr_0.8fr] site-md:items-end">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-primary">
            Community Portal
          </p>
          <h1 className="font-heading text-4xl font-semibold text-content site-sm:text-5xl">
            {heading}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-content-secondary">
            Documents, meetings, announcements, and resident resources in one place.
          </p>
        </div>
        <div className="site-md:text-right">
          <a
            href="/auth/login"
            className="inline-flex items-center rounded-md bg-primary px-6 py-3 text-base font-medium text-content-inverse shadow-e2 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            Resident Login
          </a>
        </div>
      </div>
    </section>
  );
}

function SableEmptyHero({ heading }: { heading: string }) {
  return (
    <section className="bg-surface-card px-4 py-20 site-sm:px-6 site-lg:px-8">
      <div className="mx-auto max-w-4xl border-l-4 border-accent pl-6 site-sm:pl-8">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-accent">
          Resident Access
        </p>
        <h1 className="font-heading text-4xl font-semibold text-content site-sm:text-5xl">
          {heading}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-content-secondary">
          A quiet home for community notices, records, meetings, and essential updates.
        </p>
        <div className="mt-8">
          <a
            href="/auth/login"
            className="inline-flex items-center rounded-md bg-primary px-6 py-3 text-base font-medium text-content-inverse shadow-e2 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Resident Login
          </a>
        </div>
      </div>
    </section>
  );
}

interface LayoutChrome {
  /** Classes on the page root, after the fill class (see `fullHeight`). */
  root: string;
  /** Classes on `<main>`. */
  main: string;
  /** A wrapper around the block list, or null when the blocks sit directly in `<main>`. */
  list: string | null;
  EmptyHero: (props: { heading: string }) => ReactNode;
}

/**
 * A look's sections, by `LookStyle.sectionTint`.
 *
 * `alternate` puts every other section on the theme's secondary colour, read
 * from `--theme-secondary` itself: Tailwind's `secondary` is a grey TEXT token,
 * not the theme's. It counts the sections that rendered, so a section left out
 * for having nothing to show never breaks the rhythm. The editor canvas wraps
 * each section in its selection frame, which this does not match, so the canvas
 * shows no bands; it shows the empty sections too, so it could not predict where
 * the bands fall anyway. The previews and the live site show them.
 */
const SECTION_RHYTHM: Record<LookStyle['sectionTint'], string> = {
  alternate: '[&>section:nth-of-type(even)]:bg-[var(--theme-secondary)]',
  none: 'divide-y divide-edge',
};

/**
 * Where a look's sections put the accent, by `LookStyle.accentUse`. A look whose
 * accent is a background colour (Bayfront's gold, Plain & Simple's pale yellow)
 * never sets text in it, so a section's accent-coloured text, such as an
 * announcement's "Pinned", is redrawn in the primary. A look whose accent is a
 * text colour sets its dates in it.
 */
const ACCENT_TEXT: Record<LookStyle['accentUse'], string> = {
  background: '[&_.text-accent]:text-primary',
  text: '[&_time]:text-accent',
};

/** A look's page without a hero block (a sub-page always) opens with its text hero: the heading alone. */
function lookEmptyHero(look: LookStyle) {
  return function LookEmptyHero({ heading }: { heading: string }) {
    return <LookHero look={look} headline={heading} />;
  };
}

/**
 * The chrome of one of the four looks, from its `LOOK_STYLES` entry: section
 * headings in the theme's primary colour, its section rhythm and its accent
 * rule, plus anything particular to it.
 */
function lookChrome(id: LookLayoutId, root: string, list?: string): LayoutChrome {
  const look = LOOK_STYLES[id];
  return {
    root: cn('flex flex-col font-body text-content', root),
    main: 'flex-1',
    list: cn('[&_h2]:text-primary', SECTION_RHYTHM[look.sectionTint], ACCENT_TEXT[look.accentUse], list),
    EmptyHero: lookEmptyHero(look),
  };
}

/**
 * What tells the layouts apart. Static strings, deliberately — Tailwind's
 * scanner and `guard:class-resolution` both need to see every class as written.
 */
const LAYOUT_CHROME: Record<LayoutId, LayoutChrome> = {
  tidewater: {
    root: 'flex flex-col font-body',
    main: 'flex-1',
    list: null,
    EmptyHero: TidewaterEmptyHero,
  },
  boulevard: {
    root: 'bg-secondary font-body text-content',
    main: '',
    list: 'divide-y divide-edge',
    EmptyHero: BoulevardEmptyHero,
  },
  sable: {
    root: 'bg-surface-card font-body text-content',
    main: '',
    list: 'mx-auto max-w-6xl',
    EmptyHero: SableEmptyHero,
  },
  // Photo-led and modern: a white page under a full-bleed photo.
  bayfront: lookChrome('bayfront', 'bg-surface-card'),
  // Formal: the page on the theme's paper-like secondary, each section heading
  // ruled off in the primary.
  heritage: lookChrome(
    'heritage',
    'bg-[var(--theme-secondary)]',
    '[&_h2]:border-b-2 [&_h2]:border-primary [&_h2]:pb-3',
  ),
  // Warm and friendly: a white page, the photo with the welcome on a card.
  'palm-grove': lookChrome('palm-grove', 'bg-surface-card'),
  // No photos needed: a white page, and every text size one step up
  // (`.large-text`, the app's own large-text scale in tokens.css).
  'plain-simple': lookChrome('plain-simple', 'large-text bg-surface-card'),
};

export interface SiteChromeProps {
  layout: LayoutId;
  community: LayoutProps['community'];
  theme: LayoutProps['theme'];
  footer?: LayoutProps['footer'];
  nav?: LayoutProps['nav'];
  /**
   * The heading of the layout's empty-state hero. Pass it when the page has no
   * hero block that will render (`hasHeroBlock`); omit it, or pass `null`, when
   * it has one. The page's own name on a sub-page, the community's on home —
   * see the D18 note in the layouts.
   */
  emptyHeroHeading?: string | null;
  /**
   * The public page fills the viewport (`min-h-screen`); the editor canvas and
   * the preview sit inside a frame and must not. Default true.
   */
  fullHeight?: boolean;
  /**
   * Whether the block list is the page's `<main id="main-content">`. True on
   * the public page. The editor canvas and the preview pass false: they sit
   * INSIDE the editor's own main landmark, and a nested `<main>` with a
   * duplicate id breaks skip links and landmark navigation. Default true.
   */
  landmark?: boolean;
  /**
   * Rendered inside a positioned wrapper around the header, on top of it. The
   * editor uses this for the "Navigation" affordance; the public page passes
   * nothing.
   */
  headerAdornment?: ReactNode;
  /** The rendered blocks, in visitor order. */
  children: ReactNode;
}

export function SiteChrome({
  layout,
  community,
  theme,
  footer,
  nav,
  emptyHeroHeading,
  fullHeight = true,
  landmark = true,
  headerAdornment,
  children,
}: SiteChromeProps) {
  const chrome = LAYOUT_CHROME[layout];
  const { EmptyHero } = chrome;
  const header = <PublicSiteHeader theme={toHeaderTheme(community, theme)} nav={nav} />;
  const Main = landmark ? 'main' : 'div';

  return (
    <div data-layout={layout} className={cn(fullHeight && 'min-h-screen', chrome.root)}>
      {headerAdornment ? (
        <div className="relative">
          {header}
          {headerAdornment}
        </div>
      ) : (
        header
      )}
      <Main id={landmark ? 'main-content' : undefined} className={chrome.main || undefined}>
        {emptyHeroHeading != null ? <EmptyHero heading={emptyHeroHeading} /> : null}
        {chrome.list ? <div className={chrome.list}>{children}</div> : children}
      </Main>
      <PublicSiteFooter
        communityName={community.name}
        associationName={footer?.associationName}
        note={footer?.note}
        showStatutoryLine={footer?.showStatutoryLine}
      />
    </div>
  );
}
