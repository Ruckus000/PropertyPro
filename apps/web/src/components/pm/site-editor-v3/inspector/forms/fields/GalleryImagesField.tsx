'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
// ./public-url, NOT ./storage-paths — the latter pulls `node:crypto` and
// fails at `next build`, not at test time.
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';
import {
  CONTENT_MAX_BYTES,
  validateImageFile,
} from '@/lib/site-assets/client-image';
import { useHeroPhotos, type HeroPhotoUploadItem } from '@/hooks/use-hero-photos';

const ALT_MAX = 200;
const CAPTION_MAX = 200;

/** One image as it lives in gallery block content. */
export interface GalleryImageDraft {
  imagePath: string;
  altText: string;
  decorative: boolean;
  caption: string;
}

/** A picked file, described but not yet uploaded. */
interface StagedImage {
  id: string;
  file: File;
  alt: string;
  decorative: boolean;
}

export interface GalleryImagesFieldProps {
  communityId: number;
  blockOrder: number;
  maxImages: number;
  images: GalleryImageDraft[];
  onChange: (next: GalleryImageDraft[]) => void;
}

/**
 * The gallery's image list: upload, describe, caption, reorder, remove.
 *
 * Deliberately the same shape as `HeroPhotosField`, which already solved every
 * hard part of this problem — the staged-then-upload flow, the `imagesRef` fix
 * for the sequential-callback stale closure, path-keyed rows so focus follows
 * the image rather than the position, deferred focus placement after a
 * mutation, and one live region. Where this differs it is because the schema
 * differs: 24 images rather than 8, and an optional per-image caption.
 *
 * Reordering is buttons only — no drag library. The section list already
 * declined `@dnd-kit` on this route, and for a fully-visible list buttons are
 * both simpler and the keyboard path rather than an alternative to it.
 */
