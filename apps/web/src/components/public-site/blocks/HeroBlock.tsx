/**
 * HeroBlock — public-site welcome panel (first block on every community page).
 *
 * Validates `block.content` against `heroBlockSchema` before rendering.
 * Invalid content logs a warn + returns null (graceful degradation).
 *
 * The headline and subtitle are templates: `{{name}}`, `{{city}}` and `{{units}}`
 * stand for facts the community already gave us and are filled in here, at
 * render (`resolveLinkedText`), so a rename in Settings shows with no publish. A
 * sentence whose fact is missing is dropped. When nothing is left of the subtitle,
 * no <p> is rendered. When nothing is left of the headline, the community's display
 * name stands in, so the page keeps its <h1>: the layouts skip their own empty-state
 * hero whenever a hero block validates, which makes this the page's only heading.
 * Both go in as React text children, never as markup: a community name holding
 * `<b>` or `{{city}}` is shown exactly as typed.
 *
 * Under one of the four looks, the hero is drawn as `LOOK_STYLES[layout]` says
 * (`LookHero`, below); the root carries `data-hero-style` naming the style that
 * rendered. Under a legacy layout it is the markup it has always been.
 *
 * Note: uses a plain <img> element instead of next/image because the test
 * environment (jsdom) cannot configure a Next.js image loader. The image
 * dimensions and loading priority are set via HTML attributes to preserve
 * the equivalent hints for real browsers. If a Next.js image loader is wired
 * up later, this element can be upgraded to <Image> without changing any tests.
 */
import {
  heroBlockSchema,
  resolveHeroHeadline,
  resolveHeroPhotos,
  resolveLinkedText,
  type HeroBlockContent,
  type LinkedFacts,
  type ResolvedHeroPhoto,
} from '@propertypro/shared';
import { cn } from '@/lib/utils';
import { lookStyleFor, type HeroStyle, type LookStyle } from '../layouts/look-styles';
import type { BlockRendererProps } from './types';
import { heroPhotoImgAttributes } from './hero-photo-img';
import { HeroPhotoStrip } from './HeroPhotoStrip';

