'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GalleryBlockContent, GalleryImage } from '@propertypro/shared';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { buildPublicAssetUrl } from '@/lib/site-assets/storage-paths';

interface Props {
  communityId: number;
  blockOrder: number;
  initial: GalleryBlockContent | null;
  onSaved?: () => void;
}

interface GalleryEntry {
  /** A newly-picked file pending upload, or null for an already-uploaded image. */
  file: File | null;
  /** Storage path of an already-uploaded image (from `initial`), else null. */
  imagePath: string | null;
  /** Object URL for previewing a newly-picked file, else null. */
  previewUrl: string | null;
  altText: string;
  decorative: boolean;
  caption: string;
}

const MAX_IMAGES = 24;
// finalize requires altText.min(1); decorative images carry no block-content
// alt, so we send this placeholder to the upload pipeline only.
const DECORATIVE_PLACEHOLDER_ALT = 'Decorative image';

const inputClass =
  'mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40';

function toEntries(initial: GalleryBlockContent | null): GalleryEntry[] {
  if (!initial?.images?.length) return [];
  return initial.images.map((img) => ({
    file: null,
    imagePath: img.imagePath,
    previewUrl: null,
    altText: img.altText ?? '',
    decorative: img.decorative === true,
    caption: img.caption ?? '',
  }));
}

export function GalleryBlockForm({ communityId, blockOrder, initial, onSaved }: Props) {
  const [heading, setHeading] = useState(initial?.heading ?? '');
  const [entries, setEntries] = useState<GalleryEntry[]>(() => toEntries(initial));
  const [serverError, setServerError] = useState<string | null>(null);
  const upload = useImageUpload({ communityId });
  const save = useUpsertContentBlock(communityId);

  // Revoke all outstanding object URLs on unmount.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  useEffect(() => {
    return () => {
      entriesRef.current.forEach((e) => e.previewUrl && URL.revokeObjectURL(e.previewUrl));
    };
  }, []);

  const allLabelled = entries.every((e) => e.decorative || e.altText.trim().length > 0);
  const disabled =
    entries.length === 0 ||
    entries.length > MAX_IMAGES ||
    !allLabelled ||
    upload.isPending ||
    save.isPending;

  function addFile(file: File | null) {
    if (!file) return;
    setEntries((prev) => [
      ...prev,
      {
        file,
        imagePath: null,
        previewUrl: URL.createObjectURL(file),
        altText: '',
        decorative: false,
        caption: '',
      },
    ]);
  }
  function updateEntry(index: number, patch: Partial<GalleryEntry>) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }
  function removeEntry(index: number) {
    setEntries((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    try {
      const images: GalleryImage[] = [];
      for (const entry of entries) {
        let imagePath = entry.imagePath;
        if (entry.file) {
          const result = await upload.mutateAsync({
            file: entry.file,
            kind: 'content',
            altText: entry.decorative ? DECORATIVE_PLACEHOLDER_ALT : entry.altText.trim(),
          });
          imagePath = result.storagePath;
        }
        if (!imagePath) continue;
        images.push({
          imagePath,
          ...(entry.decorative ? { decorative: true as const } : { altText: entry.altText.trim() }),
          ...(entry.caption.trim() ? { caption: entry.caption.trim() } : {}),
        } as GalleryImage);
      }
      const content: GalleryBlockContent = {
        images,
        ...(heading.trim() ? { heading: heading.trim() } : {}),
      };
      await save.mutateAsync({ blockType: 'gallery', blockOrder, content });
      onSaved?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor={`gallery-heading-${blockOrder}`} className="block text-sm font-medium text-content">
          Heading
        </label>
        <input
          id={`gallery-heading-${blockOrder}`}
          type="text"
          maxLength={120}
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          className={inputClass}
        />
      </div>

      <ul className="space-y-4">
        {entries.map((entry, i) => {
          const thumbSrc = entry.previewUrl
            ? entry.previewUrl
            : entry.imagePath
              ? buildPublicAssetUrl(`${entry.imagePath}.800w.webp`)
              : null;
          return (
            <li key={i} className="rounded-sm border border-default p-3">
              {thumbSrc && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbSrc}
                  alt=""
                  className="mb-3 h-32 w-full rounded-sm object-cover"
                />
              )}
              <label className="inline-flex items-center gap-2 text-sm text-content">
                <input
                  type="checkbox"
                  aria-label={`Image ${i + 1} decorative`}
                  checked={entry.decorative}
                  onChange={(e) => updateEntry(i, { decorative: e.target.checked })}
                />
                Decorative image (no alt text required)
              </label>
              {!entry.decorative && (
                <div className="mt-3">
                  <label htmlFor={`gallery-alt-${blockOrder}-${i}`} className="block text-sm font-medium text-content">
                    Image {i + 1} alt text <span className="text-danger">*</span>
                  </label>
                  <input
                    id={`gallery-alt-${blockOrder}-${i}`}
                    type="text"
                    maxLength={200}
                    value={entry.altText}
                    onChange={(e) => updateEntry(i, { altText: e.target.value })}
                    className={inputClass}
                  />
                </div>
              )}
              <div className="mt-3">
                <label htmlFor={`gallery-caption-${blockOrder}-${i}`} className="block text-sm font-medium text-content">
                  Image {i + 1} caption
                </label>
                <input
                  id={`gallery-caption-${blockOrder}-${i}`}
                  type="text"
                  maxLength={200}
                  value={entry.caption}
                  onChange={(e) => updateEntry(i, { caption: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => removeEntry(i)}
                  className="rounded-sm px-2 py-1 text-sm text-danger hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div>
        <label htmlFor={`gallery-add-${blockOrder}`} className="block text-sm font-medium text-content">
          Add image
        </label>
        <input
          id={`gallery-add-${blockOrder}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={entries.length >= MAX_IMAGES}
          onChange={(e) => {
            addFile(e.target.files?.[0] ?? null);
            e.target.value = '';
          }}
          className="mt-1 block w-full text-sm disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="mt-1 text-xs text-content-secondary">
          {entries.length}/{MAX_IMAGES} images.
        </p>
      </div>

      {serverError && (
        <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          {upload.isPending ? 'Uploading…' : save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
