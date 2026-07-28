'use client';

import { useCallback } from 'react';
import { imageBlockSchema, type BlockVariant } from '@propertypro/shared';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { useBlockForm } from '../use-block-form';
import { VariantField } from './fields/VariantField';
import type { BlockFormProps } from '../types';

const ALT_MAX = 200;
const CAPTION_MAX = 200;

interface ImageDraft {
  imagePath: string;
  altText: string;
  decorative: boolean;
  caption: string;
  variant: BlockVariant;
}

/**
 * Tolerant parse — a block whose stored content fails its schema must still
 * open, because this form is the only place to repair it.
 */
function toDraft(content: unknown): ImageDraft {
  const parsed = imageBlockSchema.safeParse(content);
  if (parsed.success) {
    return {
      imagePath: parsed.data.imagePath,
      altText: parsed.data.altText ?? '',
      decorative: parsed.data.decorative === true,
      caption: parsed.data.caption ?? '',
      variant: parsed.data.variant ?? 'standard',
    };
  }
  const loose = (content ?? {}) as Record<string, unknown>;
  return {
    imagePath: typeof loose.imagePath === 'string' ? loose.imagePath : '',
    altText: typeof loose.altText === 'string' ? loose.altText : '',
    decorative: loose.decorative === true,
    caption: typeof loose.caption === 'string' ? loose.caption : '',
    variant: 'standard',
  };
}

/**
 * Mirrors `imageBlockSchema`'s alt/decorative rule exactly: `decorative: true`
 * and `altText` cannot coexist, and one of them is required. Returning null
 * while neither holds is what stops the form autosaving content the publish
 * gate would reject.
 *
 * Replacing the image itself is not offered here — that is the upload path,
 * and this phase deliberately does not add a second one.
 */
function toCanonical(draft: ImageDraft): unknown | null {
  if (draft.imagePath.length === 0) return null;
  const altText = draft.altText.trim();
  if (!draft.decorative && altText.length === 0) return null;

  const caption = draft.caption.trim();
  return {
    imagePath: draft.imagePath,
    ...(draft.decorative ? { decorative: true as const } : { altText }),
    ...(caption.length > 0 ? { caption } : {}),
    ...(draft.variant !== 'standard' ? { variant: draft.variant } : {}),
  };
}

export function ImageForm({ communityId, blockOrder, content }: BlockFormProps) {
  const upsert = useUpsertContentBlock(communityId);

  const save = useCallback(
    async (next: unknown) => {
      await upsert.mutateAsync({ blockType: 'image', blockOrder, content: next });
    },
    [upsert, blockOrder],
  );

  const { draft, setDraft, isIncomplete } = useBlockForm<ImageDraft>({
    content,
    toDraft,
    toCanonical,
    save,
  });

  const altId = `image-alt-${blockOrder}`;
  const captionId = `image-caption-${blockOrder}`;
  const decorativeId = `image-decorative-${blockOrder}`;
  const altHintId = `${altId}-hint`;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={altId}>
          Alt text <span aria-hidden="true">*</span>
          <span className="sr-only">(required unless decorative)</span>
        </Label>
        <Input
          id={altId}
          value={draft.altText}
          maxLength={ALT_MAX}
          disabled={draft.decorative}
          aria-describedby={altHintId}
          onChange={(event) => setDraft((prev) => ({ ...prev, altText: event.target.value }))}
        />
        <p
          id={altHintId}
          className={isIncomplete ? 'text-xs text-status-danger' : 'text-xs text-content-secondary'}
        >
          {isIncomplete
            ? 'Describe the image, or mark it decorative, before this section can be saved.'
            : 'What someone would miss if the image did not load.'}
        </p>
      </div>

      <div className="flex items-start gap-2">
        {/* Native checkbox, not the Radix one: it needs no ResizeObserver in
            jsdom and adds nothing to the route's budget. */}
        <input
          type="checkbox"
          id={decorativeId}
          checked={draft.decorative}
          className="mt-1 h-4 w-4 rounded-sm border-edge text-interactive focus-visible:ring-2 focus-visible:ring-interactive"
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              decorative: event.target.checked,
              // The schema forbids the two coexisting, so clearing alt here is
              // the model, not a convenience.
              altText: event.target.checked ? '' : prev.altText,
            }))
          }
        />
        <Label htmlFor={decorativeId} className="text-sm font-normal">
          This image is decorative
          <span className="mt-0.5 block text-xs text-content-secondary">
            Screen readers will skip it. Only for images that add no information.
          </span>
        </Label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={captionId}>Caption</Label>
        <Input
          id={captionId}
          value={draft.caption}
          maxLength={CAPTION_MAX}
          placeholder="Optional"
          onChange={(event) => setDraft((prev) => ({ ...prev, caption: event.target.value }))}
        />
      </div>

      <VariantField
        idPrefix={`image-${blockOrder}`}
        value={draft.variant}
        onChange={(variant) => setDraft((prev) => ({ ...prev, variant }))}
      />
    </div>
  );
}
