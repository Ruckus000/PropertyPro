import { imageBlockSchema, type ImageBlockContent } from '@propertypro/shared';
import { buildPublicAssetUrl } from '@/lib/site-assets/storage-paths';
import type { BlockRendererProps } from './types';

export function ImageBlock(props: BlockRendererProps) {
  const parsed = imageBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'image block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const content: ImageBlockContent = parsed.data;

  // The finalize endpoint writes sibling variants at
  // {storagePath}.1600w.webp and {storagePath}.800w.webp AND deletes the raw
  // upload at content.imagePath. So fallbackSrc must NOT point at
  // content.imagePath (it would 404 — caught by save-image, social-media
  // crawlers, screen readers in "list images" mode, and as the srcset
  // fallback). Use the 1600w variant as the fallback src.
  const src1600 = buildPublicAssetUrl(`${content.imagePath}.1600w.webp`);
  const src800 = buildPublicAssetUrl(`${content.imagePath}.800w.webp`);
  const fallbackSrc = src1600;

  const alt = content.decorative === true ? '' : (content.altText ?? '');

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8">
      <figure className="mx-auto max-w-4xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fallbackSrc}
          srcSet={`${src800} 800w, ${src1600} 1600w`}
          sizes="(min-width: 1024px) 800px, 100vw"
          alt={alt}
          className="w-full h-auto rounded-md shadow-e1"
          loading="lazy"
        />
        {content.caption && (
          <figcaption className="mt-3 text-sm text-content-secondary text-center">
            {content.caption}
          </figcaption>
        )}
      </figure>
    </section>
  );
}
