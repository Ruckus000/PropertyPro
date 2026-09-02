'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Images, Upload, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useContentBlocks, useUpsertContentBlock } from '@/hooks/use-content-blocks';
import {
  CONTENT_MAX_BYTES,
  DECORATIVE_PLACEHOLDER_ALT,
  validateImageFile,
} from '@/lib/site-assets/client-image';
import { placedPhotos } from '@/lib/site-editor/placed-photos';
import type { AddCatalogEntry } from './add-catalog';
import { PhotoPicker } from './PhotoPicker';

const ALT_MAX = 200;

/** Where the section's photo comes from. */
type PhotoSource = 'upload' | 'existing';

const SOURCE_OPTIONS: readonly { value: PhotoSource; label: string; icon: LucideIcon }[] = [
  { value: 'upload', label: 'Upload a photo', icon: Upload },
  { value: 'existing', label: 'Choose from your photos', icon: Images },
];

export interface AddImageFlowProps {
  communityId: number;
  /** `image` or `gallery` — the two types that cannot exist without a file. */
  entry: AddCatalogEntry;
  /** Slot the section will take, or null if the list has not loaded. */
  blockOrder: number | null;
  /**
   * The page this section is being added to (Phase 11b-3, D-WRITE).
   *
   * Required rather than optional, and passed through to the upsert as an
   * explicit override even though the hook would default to the same value.
   * An optional prop whose absence silently retargets a write at the live HOME
   * page is the exact failure class this phase exists to remove — so the type
   * makes forgetting it impossible rather than merely unlikely. `null` is the
   * legitimate "no page known" case and reproduces the pre-11b-3 default.
   */
  pageId: number | null;
  onCancel: () => void;
  onAdded: (blockOrder: number, entry: AddCatalogEntry) => void;
}

/**
 * Add an Image or Gallery section — the two types that need a photo first.
 *
 * `imageBlockSchema.imagePath` and each `galleryBlockSchema.images[].imagePath`
 * must be a real `{communityId}/{kind}/...` storage path, so unlike every other
 * type there is no valid content to seed and no way to create the section and
 * fill it in afterwards. The photo has to come first — uploaded, or chosen from
 * the ones already on the site.
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
 *
 * **Choosing an existing photo skips the upload pipeline entirely.** Presign,
 * PUT and finalize exist to store and transform NEW bytes; everything finalize
 * does — write the two WebP variants, delete the raw upload, increment the
 * quota, audit-log the creation — is about bytes that did not exist before. A
 * photo already on the site has its variants, has been charged, and has its
 * audit row. The only thing the new section needs is the path, which goes
 * through the same block upsert as an upload does, where
 * `assertPathsScopedToCommunity` checks it again. Alt text is still collected
 * here, for THIS placement: it is contextual to use, so the source section's
 * alt is not carried over.
 *
 * The candidate list is the WHOLE-SITE block list from `useContentBlocks` —
 * same query key as the rest of the editor, so no extra request — not the
 * editor context's page-narrowed `blocks`. "Photos already on your site" means
 * the site.
 *
 * The write uses whichever source is ACTIVE at submit. Switching sources does
 * not clear the other one's state, so a PM can flip over to check what is on
 * the site and flip back without losing the file they picked.
 */
export function AddImageFlow({
  communityId,
  entry,
  blockOrder,
  pageId,
  onCancel,
  onAdded,
}: AddImageFlowProps) {
  const upload = useImageUpload({ communityId });
  const upsert = useUpsertContentBlock(communityId);
  const { data: siteBlocks } = useContentBlocks(communityId);
  const photos = useMemo(() => placedPhotos(siteBlocks ?? []), [siteBlocks]);

  const [source, setSource] = useState<PhotoSource>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [chosenPath, setChosenPath] = useState<string | null>(null);
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
  // The path the block will reference, when it is already known: a chosen
  // photo is settled the moment it is picked; an upload is settled once
  // finalize returns. Either way, a settled path means submit writes only.
  const settledPath = source === 'existing' ? chosenPath : uploadedPath;
  const hasPhoto = settledPath !== null || (source === 'upload' && file !== null);
  const canSubmit = blockOrder !== null && hasPhoto && described && !busy;

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
      let imagePath = settledPath;
      if (imagePath === null) {
        // Only an upload can be unsettled here — an existing photo has no
        // "not yet uploaded" state, so no presign, PUT, or finalize runs for
        // it, and the storage quota does not move.
        if (source !== 'upload' || file === null) return;
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
        pageId,
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

  const choose = (path: string) => {
    setError(null);
    setChosenPath(path);
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

      {/* A pair of toggle buttons, not `ui/tabs`: Radix labels each tabpanel
          by its trigger, which would make the upload region a second element
          labelled "…photo" beside the file input's own "Photo" label. This is
          the directory's existing toggle shape (PagesPanel's "Show in
          navigation"): `aria-pressed` for AT, and the pressed segment's raised
          surface plus a distinct icon for everyone else. Not named
          "Photo source" for the same reason — the group name would collide
          with the file input's label too. */}
      <div
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
              disabled={busy}
              onClick={() => {
                setSource(value);
                setError(null);
              }}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-center text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
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

      {source === 'upload' ? (
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
      ) : (
        <PhotoPicker
          photos={photos}
          selectedPath={chosenPath}
          disabled={busy}
          onSelect={choose}
        />
      )}

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
            : settledPath !== null && error !== null
              ? 'Try again'
              : `Add ${entry.label} section`}
      </Button>
    </div>
  );
}
