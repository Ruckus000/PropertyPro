'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';
import type { PlacedPhoto } from '@/lib/site-editor/placed-photos';

export interface PhotoPickerProps {
  photos: readonly PlacedPhoto[];
  /** The photo currently chosen, so the PM can see which one took. */
  selectedPath: string | null;
  disabled?: boolean;
  onSelect: (path: string) => void;
}

/**
 * Pick a photo already placed elsewhere on the site instead of uploading it
 * again.
 *
 * Alt text is NOT carried over. It is contextual to each placement — the same
 * pool photo is "the pool at dusk" in the hero and "the pool, seen from the
 * deck" in a gallery — so the caller collects it for the new use, exactly as it
 * does after an upload.
 *
 * Thumbnails are the `.800w.webp` variant, never the base path: finalize
 * deletes the raw upload once the variants exist, so the base path is a 404.
 * Same convention as `GalleryImagesField` and `HeroPhotosField`.
 *
 * Each button's accessible name carries the upload filename and its position,
 * not just the use count. Six buttons all named "Use this photo — in 1 section"
 * are indistinguishable to a screen-reader user; the filename is the one
 * human-meaningful thing a path carries, and the position makes the name unique
 * even when two uploads shared a filename. `alt=""` on the image is deliberate:
 * the button already has a name, and a second one would be read twice.
 */
export function PhotoPicker({ photos, selectedPath, disabled = false, onSelect }: PhotoPickerProps) {
  if (photos.length === 0) {
    return (
      <p className="text-sm text-content-secondary">
        No photos in your sections yet. Upload one and it will be available here.
      </p>
    );
  }

  return (
    <ul aria-label="Photos already in your sections" className="grid grid-cols-2 gap-3">
      {photos.map((photo, index) => {
        const selected = photo.path === selectedPath;
        const sections = photo.useCount === 1 ? 'section' : 'sections';
        return (
          <li key={photo.path}>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={`Use ${photo.name}, photo ${index + 1} of ${photos.length}, in ${photo.useCount} ${sections}`}
              onClick={() => onSelect(photo.path)}
              className={cn(
                'relative block w-full overflow-hidden rounded-md border bg-surface-card text-left',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                selected
                  ? 'border-interactive ring-2 ring-interactive'
                  : 'border-edge hover:border-interactive',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={buildPublicAssetUrl(`${photo.path}.800w.webp`)}
                alt=""
                className="h-24 w-full object-cover"
              />
              {/* Selection is never colour alone: `aria-pressed` for AT, the
                  check for sighted PMs. Hidden from AT because the name must
                  keep describing the control, not its state. */}
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute right-1 top-1 rounded-full bg-interactive p-0.5 text-content-inverse"
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
              <span className="block truncate px-2 pt-1 text-xs text-content">{photo.name}</span>
              <span className="block px-2 pb-1 text-xs text-content-tertiary">
                In {photo.useCount} {sections}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
