/**
 * GalleryBlock (Pro+) — content block rendering a heading plus a responsive
 * grid of images. Each image reuses the single-image block's responsive
 * variant convention: the finalize endpoint writes {path}.1600w.webp and
 * {path}.800w.webp sibling variants and deletes the raw upload, so the
 * fallback src must point at the 1600w variant (never content.imagePath).
 */
import { galleryBlockSchema, type GalleryBlockContent } from '@propertypro/shared';
// Import from ./public-url, NOT ./storage-paths — the latter pulls in
// `node:crypto` for write-side path generation and cannot be bundled client-side.
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';
import type { BlockRendererProps } from './types';

export function GalleryBlock(props: BlockRendererProps) {
  const parsed = galleryBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'gallery block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const content: GalleryBlockContent = parsed.data;
  const headingId = content.heading ? `gallery-${props.block.id}` : undefined;

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-labelledby={headingId}>
      <div className="mx-auto max-w-5xl">
        {content.heading && (
          <h2 id={headingId} className="mb-6 font-heading text-2xl font-semibold text-content">
            {content.heading}
          </h2>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {content.images.map((image, i) => {
            const src1600 = buildPublicAssetUrl(`${image.imagePath}.1600w.webp`);
            const src800 = buildPublicAssetUrl(`${image.imagePath}.800w.webp`);
            const alt = image.decorative === true ? '' : (image.altText ?? '');
            return (
              <li key={i}>
                <figure className="m-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src1600}
                    srcSet={`${src800} 800w, ${src1600} 1600w`}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    alt={alt}
                    className="aspect-[4/3] w-full rounded-md object-cover shadow-e1"
                    loading="lazy"
                  />
                  {image.caption && (
                    <figcaption className="mt-2 text-sm text-content-secondary">
                      {image.caption}
                    </figcaption>
                  )}
                </figure>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
