/**
 * HeroPhotoStrip — the hero's multi-photo presentation.
 *
 * ## Why this has no JavaScript
 *
 * Nothing under `components/public-site/` is a client component. The public
 * site is a Florida statutory-transparency entry point that currently ships
 * zero hydration runtime, and `HeroBlock` is imported by BOTH the public
 * renderer registry and the editor's view registry — so a `'use client'`
 * carousel here would put React's client entry on that route for the first
 * time. `perf-check` sums every chunk the build manifest lists for a route,
 * regardless of whether a given branch renders, so "only communities with two
 * or more photos pay for it" would not have been true of the measurement
 * either: ~40-90 KiB on a statutory page to buy ~3 KiB of slide logic.
 *
 * Scroll-snap plus in-page anchors gives the same affordance for nothing:
 * swipe and trackpad scrolling work natively, the dots are real links, the
 * scroller is focusable and arrow-key scrollable, and it degrades to a plain
 * scrolling row if CSS scroll-snap is unsupported.
 *
 * ## Why there is no autoplay
 *
 * Deliberate, and it is why this component has no pause control and no
 * `prefers-reduced-motion` branch: there is no motion to reduce and nothing to
 * pause. WCAG 2.2.2 requires a pause control for any automatically-moving
 * content that starts on load, and an auto-advancing carousel on a legally
 * mandated records page is a liability rather than a feature. Not building the
 * motion is a better answer than building it and then suppressing it.
 */
import type { ResolvedHeroPhoto } from '@propertypro/shared';
// ./public-url, NOT ./storage-paths — the latter pulls `node:crypto` and
// cannot be bundled into the editor's client tree.
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';

export interface HeroPhotoStripProps {
  photos: readonly ResolvedHeroPhoto[];
  /** Disambiguates element ids when more than one hero renders in a preview. */
  blockId: number;
}

export function HeroPhotoStrip({ photos, blockId }: HeroPhotoStripProps) {
  const slideId = (index: number) => `hero-${blockId}-photo-${index}`;

  return (
    <div className="mt-10">
      <div
        // A carousel/slide roledescription pair is what tells assistive tech
        // this row is a gallery rather than an arbitrary scrolling div.
        role="group"
        aria-roledescription="carousel"
        aria-label={`Community photos, ${photos.length} total`}
        // tabIndex 0 so keyboard users can scroll the region — a focusable
        // scroll container is the accessible-name-and-operability requirement
        // for an overflow region.
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content-inverse"
      >
        {photos.map((photo, index) => (
          <figure
            key={photo.path}
            id={slideId(index)}
            role="group"
            aria-roledescription="slide"
            aria-label={`Photo ${index + 1} of ${photos.length}`}
            className="w-full shrink-0 snap-center"
          >
            {/* Plain <img> rather than next/image — see HeroBlock's file
                comment. Variants are siblings of the base path; finalize
                deletes the raw upload, so the base path itself would 404. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={buildPublicAssetUrl(`${photo.path}.1600w.webp`)}
              srcSet={`${buildPublicAssetUrl(`${photo.path}.800w.webp`)} 800w, ${buildPublicAssetUrl(`${photo.path}.1600w.webp`)} 1600w`}
              sizes="(min-width: 1024px) 768px, 100vw"
              alt={photo.decorative === true ? '' : (photo.alt ?? '')}
              width={1600}
              height={900}
              className="w-full rounded-md shadow-e1"
              // Only the first photo is above the fold; the rest are a scroll
              // away and must not compete with it for bandwidth.
              loading={index === 0 ? 'eager' : 'lazy'}
            />
          </figure>
        ))}
      </div>

      <ul className="mt-4 flex justify-center gap-2">
        {photos.map((photo, index) => (
          <li key={photo.path}>
            <a
              href={`#${slideId(index)}`}
              // The dots are the only labelled way to reach a specific photo,
              // so each needs its position in its accessible name.
              aria-label={`Go to photo ${index + 1} of ${photos.length}`}
              className="block h-6 w-6 rounded-full p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-content-inverse"
            >
              <span
                aria-hidden="true"
                className="block h-2 w-2 rounded-full bg-white/60"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
