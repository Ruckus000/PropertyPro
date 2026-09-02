'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Images,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PhotoPicker } from '@/components/pm/site-editor-v3/panels/PhotoPicker';
import { useContentBlocks } from '@/hooks/use-content-blocks';
import { useHeroPhotos, type HeroPhotoUploadItem } from '@/hooks/use-hero-photos';
// ./public-url, NOT ./storage-paths — the latter pulls `node:crypto` and
// fails at `next build`, not at test time.
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';
import {
  CONTENT_MAX_BYTES,
  validateImageFile,
} from '@/lib/site-assets/client-image';
import { placedPhotos } from '@/lib/site-editor/placed-photos';

const ALT_MAX = 200;
const CAPTION_MAX = 200;

/** One image as it lives in gallery block content. */
export interface GalleryImageDraft {
  imagePath: string;
  altText: string;
  decorative: boolean;
  caption: string;
}

/** Where the next images come from. */
type PhotoSource = 'upload' | 'existing';

const SOURCE_OPTIONS: readonly { value: PhotoSource; label: string; icon: LucideIcon }[] = [
  { value: 'upload', label: 'Upload photos', icon: Upload },
  { value: 'existing', label: 'Choose from your photos', icon: Images },
];

/**
 * A picked image, described but not yet in the gallery.
 *
 * Two sources, ONE staging row: a file from disk that still has to be
 * uploaded, or a photo already placed elsewhere on the site, which does not.
 * Both are described here — alt text, or decorative — before "Add to gallery"
 * commits them, which is what keeps a chosen photo from entering block content
 * undescribed: it sits behind the same gate a picked file does.
 */
interface StagedBase {
  id: string;
  alt: string;
  decorative: boolean;
}
interface StagedUpload extends StagedBase {
  source: 'upload';
  file: File;
}
interface StagedExisting extends StagedBase {
  source: 'existing';
  path: string;
  /** The upload filename, as `PhotoPicker` names it. */
  name: string;
}
type StagedImage = StagedUpload | StagedExisting;

function stagedName(row: StagedImage): string {
  return row.source === 'upload' ? row.file.name : row.name;
}

export interface GalleryImagesFieldProps {
  communityId: number;
  blockOrder: number;
  maxImages: number;
  images: GalleryImageDraft[];
  onChange: (next: GalleryImageDraft[]) => void;
}