export function GalleryImagesField({
  communityId,
  blockOrder,
  maxImages,
  images,
  onChange,
}: GalleryImagesFieldProps) {
  // ONE live region for the whole field, matching SiteEditorProvider's
  // discipline. Two regions announce the same move twice.
  const [announcement, setAnnouncement] = useState('');

  const [staged, setStaged] = useState<StagedImage[]>([]);
  const [rejected, setRejected] = useState<{ name: string; message: string }[]>([]);

  const listRef = useRef<HTMLUListElement | null>(null);
  const addRef = useRef<HTMLInputElement | null>(null);
  const focusAfterRef = useRef<{ index: number; action: 'remove' | 'move' } | null>(null);
  const stagedSeqRef = useRef(0);

  // `handleUploaded` fires once per file from inside the queue's sequential
  // loop. Reading the prop directly would append to whatever array this
  // callback last closed over, so a second completion could drop the first
  // image. The ref is always the committed list.
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const handleUploaded = useCallback(
    (result: { storagePath: string }, item: HeroPhotoUploadItem) => {
      onChange([
        ...imagesRef.current,
        {
          // The BASE path, not `variant1600Path` — the renderer appends the
          // variant suffixes.
          imagePath: result.storagePath,
          // Alt comes from the STAGED item, never `result.altText`: for a
          // decorative image the latter is the pipeline's placeholder, and
          // writing it into block content would hand the image a plausible
          // description the PM never wrote.
          altText: item.decorative ? '' : item.alt.trim(),
          decorative: item.decorative,
          caption: '',
        },
      ]);
      setStaged((prev) => prev.filter((row) => row.id !== item.id));
    },
    [onChange],
  );

  const { uploads, upload, isUploading } = useHeroPhotos({
    communityId,
    kind: 'content',
    onUploaded: handleUploaded,
  });

  // Staged rows hold a slot too, or picking to the cap twice would stage
  // double what the schema allows.
  const remaining = maxImages - images.length - staged.length;
  const allDescribed = staged.every((row) => row.decorative || row.alt.trim().length > 0);
  const canUpload = staged.length > 0 && allDescribed && !isUploading;

  // Focus placement after a mutation, deferred a tick: focusing synchronously
  // in the handler loses the race with the row unmounting, and focus lands on
  // <body>.
  useEffect(() => {
    const pending = focusAfterRef.current;
    if (!pending) return undefined;
    focusAfterRef.current = null;
    const id = setTimeout(() => {
      const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-image-row]');
      if (!rows || rows.length === 0) {
        addRef.current?.focus();
        return;
      }
      const row = rows[Math.min(pending.index, rows.length - 1)];
      const selector =
        pending.action === 'remove' ? 'button[data-remove]' : 'button[data-move-focus]';
      (row?.querySelector<HTMLElement>(selector) ?? row)?.focus();
    }, 0);
    return () => clearTimeout(id);
  }, [images]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = images.slice();
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
    setAnnouncement(
      `Image ${index + 1} moved to position ${target + 1} of ${images.length}.`,
    );
    focusAfterRef.current = { index: target, action: 'move' };
  };

  const remove = (index: number) => {
    const next = images.filter((_, i) => i !== index);
    onChange(next);
    setAnnouncement(
      next.length === 0
        ? 'Image removed. No images left.'
        : `Image ${index + 1} removed. ${next.length} ${next.length === 1 ? 'image' : 'images'} left.`,
    );
    focusAfterRef.current = { index, action: 'remove' };
  };

  const setImage = (index: number, patch: Partial<GalleryImageDraft>) => {
    const next = images.slice();
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  };

  const setStagedRow = (id: string, patch: Partial<StagedImage>) => {
    setStaged((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  /**
   * Validate each picked file, then stage it for description.
   *
   * No minimum-dimension check: unlike the hero, an in-page gallery image
   * mirrors no server-side resolution rule, and applying the hero's 1600×900
   * floor here would reject perfectly usable photos.
   */
  const onPick = (picked: File[]) => {
    const accepted: StagedImage[] = [];
    const failures: { name: string; message: string }[] = [];

    for (const file of picked.slice(0, Math.max(remaining, 0))) {
      const invalid = validateImageFile(file, { maxBytes: CONTENT_MAX_BYTES });
      if (invalid) {
        failures.push({ name: file.name, message: invalid.message });
        continue;
      }
      stagedSeqRef.current += 1;
      accepted.push({
        id: `staged-${stagedSeqRef.current}`,
        file,
        alt: '',
        decorative: false,
      });
    }

    setStaged((prev) => [...prev, ...accepted]);
    setRejected(failures);
    setAnnouncement(
      [
        accepted.length > 0
          ? `${accepted.length} ${accepted.length === 1 ? 'image' : 'images'} ready to describe.`
          : '',
        failures.length > 0
          ? `${failures.length} ${failures.length === 1 ? 'file was' : 'files were'} not added.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  };

  const onUploadStaged = async () => {
    await upload(staged.map(({ id, file, alt, decorative }) => ({ id, file, alt, decorative })));
    // Rows that succeeded removed themselves in `handleUploaded`; whatever is
    // left failed and keeps its error visible.
    setStaged((prev) => {
      if (prev.length === 0) addRef.current?.focus();
      return prev;
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-content">Images</p>

      {images.length > 0 && (
        <ul ref={listRef} className="space-y-3">
          {images.map((image, index) => {
            const altId = `gallery-alt-${blockOrder}-${index}`;
            const captionId = `gallery-caption-${blockOrder}-${index}`;
            const decorativeId = `gallery-decorative-${blockOrder}-${index}`;
            return (
              <li
                // Keyed by path, NOT index. With an index key React reuses the
                // DOM node at each position, so focus stays on the POSITION
                // after a move instead of following the image the PM moved.
                key={image.imagePath}
                data-image-row
                className="space-y-2 rounded-md border border-edge p-3"
              >
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={buildPublicAssetUrl(`${image.imagePath}.800w.webp`)}
                    alt=""
                    className="h-14 w-20 shrink-0 rounded-sm object-cover"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Label htmlFor={altId} className="text-xs">
                      Alt text
                    </Label>
                    <Input
                      id={altId}
                      value={image.altText}
                      maxLength={ALT_MAX}
                      disabled={image.decorative}
                      onChange={(event) => setImage(index, { altText: event.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={captionId} className="text-xs">
                    Caption
                  </Label>
                  <Input
                    id={captionId}
                    value={image.caption}
                    maxLength={CAPTION_MAX}
                    placeholder="Optional"
                    onChange={(event) => setImage(index, { caption: event.target.value })}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={decorativeId}
                    checked={image.decorative}
                    className="h-4 w-4 rounded-sm border-edge text-interactive focus-visible:ring-2 focus-visible:ring-interactive"
                    onChange={(event) =>
                      // The schema forbids alt and decorative coexisting, so
                      // clearing the alt here is the model rather than a
                      // convenience.
                      setImage(index, {
                        decorative: event.target.checked,
                        altText: event.target.checked ? '' : image.altText,
                      })
                    }
                  />
                  <Label htmlFor={decorativeId} className="text-xs font-normal">
                    Decorative
                  </Label>

                  <div className="ml-auto flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-move-focus
                      disabled={index === 0}
                      aria-label={`Move image ${index + 1} up`}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === images.length - 1}
                      aria-label={`Move image ${index + 1} down`}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-remove
                      aria-label={`Remove image ${index + 1}`}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Staging: picked, not yet uploaded. Alt text is collected HERE
          because finalize requires a non-empty altText — there is no
          upload-first-describe-later option. */}
      {staged.length > 0 && (
        <ul className="space-y-3">
          {staged.map((row) => {
            const altId = `gallery-staged-alt-${blockOrder}-${row.id}`;
            const decorativeId = `gallery-staged-decorative-${blockOrder}-${row.id}`;
            const needsAlt = !row.decorative && row.alt.trim().length === 0;
            return (
              <li
                key={row.id}
                // NOT `data-image-row` — the post-removal focus effect indexes
                // that NodeList, and staged rows in it would corrupt the math.
                data-staged-row
                className="space-y-2 rounded-md border border-dashed border-edge p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-content">
                    {row.file.name}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Discard ${row.file.name}`}
                    onClick={() => setStaged((prev) => prev.filter((s) => s.id !== row.id))}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor={altId} className="text-xs">
                    {`Alt text for ${row.file.name}`}
                  </Label>
                  <Input
                    id={altId}
                    value={row.alt}
                    maxLength={ALT_MAX}
                    disabled={row.decorative}
                    aria-invalid={needsAlt || undefined}
                    onChange={(event) => setStagedRow(row.id, { alt: event.target.value })}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={decorativeId}
                    checked={row.decorative}
                    className="h-4 w-4 rounded-sm border-edge text-interactive focus-visible:ring-2 focus-visible:ring-interactive"
                    onChange={(event) =>
                      setStagedRow(row.id, {
                        decorative: event.target.checked,
                        alt: event.target.checked ? '' : row.alt,
                      })
                    }
                  />
                  <Label htmlFor={decorativeId} className="text-xs font-normal">
                    {`Decorative — ${row.file.name}`}
                  </Label>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rejected.length > 0 && (
        <ul className="space-y-1">
          {rejected.map((row) => (
            <li key={row.name} className="text-xs text-status-danger">
              {`${row.name}: ${row.message}`}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        {/* This label belongs to the FILE INPUT. Do not reuse the string on
            the upload button — two controls named "Add images" makes the
            keyboard path ambiguous. */}
        <Label htmlFor={`gallery-add-${blockOrder}`} className="text-xs">
          Add images
        </Label>
        <Input
          ref={addRef}
          id={`gallery-add-${blockOrder}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={remaining <= 0 || isUploading}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            // Reset the input so re-picking the same file fires change again.
            event.target.value = '';
            if (files.length > 0) onPick(files);
          }}
        />
        <p className="text-xs text-content-secondary">
          {remaining > 0
            ? `${remaining} of ${maxImages} remaining. Describe each image, or mark it decorative.`
            : `Maximum of ${maxImages} images reached.`}
        </p>
      </div>

      {staged.length > 0 && (
        <Button type="button" disabled={!canUpload} onClick={() => void onUploadStaged()}>
          {isUploading
            ? 'Uploading…'
            : `Add ${staged.length} ${staged.length === 1 ? 'image' : 'images'} to gallery`}
        </Button>
      )}

      {uploads.some((u) => u.status === 'uploading' || u.status === 'error') && (
        <ul className="space-y-1">
          {uploads
            .filter((u) => u.status === 'uploading' || u.status === 'error')
            .map((u) => (
              <li
                key={u.localId}
                className={
                  u.status === 'error'
                    ? 'text-xs text-status-danger'
                    : 'text-xs text-content-secondary'
                }
              >
                {u.status === 'error' ? `${u.filename}: ${u.error}` : `Uploading ${u.filename}…`}
              </li>
            ))}
        </ul>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
