/**
 * HeroBlock — public-site welcome panel (first block on every community page).
 *
 * Validates `block.content` against `heroBlockSchema` before rendering.
 * Invalid content logs a warn + returns null (graceful degradation).
 *
 * Note: uses a plain <img> element instead of next/image because the test
 * environment (jsdom) cannot configure a Next.js image loader. The image
 * dimensions and loading priority are set via HTML attributes to preserve
 * the equivalent hints for real browsers. If a Next.js image loader is wired
 * up later, this element can be upgraded to <Image> without changing any tests.
 */
import { heroBlockSchema, type HeroBlockContent } from '@propertypro/shared';
// Import from ./public-url, NOT ./storage-paths — the latter pulls in
// `node:crypto` for write-side path generation and cannot be bundled client-side.
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';
import type { BlockRendererProps } from './types';

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

  return (
    <section className="bg-primary px-4 py-20 text-center sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-heading text-4xl font-bold text-content-inverse sm:text-5xl">
          {content.headline}
        </h1>
        {content.subtitle && (
          <p className="mt-4 text-lg text-content-inverse">{content.subtitle}</p>
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
            {/* Plain <img> used instead of next/image — see file-level comment. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={buildPublicAssetUrl(content.heroImagePath)}
              alt={content.heroImageAlt}
              width={1600}
              height={900}
              className="rounded-md shadow-e1"
              loading="eager"
            />
          </div>
        )}
      </div>
    </section>
  );
}
