'use client';

import { useCallback } from 'react';
import { galleryBlockSchema } from '@propertypro/shared';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { useBlockForm } from '../use-block-form';
import { GalleryImagesField, type GalleryImageDraft } from './fields/GalleryImagesField';
import type { BlockFormProps } from '../types';

const HEADING_MAX = 120;
const MAX_IMAGES = 24;

interface GalleryDraft {
  heading: string;
  images: GalleryImageDraft[];
}

/**
 * Tolerant parse — a block whose stored content fails its schema must still
 * open, because this form is the only place to repair it.
 */
function toDraft(content: unknown): GalleryDraft {
  const parsed = galleryBlockSchema.safeParse(content);
  if (parsed.success) {
    return {
      heading: parsed.data.heading ?? '',
      images: parsed.data.images.map((image) => ({
        imagePath: image.imagePath,
        altText: image.altText ?? '',
        decorative: image.decorative === true,
        caption: image.caption ?? '',
      })),
    };
  }
  const loose = (content ?? {}) as Record<string, unknown>;
  const rawImages = Array.isArray(loose.images) ? loose.images : [];
  return {
    heading: typeof loose.heading === 'string' ? loose.heading : '',
    images: rawImages
      .map((raw) => {
        const image = (raw ?? {}) as Record<string, unknown>;
        return {
          imagePath: typeof image.imagePath === 'string' ? image.imagePath : '',
          altText: typeof image.altText === 'string' ? image.altText : '',
          decorative: image.decorative === true,
          caption: typeof image.caption === 'string' ? image.caption : '',
        };
      })
      // A row with no path is not repairable from this form — there is no
      // "replace this image" affordance, only add and remove — so keeping it
      // would show an empty frame that blocks the save forever.
      .filter((image) => image.imagePath.length > 0),
  };
}

/**
 * `galleryBlockSchema.images` is `min(1)` and each image needs alt text unless
 * it is explicitly decorative, so either shortfall means there is nothing valid
 * to write yet.
 */
function toCanonical(draft: GalleryDraft): unknown | null {
  if (draft.images.length === 0) return null;

  const images = draft.images.map((image) => {
    const caption = image.caption.trim();
    const altText = image.altText.trim();
    return {
      imagePath: image.imagePath,
      // `decorative: true` and `altText` cannot coexist — mirroring the
      // schema's refine exactly rather than approximating it.
      ...(image.decorative ? { decorative: true as const } : { altText }),
      ...(caption.length > 0 ? { caption } : {}),
    };
  });

  if (images.some((image) => !('decorative' in image) && image.altText.length === 0)) {
    return null;
  }

  const heading = draft.heading.trim();
  return {
    ...(heading.length > 0 ? { heading } : {}),
    images,
  };
}

/**
 * Gallery block settings — a heading and up to 24 described images.
 *
 * Note what is NOT here: creating the block. A gallery cannot exist with zero
 * images, so the first one is uploaded in the Add panel and this form takes
 * over from there. That is also why `toCanonical` returning null for an empty
 * list is a real state rather than dead code: the PM can remove their way down
 * to nothing, and the form has to refuse the write instead of sending
 * `images: []` for the route to reject.
 */
export function GalleryForm({ communityId, blockOrder, content }: BlockFormProps) {
  const upsert = useUpsertContentBlock(communityId);

  const save = useCallback(
    async (next: unknown) => {
      await upsert.mutateAsync({ blockType: 'gallery', blockOrder, content: next });
    },
    [upsert, blockOrder],
  );

  const { draft, setDraft, isIncomplete } = useBlockForm<GalleryDraft>({
    content,
    toDraft,
    toCanonical,
    save,
  });

  const headingId = `gallery-heading-${blockOrder}`;
  const undescribed = draft.images.findIndex(
    (image) => !image.decorative && image.altText.trim().length === 0,
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={headingId}>Heading</Label>
        <Input
          id={headingId}
          value={draft.heading}
          maxLength={HEADING_MAX}
          placeholder="Optional"
          onChange={(event) => setDraft((prev) => ({ ...prev, heading: event.target.value }))}
        />
      </div>

      <GalleryImagesField
        communityId={communityId}
        blockOrder={blockOrder}
        maxImages={MAX_IMAGES}
        images={draft.images}
        onChange={(images) => setDraft((prev) => ({ ...prev, images }))}
      />

      {isIncomplete && (
        <p className="text-xs text-status-danger">
          {undescribed >= 0
            ? `Image ${undescribed + 1} needs alt text, or mark it decorative.`
            : 'Add at least one image before this section can be saved.'}
        </p>
      )}
    </div>
  );
}
