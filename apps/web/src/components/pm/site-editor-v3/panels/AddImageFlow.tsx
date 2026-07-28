'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import {
  CONTENT_MAX_BYTES,
  DECORATIVE_PLACEHOLDER_ALT,
  validateImageFile,
} from '@/lib/site-assets/client-image';
import type { AddCatalogEntry } from './add-catalog';

const ALT_MAX = 200;

export interface AddImageFlowProps {
  communityId: number;
  /** `image` or `gallery` — the two types that cannot exist without a file. */
  entry: AddCatalogEntry;
  /** Slot the section will take, or null if the list has not loaded. */
  blockOrder: number | null;
  onCancel: () => void;
  onAdded: (blockOrder: number, entry: AddCatalogEntry) => void;
}

/**
 * Add an Image or Gallery section — the two types that need a file first.
 *
 * `imageBlockSchema.imagePath` and each `galleryBlockSchema.images[].imagePath`
 * must be a real `{communityId}/content/...` storage path, so unlike every
 * other type there is no valid content to seed and no way to create the section
 * and fill it in afterwards. The upload has to come first.
 *
 * **Alt text is collected before the upload, not after.**
 * `/api/v1/site/images/finalize` requires `altText: min(1)`, so an
 * upload-then-describe flow would presign, PUT the bytes, and only then 400 —
 * stranding an object in the bucket on every attempt. `HeroPhotosField` stages
 * for the same reason.
 *
 * **A failed block write does not re-upload.** The finalized path is kept in
 * state, so "Try again" retries only the write. Otherwise a transient failure
 * would charge the community's storage quota a second time and orphan the first
 * set of bytes.
 */
export function AddImageFlow({
  communityId,
  entry,
  blockOrder,
  onCancel,
  onAdded,
}: AddImageFlowProps) {
  const upload = useImageUpload({ communityId });
  const upsert = useUpsertContentBlock(communityId);

  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [decorative, setDecorative] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set once the bytes are finalized. Its presence is what makes the retry a
  // write-only retry.
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);

  const altId = `add-image-alt-${entry.blockType}`;
  const fileId = `add-image-file-${entry.blockType}`;
  const decorativeId = `add-image-decorative-${entry.blockType}`;

  const described = decorative || alt.trim().length > 0;
  const busy = upload.isPending || upsert.isPending;
  const canSubmit =
    blockOrder !== null && (uploadedPath !== null || file !== null) && described && !busy;

  /**
   * Block content for the finalized path.
   *
   * Stores the BASE `storagePath`, never `variant1600Path` — the renderer
   * appends the variant suffixes itself. Alt comes from what the PM typed,
   * never `result.altText`, which for a decorative image is the pipeline's
   * placeholder and would hand the image a description nobody wrote.
   */
  const buildContent = (imagePath: string) => {
    const image = decorative
      ? { imagePath, decorative: true as const }
      : { imagePath, altText: alt.trim() };
    return entry.blockType === 'gallery' ? { images: [image] } : image;
  };

  const submit = async () => {
    if (blockOrder === null) return;
    setError(null);
    try {
      let imagePath = uploadedPath;
      if (imagePath === null) {
        if (file === null) return;
        const result = await upload.mutateAsync({
          file,
          kind: 'content',
          // finalize rejects an empty altText, and a decorative image has none
          // by definition. The placeholder is written only to the audit log.
          altText: decorative ? DECORATIVE_PLACEHOLDER_ALT : alt.trim(),
        });
        imagePath = result.storagePath;
        setUploadedPath(imagePath);
      }
      await upsert.mutateAsync({
        blockType: entry.blockType,
        blockOrder,
        content: buildContent(imagePath),
      });
      onAdded(blockOrder, entry);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'We could not add that section.',
      );
    }
  };

  const pick = (picked: File | null) => {
    setError(null);
    if (picked === null) {
      setFile(null);
      return;
    }
    const invalid = validateImageFile(picked, { maxBytes: CONTENT_MAX_BYTES });
    if (invalid) {
      setRejected(`${picked.name}: ${invalid.message}`);
      setFile(null);
      return;
    }
    setRejected(null);
    setFile(picked);
    // A new file invalidates whatever was uploaded for the previous one.
    setUploadedPath(null);
  };

  return (
    <div className="space-y-4">
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        All sections
      </Button>

      <div>
        <p className="text-sm font-medium text-content">{`Add ${entry.label} section`}</p>
        <p className="mt-1 text-sm text-content-secondary">
          {entry.blockType === 'gallery'
            ? 'Choose the first photo. You can add up to 24 more once the section exists.'
            : 'Choose a photo and describe it for anyone using a screen reader.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={fileId} className="text-xs">
          Photo
        </Label>
        <Input
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => pick(event.target.files?.[0] ?? null)}
        />
        {rejected !== null && (
          <p className="text-xs text-status-danger">{rejected}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={altId} className="text-xs">
          Alt text
        </Label>
        <Input
          id={altId}
          value={alt}
          maxLength={ALT_MAX}
          disabled={decorative || busy}
          aria-invalid={!described || undefined}
          onChange={(event) => setAlt(event.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={decorativeId}
          checked={decorative}
          disabled={busy}
          className="h-4 w-4 rounded-sm border-edge text-interactive focus-visible:ring-2 focus-visible:ring-interactive"
          onChange={(event) => {
            setDecorative(event.target.checked);
            if (event.target.checked) setAlt('');
          }}
        />
        <Label htmlFor={decorativeId} className="text-xs font-normal">
          Decorative — no description needed
        </Label>
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}

      <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
        {upload.isPending
          ? 'Uploading…'
          : upsert.isPending
            ? 'Adding…'
            : uploadedPath !== null && error !== null
              ? 'Try again'
              : `Add ${entry.label} section`}
      </Button>
    </div>
  );
}
