'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { MAX_HERO_PHOTOS, type HeroPhoto } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
// ./public-url, NOT ./storage-paths — the latter pulls `node:crypto` and
// fails at `next build`, not at test time.
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';
import { useHeroPhotos } from '@/hooks/use-hero-photos';

const ALT_MAX = 200;

export interface HeroPhotosFieldProps {
  communityId: number;
  blockOrder: number;
  photos: HeroPhoto[];
  onChange: (next: HeroPhoto[]) => void;
}

/**
 * Hero photo list: upload, describe, reorder, remove.
 *
 * Reordering is buttons only — no drag library. Phase 2b-2 already declined
 * `@dnd-kit` for the section list ("native HTML5 drag plus the required
 * keyboard grip path covers it at zero KiB"); for a list capped at 8 and fully
 * visible, buttons alone are simpler than both and are the keyboard path
 * rather than an alternative to it.
 */
export function HeroPhotosField({
  communityId,
  blockOrder,
  photos,
  onChange,
}: HeroPhotosFieldProps) {
  // ONE live region for the whole field, matching SiteEditorProvider's
  // discipline. Two regions announce the same move twice.
  const [announcement, setAnnouncement] = useState('');

  const listRef = useRef<HTMLUListElement | null>(null);
  const addRef = useRef<HTMLInputElement | null>(null);
  // Where focus should land after the list re-renders, by row index.
  const focusAfterRef = useRef<{ index: number; action: 'remove' | 'move' } | null>(null);

  const handleUploaded = useCallback(
    (result: { storagePath: string; altText: string }) => {
      onChange([
        ...photos,
        // The BASE path, not `variant1600Path` — the renderer appends the
        // variant suffixes. See `stripVariantSuffix` for the history.
        { path: result.storagePath, alt: result.altText || 'Community photo' },
      ]);
    },
    [onChange, photos],
  );

  const { uploads, upload, isUploading } = useHeroPhotos({
    communityId,
    onUploaded: handleUploaded,
  });

  const remaining = MAX_HERO_PHOTOS - photos.length;

  // Focus placement after a mutation, deferred a tick.
  //
  // Focusing synchronously in the handler loses the race with the row
  // unmounting — React has not committed yet, so focus lands on <body>. Same
  // deferred pattern UrgentNoticeForm uses after a removal.
  useEffect(() => {
    const pending = focusAfterRef.current;
    if (!pending) return undefined;
    focusAfterRef.current = null;
    const id = setTimeout(() => {
      const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-photo-row]');
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
  }, [photos]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const next = photos.slice();
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
    setAnnouncement(
      `Photo ${index + 1} moved to position ${target + 1} of ${photos.length}.`,
    );
    focusAfterRef.current = { index: target, action: 'move' };
  };

  const remove = (index: number) => {
    const next = photos.filter((_, i) => i !== index);
    onChange(next);
    setAnnouncement(
      next.length === 0
        ? 'Photo removed. No photos left.'
        : `Photo ${index + 1} removed. ${next.length} ${next.length === 1 ? 'photo' : 'photos'} left.`,
    );
    focusAfterRef.current = { index, action: 'remove' };
  };

  const setPhoto = (index: number, patch: Partial<HeroPhoto>) => {
    const next = photos.slice();
    next[index] = { ...next[index]!, ...patch } as HeroPhoto;
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-content">Photos</p>

      {photos.length > 0 && (
        <ul ref={listRef} className="space-y-3">
          {photos.map((photo, index) => {
            const altId = `hero-photo-alt-${blockOrder}-${index}`;
            const decorativeId = `hero-photo-decorative-${blockOrder}-${index}`;
            const isDecorative = photo.decorative === true;
            return (
              <li
                // Keyed by path, NOT index. With an index key React reuses the
                // DOM node at each position, so focus stays on the POSITION
                // after a move instead of following the photo the PM moved.
                key={photo.path}
                data-photo-row
                className="space-y-2 rounded-md border border-edge p-3"
              >
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={buildPublicAssetUrl(`${photo.path}.800w.webp`)}
                    alt=""
                    className="h-14 w-20 shrink-0 rounded-sm object-cover"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Label htmlFor={altId} className="text-xs">
                      Alt text
                    </Label>
                    <Input
                      id={altId}
                      value={photo.alt ?? ''}
                      maxLength={ALT_MAX}
                      disabled={isDecorative}
                      onChange={(event) => setPhoto(index, { alt: event.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={decorativeId}
                    checked={isDecorative}
                    className="h-4 w-4 rounded-sm border-edge text-interactive focus-visible:ring-2 focus-visible:ring-interactive"
                    onChange={(event) => {
                      const next = photos.slice();
                      // The schema forbids alt and decorative coexisting, so
                      // this is the model rather than a convenience.
                      next[index] = event.target.checked
                        ? { path: photo.path, decorative: true }
                        : { path: photo.path, alt: photo.alt ?? '' };
                      onChange(next);
                    }}
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
                      // Disabled at the ends rather than a soft no-op: unlike
                      // FloatControls, this list is short and entirely visible,
                      // so an unavailable move reads more honestly as disabled.
                      disabled={index === 0}
                      aria-label={`Move photo ${index + 1} up`}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === photos.length - 1}
                      aria-label={`Move photo ${index + 1} down`}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      data-remove
                      aria-label={`Remove photo ${index + 1}`}
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

      <div className="space-y-1.5">
        <Label htmlFor={`hero-photo-add-${blockOrder}`} className="text-xs">
          Add photos
        </Label>
        <Input
          ref={addRef}
          id={`hero-photo-add-${blockOrder}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={remaining <= 0 || isUploading}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []).slice(0, remaining);
            // Reset the input so re-picking the same file fires change again.
            event.target.value = '';
            if (files.length > 0) void upload(files, '');
          }}
        />
        <p className="text-xs text-content-secondary">
          {remaining > 0
            ? `${remaining} of ${MAX_HERO_PHOTOS} remaining. Describe each photo, or mark it decorative.`
            : `Maximum of ${MAX_HERO_PHOTOS} photos reached.`}
        </p>
      </div>

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
