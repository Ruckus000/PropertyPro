'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react';
import {
  MAX_HERO_PHOTOS,
  STOCK_PHOTO_ALT,
  STOCK_PHOTO_IDS,
  STOCK_PHOTO_SRC,
  type HeroPhoto,
  type StockPhotoId,
} from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
// ./public-url, NOT ./storage-paths — the latter pulls `node:crypto` and
// fails at `next build`, not at test time.
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';
import {
  HERO_MAX_BYTES,
  HERO_MIN_HEIGHT,
  HERO_MIN_WIDTH,
  readImageDimensions,
  validateImageFile,
  validateMinDimensions,
  type ImageDimensions,
} from '@/lib/site-assets/client-image';
import { useHeroPhotos, type HeroPhotoUploadItem } from '@/hooks/use-hero-photos';

const ALT_MAX = 200;

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';

/** What a manager calls each stock photo, in the sentence "the ___ photo". */
const STOCK_PHOTO_NAME: Readonly<Record<StockPhotoId, string>> = {
  sunset: 'sunset',
  palms: 'palm-lined street',
};

/** A picked file, described but not yet uploaded. */
interface StagedPhoto {
  id: string;
  file: File;
  alt: string;
  decorative: boolean;
  /**
   * The stock photo this file takes the place of when it lands, rather than
   * joining the end of the list. Held by id, not position, because the list can
   * be reordered while the file waits.
   */
  replaces?: StockPhotoId;
}

/**
 * The stock photo a swap would offer for `current`: the other one, when it is not
 * already in the list, so a swap never puts the same photo in the strip twice.
 *
 * ponytail: with two stock photos "the other one" is a single button. A third would
 * make this a choice. Trigger: STOCK_PHOTO_IDS grows past two.
 */
function swapTarget(photos: readonly HeroPhoto[], current: StockPhotoId): StockPhotoId | null {
  const taken = new Set(photos.flatMap((photo) => ('stock' in photo ? [photo.stock] : [])));
  return STOCK_PHOTO_IDS.find((id) => id !== current && !taken.has(id)) ?? null;
}

export interface HeroPhotosFieldProps {
  communityId: number;
  blockOrder: number;
  photos: HeroPhoto[];
  onChange: (next: HeroPhoto[]) => void;
  /**
   * Injectable so tests do not need a real image decode — jsdom never fires
   * `img.onload`, so an un-stubbed read never settles and hangs the test
   * rather than failing it. Same reason and same shape as `HeroImageField`.
   */
  readDimensions?: (file: Blob) => Promise<ImageDimensions>;
}