/**
 * The gallery's image list: upload or choose, describe, caption, reorder,
 * remove.
 *
 * Deliberately the same shape as `HeroPhotosField`, which already solved every
 * hard part of this problem — the staged-then-upload flow, the `imagesRef` fix
 * for the sequential-callback stale closure, path-keyed rows so focus follows
 * the image rather than the position, deferred focus placement after a
 * mutation, and one live region. Where this differs it is because the schema
 * differs: 24 images rather than 8, and an optional per-image caption.
 *
 * "Choose from your photos" reuses a photo already placed on the site with no
 * second upload — the same `PhotoPicker` the Add panel offers, fed the same
 * whole-site list. Its pick lands in the SAME staging list a picked file does,
 * so alt text for this placement is collected before anything is committed.
 * `AddImageFlow` records why nothing in the upload pipeline is a precondition
 * of reusing a path.
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

  const [source, setSource] = useState<PhotoSource>('upload');
  const [staged, setStaged] = useState<StagedImage[]>([]);
  const [rejected, setRejected] = useState<{ name: string; message: string }[]>([]);

  const listRef = useRef<HTMLUListElement | null>(null);
  const addRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
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

  // The WHOLE-SITE block list — same query key as the rest of the editor, so
  // no extra request — not the editor context's page-narrowed `blocks`.
  // "Photos already in your sections" means every section on every page —
  // draft and hidden ones included, which is why the copy says "sections"
  // and not "site": a draft is not on the site yet.
  const { data: siteBlocks } = useContentBlocks(communityId);
  const photos = useMemo(() => placedPhotos(siteBlocks ?? []), [siteBlocks]);

  // Photos in the community's sections that are not in this gallery yet.
  //
  // A photo already here — committed, or picked and waiting to be described —
  // is not offered again. The committed list is keyed by PATH so that focus
  // follows the image rather than its position after a move; a second row
  // with the same path would collide with the first. Refusing at the picker
  // rather than on click means no button that looks live and does nothing.
  //
  // This also settles what the use count means from in here: this gallery is
  // not among the sections counted for any photo it offers, so "In 1 section"
  // reads as one OTHER section. (A photo the PM just removed from this gallery
  // stays counted by the server list until the autosave lands — a window of
  // one debounce.)
  const inGallery = new Set([
    ...images.map((image) => image.imagePath),
    ...staged.flatMap((row) => (row.source === 'existing' ? [row.path] : [])),
  ]);
  const candidates = photos.filter((photo) => !inGallery.has(photo.path));

  // Staged rows hold a slot too, or picking to the cap twice would stage
  // double what the schema allows.
  const remaining = maxImages - images.length - staged.length;
  const allDescribed = staged.every((row) => row.decorative || row.alt.trim().length > 0);
  const canAdd = staged.length > 0 && allDescribed && !isUploading;

  /**
   * Where focus lands when the add control is what is left: the file input in
   * upload mode; in choose mode the first photo still offered, or the pressed
   * source toggle once every photo is already here.
   */
  const focusAddControl = useCallback(() => {
    const target =
      addRef.current ??
      pickerRef.current?.querySelector<HTMLElement>('button:not([disabled])') ??
      sourceRef.current?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    target?.focus();
  }, []);

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
        focusAddControl();
        return;
      }
      const row = rows[Math.min(pending.index, rows.length - 1)];
      const selector =
        pending.action === 'remove' ? 'button[data-remove]' : 'button[data-move-focus]';
      (row?.querySelector<HTMLElement>(selector) ?? row)?.focus();
    }, 0);
    return () => clearTimeout(id);
  }, [images, focusAddControl]);

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

  const setStagedRow = (id: string, patch: Partial<StagedBase>) => {
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
        source: 'upload',
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

  /**
   * Stage a photo already on the site for description.
   *
   * Nothing is uploaded. Presign, PUT and finalize exist to store and
   * transform NEW bytes, and everything finalize does — variants, quota, audit
   * row — has already been done for a placed photo. Only the path is needed,
   * and the block write re-checks it with `assertPathsScopedToCommunity`. Alt
   * text is still collected, for THIS placement: it is contextual to use, so
   * the source section's alt is not carried over.
   */
  const choose = (path: string) => {
    // The picker is disabled at the cap; this is the belt behind the braces.
    if (remaining <= 0) return;
    const photo = candidates.find((candidate) => candidate.path === path);
    if (!photo) return;
    stagedSeqRef.current += 1;
    setStaged((prev) => [
      ...prev,
      {
        id: `staged-${stagedSeqRef.current}`,
        source: 'existing',
        path: photo.path,
        name: photo.name,
        alt: '',
        decorative: false,
      },
    ]);
    setAnnouncement(`${photo.name} ready to describe.`);
  };

  /**
   * Commit everything staged.
   *
   * Chosen photos go straight into the list — no round trip — and land BEFORE
   * the uploads: they are committed synchronously, and the queue then appends
   * behind them. `imagesRef` is synced by hand here rather than left to the
   * next render, so an upload that completes before React re-renders still
   * appends to the list that includes them.
   */
  const onAddStaged = async () => {
    const chosen = staged.filter((row): row is StagedExisting => row.source === 'existing');
    if (chosen.length > 0) {
      const next = [
        ...imagesRef.current,
        ...chosen.map((row) => ({
          imagePath: row.path,
          altText: row.decorative ? '' : row.alt.trim(),
          decorative: row.decorative,
          caption: '',
        })),
      ];
      imagesRef.current = next;
      onChange(next);
      setStaged((prev) => prev.filter((row) => row.source !== 'existing'));
    }

    await upload(
      staged.flatMap((row) =>
        row.source === 'upload'
          ? [{ id: row.id, file: row.file, alt: row.alt, decorative: row.decorative }]
          : [],
      ),
    );
    // Rows that succeeded removed themselves in `handleUploaded`; whatever is
    // left failed and keeps its error visible.
    setStaged((prev) => {
      if (prev.length === 0) focusAddControl();
      return prev;
    });
  };

  const remainingNote =
    remaining > 0
      ? `${remaining} of ${maxImages} remaining. Describe each image, or mark it decorative.`
      : `Maximum of ${maxImages} images reached.`;

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

      {/* Staging: picked, not yet in the gallery. Alt text is collected HERE
          because finalize requires a non-empty altText — there is no
          upload-first-describe-later option — and a chosen photo is held to
          the same rule so the two paths are one field. */}
      {staged.length > 0 && (
        <ul className="space-y-3">
          {staged.map((row) => {
            const name = stagedName(row);
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
                <div className="flex items-start gap-3">
                  {/* A chosen photo already has its variants, so it can show
                      itself; a file from disk has no URL until it is uploaded. */}
                  {row.source === 'existing' && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={buildPublicAssetUrl(`${row.path}.800w.webp`)}
                      alt=""
                      className="h-14 w-20 shrink-0 rounded-sm object-cover"
                    />
                  )}
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-content">
                    {name}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Discard ${name}`}
                    onClick={() => setStaged((prev) => prev.filter((s) => s.id !== row.id))}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor={altId} className="text-xs">
                    {`Alt text for ${name}`}
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
                    {`Decorative — ${name}`}
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

      {/* A pair of toggle buttons, not `ui/tabs` — `AddImageFlow`'s shape, for
          the reason it records: Radix labels each tabpanel by its trigger,
          which would make the upload region a second element labelled like
          the file input. `aria-pressed` for AT, the raised segment plus a
          distinct icon for everyone else. */}
      <div
        ref={sourceRef}
        role="group"
        aria-label="Image source"
        className="grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1"
      >
        {SOURCE_OPTIONS.map(({ value, label, icon: Icon }) => {
          const pressed = source === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={pressed}
              onClick={() => setSource(value)}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-center text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                pressed
                  ? 'bg-surface-card text-content shadow'
                  : 'text-content-secondary hover:text-content',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        {source === 'upload' ? (
          <>
            {/* This label belongs to the FILE INPUT. Do not reuse the string on
                the add button — two controls named "Add images" makes the
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
          </>
        ) : (
          <div ref={pickerRef}>
            {photos.length > 0 && candidates.length === 0 ? (
              // Not the picker's own empty copy: there ARE photos in the sections,
              // and "upload one and it will be available here" would be untrue.
              <p className="text-sm text-content-secondary">
                Every photo in your sections is already in this gallery.
              </p>
            ) : (
              // `selectedPath` stays null: a pick moves the photo into the
              // staging list above, so nothing in the picker is ever "chosen".
              <PhotoPicker
                photos={candidates}
                selectedPath={null}
                disabled={remaining <= 0 || isUploading}
                onSelect={choose}
              />
            )}
          </div>
        )}
        <p className="text-xs text-content-secondary">{remainingNote}</p>
      </div>

      {staged.length > 0 && (
        <Button type="button" disabled={!canAdd} onClick={() => void onAddStaged()}>
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