export function HeroBlock(props: BlockRendererProps) {
  const parsed = heroBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'hero block content failed Zod validation; skipping render',
      {
        blockId: props.block.id,
        communityId: props.community.id,
        issues: parsed.error.issues,
      },
    );
    return null;
  }
  const content: HeroBlockContent = parsed.data;
  // One resolver for the legacy single image and the photo array alike, so
  // the public site, the editor canvas and the publish validator cannot
  // disagree about what a hero's photos are.
  const photos = resolveHeroPhotos(content);
  const singlePhoto = photos.length === 1 ? heroPhotoImgAttributes(photos[0]!) : null;
  const { community } = props;
  const facts: LinkedFacts = {
    name: community.name,
    shortName: community.shortName,
    city: community.city,
    unitCount: community.unitCount,
  };
  // A headline that drops whole (only `{{city}}`, and no city) falls back to the
  // display name; the editor's "Shows as" line reads the same function.
  const headline = resolveHeroHeadline(content.headline, facts);
  const subtitle = content.subtitle ? resolveLinkedText(content.subtitle, facts) : '';

  const look = lookStyleFor(props.layout);
  if (look) {
    return (
      <LookHero
        look={look}
        headline={headline}
        subtitle={subtitle}
        cta={content.ctaText && content.ctaTarget ? { text: content.ctaText, href: content.ctaTarget } : null}
        photos={photos}
        blockId={props.block.id}
      />
    );
  }

  return (
    <section className="bg-primary px-4 py-20 text-center site-sm:px-6 site-lg:px-8">
      <div className="mx-auto max-w-3xl">
        {headline && (
          <h1 className="font-heading text-4xl font-bold text-content-inverse site-sm:text-5xl">
            {headline}
          </h1>
        )}
        {subtitle && (
          <p className="mt-4 text-lg text-content-inverse">{subtitle}</p>
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
        {/* One photo keeps the original single-image presentation — which is
            every community today, so this change is a no-op for them. Two or
            more get the scroll-snap strip. An upload or a stock photo alike:
            `heroPhotoImgAttributes` knows where each is served from. */}
        {singlePhoto && (
          <div className="mt-10 flex justify-center">
            {/* Plain <img> used instead of next/image — see file-level comment. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={singlePhoto.src}
              srcSet={singlePhoto.srcSet}
              sizes={singlePhoto.sizes}
              alt={singlePhoto.alt}
              width={singlePhoto.width}
              height={singlePhoto.height}
              className="rounded-md shadow-e1"
              loading="eager"
            />
          </div>
        )}
        {photos.length > 1 && (
          <HeroPhotoStrip photos={photos} blockId={props.block.id} />
        )}
      </div>
    </section>
  );
}

/** Corners by `LookStyle.radius`, as whole class names so Tailwind sees them. */
const CORNERS: Record<LookStyle['radius'], { button: string; photo: string }> = {
  square: { button: 'rounded-none', photo: 'rounded-none' },
  rounded: { button: 'rounded-md', photo: 'rounded-2xl' },
  pill: { button: 'rounded-full', photo: 'rounded-2xl' },
};

/** The button in the accent when the look paints its accent as a background, else in the primary. */
function buttonColours({ accentUse, onAccent }: LookStyle): string {
  if (accentUse === 'text') return 'bg-primary text-content-inverse';
  return onAccent === 'inverse' ? 'bg-accent text-content-inverse' : 'bg-accent text-content';
}

/**
 * One hero photo. A look's photo slot can be wider than the legacy hero's, so an
 * upload gets `sizes` for it; a stock photo is one file and has none.
 */
function HeroImg({
  photo,
  className,
  sizes,
  decorative = false,
}: {
  photo: ResolvedHeroPhoto;
  className: string;
  sizes?: string;
  decorative?: boolean;
}) {
  const img = heroPhotoImgAttributes(photo);
  return (
    // Plain <img> rather than next/image — see the file comment.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={img.src}
      srcSet={img.srcSet}
      sizes={img.srcSet ? (sizes ?? img.sizes) : undefined}
      alt={decorative ? '' : img.alt}
      width={img.width}
      height={img.height}
      className={className}
      loading="eager"
    />
  );
}

export interface LookHeroProps {
  look: LookStyle;
  /** Resolved already: the linked fields are filled in by the caller. */
  headline: string;
  subtitle?: string;
  cta?: { text: string; href: string } | null;
  photos?: readonly ResolvedHeroPhoto[];
  /** Keeps the photo strip's element ids apart when a preview renders more than one hero. */
  blockId?: number;
}

/**
 * A look's hero, in the style `LOOK_STYLES` gives it:
 * - `photo-full`: the first photo fills the hero under a 60% black scrim, and the
 *   words sit over it in white. White on 60% black over a pure-white pixel is
 *   5.7:1, so the words pass AA whatever the photo; until the photo loads they
 *   sit on the primary colour under the same scrim.
 * - `photo-split`: the words beside the photo, which has a thin accent frame.
 * - `photo-card`: a wide photo with the words on a card overlapping its foot.
 * - `text`: the words alone, with any photos the manager added below them.
 *
 * A photo style with no photos draws `text`, and `data-hero-style` names the style
 * that rendered. Two or more photos go in the strip, in the photo's place; under
 * `photo-full` the first photo also stays behind the words, as decoration
 * (`alt=""`), and the strip carries each photo's description once.
 *
 * Also the empty-state hero of a look's page (`SiteChrome`): the heading alone.
 */
export function LookHero({ look, headline, subtitle, cta, photos = [], blockId = 0 }: LookHeroProps) {
  const style: HeroStyle = photos.length === 0 ? 'text' : look.heroStyle;
  const onPhoto = style === 'photo-full';
  const corners = CORNERS[look.radius];
  const strip =
    photos.length > 1 ? (
      <HeroPhotoStrip photos={photos} blockId={blockId} surface={onPhoto ? 'dark' : 'light'} />
    ) : null;

  const words = (
    <>
      <h1
        className={cn(
          'font-heading text-4xl font-bold site-sm:text-5xl',
          onPhoto ? 'text-content-inverse' : 'text-primary',
        )}
      >
        {headline}
      </h1>
      {subtitle && (
        <p className={cn('mt-4 text-lg', onPhoto ? 'text-content-inverse' : 'text-content')}>
          {subtitle}
        </p>
      )}
      {cta && (
        <div className="mt-8">
          <a
            href={cta.href}
            className={cn(
              'inline-flex min-h-11 items-center border-2 border-primary px-6 py-3 text-base font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              corners.button,
              buttonColours(look),
            )}
          >
            {cta.text}
          </a>
        </div>
      )}
    </>
  );

  if (style === 'photo-full') {
    return (
      <section data-hero-style={style} className="relative overflow-hidden bg-primary">
        <HeroImg
          photo={photos[0]!}
          className="absolute inset-0 h-full w-full object-cover"
          sizes="100vw"
          decorative={strip !== null}
        />
        <div aria-hidden="true" className="absolute inset-0 bg-black/60" />
        <div className="relative mx-auto max-w-5xl px-4 py-24 site-sm:px-6 site-md:py-32 site-lg:px-8">
          {words}
          {strip}
        </div>
      </section>
    );
  }

  if (style === 'photo-split') {
    return (
      <section data-hero-style={style} className="px-4 py-16 site-sm:px-6 site-lg:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-10 site-md:grid-cols-2">
          <div>{words}</div>
          {strip ?? (
            <div className="relative">
              <div
                aria-hidden="true"
                className={cn('absolute inset-0 translate-x-3 translate-y-3 border border-accent', corners.photo)}
              />
              <HeroImg
                photo={photos[0]!}
                className={cn('relative w-full', corners.photo)}
                sizes="(min-width: 768px) 50vw, 100vw"
              />
            </div>
          )}
        </div>
      </section>
    );
  }

  if (style === 'photo-card') {
    return (
      <section data-hero-style={style} className="px-4 pb-16 pt-8 site-sm:px-6 site-lg:px-8">
        <div className="mx-auto max-w-6xl">
          {strip ?? (
            <HeroImg
              photo={photos[0]!}
              className={cn('aspect-video w-full object-cover', corners.photo)}
              sizes="100vw"
            />
          )}
          <div
            className={cn(
              'relative mx-4 max-w-2xl border border-edge bg-surface-card p-6 shadow-e1 site-sm:mx-10 site-sm:p-10',
              corners.photo,
              strip ? 'mt-6' : '-mt-16',
            )}
          >
            {words}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section data-hero-style={style} className="px-4 py-16 site-sm:px-6 site-lg:px-8">
      <div className="mx-auto max-w-3xl">
        {words}
        {strip ??
          (photos[0] && <HeroImg photo={photos[0]} className={cn('mt-10 w-full', corners.photo)} />)}
      </div>
    </section>
  );
}