/**
 * Hero photo list: upload, describe, reorder, remove.
 *
 * A stock photo (D3: one of ours, served from public/site-looks/, with no path)
 * shows its thumbnail and moves and removes like any other photo. Its description
 * is the manager's to reword, but it can never be decorative. It can also be
 * swapped for the other stock photo, which brings that photo's own description
 * with it, or replaced by one of the manager's own uploads, which takes its place
 * in the list rather than going to the end and carries the upload's own
 * description, never the stock photo's.
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
  readDimensions = readImageDimensions,
}: HeroPhotosFieldProps) {
  // ONE live region for the whole field, matching SiteEditorProvider's
  // discipline. Two regions announce the same move twice.
  const [announcement, setAnnouncement] = useState('');

  const [rejected, setRejected] = useState<{ name: string; message: string }[]>([]);

  const listRef = useRef<HTMLUListElement | null>(null);
  const addRef = useRef<HTMLInputElement | null>(null);
  // Where focus should land after the list re-renders, by row index.
  const focusAfterRef = useRef<{ index: number; action: 'remove' | 'move' | 'swap' } | null>(
    null,
  );
  const stagedSeqRef = useRef(0);

  // `handleUploaded` fires once per file from inside the queue's sequential
  // loop. Reading the prop directly would append to whatever array this
  // callback last closed over, so a second completion could drop the first
  // photo. The ref is always the committed list.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  // The queue hands back only the item it was given, not the stock photo that
  // item replaces, so `handleUploaded` looks that up here, in the rows as last
  // committed.
  const stagedRef = useRef(staged);
  stagedRef.current = staged;

  const handleUploaded = useCallback(
    (result: { storagePath: string }, item: HeroPhotoUploadItem) => {
      const uploaded: HeroPhoto =
        // The BASE path, not `variant1600Path` — the renderer appends the
        // variant suffixes. See `stripVariantSuffix` for the history.
        //
        // Alt comes from the STAGED item, never `result.altText`: for a
        // decorative photo the latter is the pipeline's placeholder, and
        // writing it into block content would hand every photo a plausible
        // description the PM never wrote — passing the publish gate that
        // exists precisely to catch a missing one.
        item.decorative
          ? { path: result.storagePath, decorative: true }
          : { path: result.storagePath, alt: item.alt.trim() };

      // A file staged to replace a stock photo takes that photo's place. If the
      // stock photo is gone by now (removed while this uploaded) there is no
      // place to take, and the upload goes at the end like any other.
      const replaces = stagedRef.current.find((row) => row.id === item.id)?.replaces;
      const current = photosRef.current;
      const at =
        replaces === undefined
          ? -1
          : current.findIndex((photo) => 'stock' in photo && photo.stock === replaces);
      onChange(
        at < 0 ? [...current, uploaded] : current.map((photo, i) => (i === at ? uploaded : photo)),
      );
      setStaged((prev) => prev.filter((row) => row.id !== item.id));
    },
    [onChange],
  );

  const { uploads, upload, isUploading } = useHeroPhotos({
    communityId,
    onUploaded: handleUploaded,
  });

  // Staged rows hold a slot too, or picking 8 then picking 8 again would
  // stage 16 for a list capped at 8. One that replaces a stock photo does not:
  // it takes that photo's place, so the list ends the same length.
  const remaining =
    MAX_HERO_PHOTOS - photos.length - staged.filter((row) => row.replaces === undefined).length;
  const allDescribed = staged.every((row) => row.decorative || row.alt.trim().length > 0);
  const canUpload = staged.length > 0 && allDescribed && !isUploading;

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
        pending.action === 'remove'
          ? 'button[data-remove]'
          : pending.action === 'swap'
            ? 'button[data-swap]'
            : 'button[data-move-focus]';
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

  /** Puts the other stock photo in this one's place, with that photo's own description. */
  const swapStock = (index: number) => {
    const current = photos[index];
    if (current === undefined || !('stock' in current)) return;
    const other = swapTarget(photos, current.stock);
    if (other === null) return;
    const next = photos.slice();
    // Not the old description: "Sunset over the water" on a street of palm trees
    // would tell a screen-reader user about a picture that is not there.
    next[index] = { stock: other, alt: STOCK_PHOTO_ALT[other] };
    onChange(next);
    setAnnouncement(`Photo ${index + 1} changed to the ${STOCK_PHOTO_NAME[other]} photo.`);
    focusAfterRef.current = { index, action: 'swap' };
  };

  const setPhoto = (index: number, patch: Partial<HeroPhoto>) => {
    const next = photos.slice();
    next[index] = { ...next[index]!, ...patch } as HeroPhoto;
    onChange(next);
  };

  const setStagedRow = (id: string, patch: Partial<StagedPhoto>) => {
    setStaged((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  /**
   * Validate each picked file, then stage it for description.
   *
   * Validating here rather than letting the server decide saves a presign +
   * PUT round trip on a file finalize would reject or upscale, and reuses the
   * wording the onboarding wizard already shows for the same two failures.
   */
  const onPick = async (picked: File[], replaces?: StockPhotoId) => {
    const accepted: StagedPhoto[] = [];
    const failures: { name: string; message: string }[] = [];

    // A replacement is one file, and takes no place in the list.
    const room = replaces === undefined ? Math.max(remaining, 0) : 1;
    for (const file of picked.slice(0, room)) {
      const basic = validateImageFile(file, { maxBytes: HERO_MAX_BYTES });
      if (basic) {
        failures.push({ name: file.name, message: basic.message });
        continue;
      }
      const tooSmall = validateMinDimensions(await readDimensions(file), {
        width: HERO_MIN_WIDTH,
        height: HERO_MIN_HEIGHT,
      });
      if (tooSmall) {
        failures.push({ name: file.name, message: tooSmall.message });
        continue;
      }
      stagedSeqRef.current += 1;
      accepted.push({
        id: `staged-${stagedSeqRef.current}`,
        file,
        alt: '',
        decorative: false,
        ...(replaces === undefined ? {} : { replaces }),
      });
    }

    // A file chosen for a stock photo that already has one waiting replaces it:
    // two uploads cannot both take the same place. A file turned down above
    // leaves the earlier one alone.
    setStaged((prev) => [
      ...(replaces !== undefined && accepted.length > 0
        ? prev.filter((row) => row.replaces !== replaces)
        : prev),
      ...accepted,
    ]);
    setRejected(failures);
    setAnnouncement(
      [
        accepted.length > 0
          ? `${accepted.length} ${accepted.length === 1 ? 'photo' : 'photos'} ready to describe.`
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
    await upload(
      staged.map(({ id, file, alt, decorative }) => ({ id, file, alt, decorative })),
    );
    // Rows that succeeded removed themselves in `handleUploaded`; whatever is
    // left failed and keeps its error visible.
    //
    // Focus deliberately does NOT go through `focusAfterRef`: its 'move'
    // branch targets `button[data-move-focus]`, which is disabled at index 0,
    // and focusing a disabled button is a silent no-op that drops focus to
    // <body>.
    setStaged((prev) => {
      if (prev.length === 0) addRef.current?.focus();
      return prev;
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-content">Photos</p>

      {photos.length > 0 && (
        <ul ref={listRef} className="space-y-3">
          {photos.map((photo, index) => {
            const altId = `hero-photo-alt-${blockOrder}-${index}`;
            const decorativeId = `hero-photo-decorative-${blockOrder}-${index}`;
            const isStock = 'stock' in photo;
            const isDecorative = !isStock && photo.decorative === true;
            const swapTo = isStock ? swapTarget(photos, photo.stock) : null;
            const replaceId = `hero-photo-replace-${blockOrder}-${index}`;
            return (
              <li
                // Keyed by path, NOT index. With an index key React reuses the
                // DOM node at each position, so focus stays on the POSITION
                // after a move instead of following the photo the PM moved. A
                // stock photo has no path and the same one may appear twice, so
                // its key takes its position: a move remounts its row, and the
                // focus effect above puts focus back on it.
                key={isStock ? `stock-${photo.stock}-${index}` : photo.path}
                data-photo-row
                className="space-y-2 rounded-md border border-edge p-3"
              >
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      isStock
                        ? STOCK_PHOTO_SRC[photo.stock]
                        : buildPublicAssetUrl(`${photo.path}.800w.webp`)
                    }
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

                {isStock && (
                  <div className="space-y-2">
                    {swapTo !== null && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-swap
                        // The docked column is 320px wide and the longest label
                        // ("…the palm-lined street photo instead") is wider than
                        // the row, so let it wrap rather than run off the edge.
                        className="h-auto max-w-full whitespace-normal py-1.5 text-left"
                        onClick={() => swapStock(index)}
                      >
                        {`Use the ${STOCK_PHOTO_NAME[swapTo]} photo instead`}
                      </Button>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor={replaceId} className="text-xs">
                        {`Replace the ${STOCK_PHOTO_NAME[photo.stock]} photo with your own`}
                      </Label>
                      <Input
                        id={replaceId}
                        type="file"
                        accept={ACCEPTED_TYPES}
                        disabled={isUploading}
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          // Reset the input so re-picking the same file fires change again.
                          event.target.value = '';
                          if (files.length > 0) void onPick(files, photo.stock);
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {/* The schema has no decorative stock photo: ours are described. */}
                  {!isStock && (
                    <>
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
                    </>
                  )}

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

      {/* Staging: picked, not yet uploaded. Alt text is collected HERE
          because finalize requires a non-empty altText — there is no
          upload-first-describe-later option. */}
      {staged.length > 0 && (
        <ul className="space-y-3">
          {staged.map((row) => {
            const altId = `hero-staged-alt-${blockOrder}-${row.id}`;
            const decorativeId = `hero-staged-decorative-${blockOrder}-${row.id}`;
            const needsAlt = !row.decorative && row.alt.trim().length === 0;
            return (
              <li
                key={row.id}
                // NOT `data-photo-row` — the post-removal focus effect indexes
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

                {row.replaces !== undefined && (
                  <p className="text-xs text-content-secondary">
                    {`Replaces the ${STOCK_PHOTO_NAME[row.replaces]} photo.`}
                  </p>
                )}

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
            the upload button — two controls named "Add photos" makes the
            keyboard path ambiguous. */}
        <Label htmlFor={`hero-photo-add-${blockOrder}`} className="text-xs">
          Add photos
        </Label>
        <Input
          ref={addRef}
          id={`hero-photo-add-${blockOrder}`}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          disabled={remaining <= 0 || isUploading}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            // Reset the input so re-picking the same file fires change again.
            event.target.value = '';
            if (files.length > 0) void onPick(files);
          }}
        />
        <p className="text-xs text-content-secondary">
          {remaining > 0
            ? `${remaining} of ${MAX_HERO_PHOTOS} remaining. Describe each photo, or mark it decorative.`
            : `Maximum of ${MAX_HERO_PHOTOS} photos reached.`}
        </p>
      </div>

      {staged.length > 0 && (
        <Button
          type="button"
          disabled={!canUpload}
          onClick={() => void onUploadStaged()}
        >
          {isUploading
            ? 'Uploading…'
            : `Add ${staged.length} ${staged.length === 1 ? 'photo' : 'photos'} to hero`}
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
