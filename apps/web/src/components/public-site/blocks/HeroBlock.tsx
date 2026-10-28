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
 * Note: uses a plain <img> element instead of next/image because the test
 * environment (jsdom) cannot configure a Next.js image loader. The image
 * dimensions and loading priority are set via HTML attributes to preserve
 * the equivalent hints for real browsers. If a Next.js image loader is wired
 * up later, this element can be upgraded to <Image> without changing any tests.
 */
import {
  heroBlockSchema,
  resolveHeroPhotos,
  resolveLinkedText,
  type HeroBlockContent,
  type LinkedFacts,
} from '@propertypro/shared';
// Import from ./public-url, NOT ./storage-paths — the latter pulls in
// `node:crypto` for write-side path generation and cannot be bundled client-side.
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';
import type { BlockRendererProps } from './types';
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
  const { community } = props;
  const facts: LinkedFacts = {
    name: community.name,
    shortName: community.shortName,
    city: community.city,
    unitCount: community.unitCount,
  };
  // A headline that drops whole (only `{{city}}`, and no city) falls back to the
  // display name, resolved by the same rule as the `{{name}}` token itself: the
  // short name when it is not blank, else the full name.
  const headline =
    resolveLinkedText(content.headline, facts) || resolveLinkedText('{{name}}', facts);
  const subtitle = content.subtitle ? resolveLinkedText(content.subtitle, facts) : '';

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
            more get the scroll-snap strip. */}
        {photos.length === 1 && (
          <div className="mt-10 flex justify-center">
            {/* Plain <img> used instead of next/image — see file-level comment. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={buildPublicAssetUrl(`${photos[0]!.path}.1600w.webp`)}
              srcSet={`${buildPublicAssetUrl(`${photos[0]!.path}.800w.webp`)} 800w, ${buildPublicAssetUrl(`${photos[0]!.path}.1600w.webp`)} 1600w`}
              sizes="(min-width: 1024px) 768px, 100vw"
              alt={photos[0]!.decorative === true ? '' : (photos[0]!.alt ?? '')}
              width={1600}
              height={900}
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
