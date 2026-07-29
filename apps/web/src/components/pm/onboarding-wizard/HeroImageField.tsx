'use client';

/**
 * Wizard Step 3 — hero image upload (spec §4.1 Step 3).
 *
 * Reuses the established image pipeline:
 *   - useImageUpload: presign → PUT → finalize (sharp crop + 1600w/800w)
 *   - scaleCropToNatural: react-image-crop display px → source px
 *
 * On save, the finalize result's variant1600Path + alt text are merged into
 * the community's hero block content (headline etc. preserved) and PATCHed
 * via the same hero endpoint Step 4 uses. The hero block is shared with the
 * Welcome step, so we read the current content first and only overwrite the
 * image fields.
 *
 * Source constraints: JPEG/PNG/WebP, ≤ 10MB, ≥ 1600×900 (so the server
 * variants never upscale). Alt text is REQUIRED when an image is provided.
 */
import { useEffect, useRef, useState } from 'react';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { HeroBlockContent } from '@propertypro/shared';
import { replacePrimaryHeroImage } from '@/lib/site-editor/hero-imagery';
import { useImageUpload } from '@/hooks/use-image-upload';
import { scaleCropToNatural } from '@/lib/site-assets/scale-crop';
import { useHeroBlock, useUpdateHeroBlock } from '@/hooks/use-hero-block';
import {
  validateImageFile,
  validateMinDimensions,
  readImageDimensions,
  HERO_MAX_BYTES,
  HERO_MIN_WIDTH,
  HERO_MIN_HEIGHT,
  type ImageDimensions,
} from '@/lib/site-assets/client-image';

const HERO_ALT_MAX = 200;

interface Props {
  communityId: number;
  /** Used as the hero headline if no hero content exists yet (schema requires one). */
  fallbackHeadline: string;
  /**
   * Decode a File's natural dimensions. Injectable so tests don't need a real
   * browser image decode (jsdom can't). Defaults to the real reader.
   */
  readDimensions?: (file: Blob) => Promise<ImageDimensions>;
}

export function HeroImageField({
  communityId,
  fallbackHeadline,
  readDimensions = readImageDimensions,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>();
  const [altText, setAltText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  const heroQuery = useHeroBlock(communityId);
  const upload = useImageUpload({ communityId });
  const updateHero = useUpdateHeroBlock(communityId);
  const previewImgRef = useRef<HTMLImageElement | null>(null);

  // Stable preview URL per selected file; revoked on change/unmount.
  useEffect(() => {
    if (!file) {
      setFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function onSelectFile(selected: File | null) {
    setFileError(null);
    setServerError(null);
    setOutcome(null);
    setCrop(undefined);
    if (!selected) {
      setFile(null);
      return;
    }
    // Cheap checks first (MIME + size), then the dimension decode.
    const basic = validateImageFile(selected, { maxBytes: HERO_MAX_BYTES });
    if (basic) {
      setFile(null);
      setFileError(basic.message);
      return;
    }
    try {
      const dims = await readDimensions(selected);
      const tooSmall = validateMinDimensions(dims, {
        width: HERO_MIN_WIDTH,
        height: HERO_MIN_HEIGHT,
      });
      if (tooSmall) {
        setFile(null);
        setFileError(tooSmall.message);
        return;
      }
    } catch (err) {
      setFile(null);
      setFileError(err instanceof Error ? err.message : 'Could not read the image.');
      return;
    }
    setFile(selected);
  }

  const altMissing = altText.trim().length === 0;
  const busy = upload.isPending || updateHero.isPending;
  const canSave = file !== null && !altMissing && !busy;

  async function onSave() {
    if (!file || altMissing) return;
    setServerError(null);
    setOutcome(null);
    try {
      const img = previewImgRef.current;
      const scaled =
        crop && crop.width > 0 && img && img.naturalWidth > 0
          ? scaleCropToNatural(crop, img)
          : null;

      const result = await upload.mutateAsync({
        file,
        kind: 'hero',
        altText: altText.trim(),
        cropBox: scaled ?? undefined,
      });

      // Merge into the existing hero content so the headline/subtitle/CTA
      // the PM set in the Welcome step are preserved. Fall back to a headline
      // if no hero exists yet (schema requires one).
      //
      // Imagery goes through `replacePrimaryHeroImage`: on a hero that already
      // uses `photos`, spreading `base` and then setting `heroImagePath` would
      // produce content carrying BOTH shapes, which the schema refuses — a
      // dead-end 400 in a wizard with no photo UI, after the upload had
      // already been finalized and charged against the storage quota.
      const current = heroQuery.data;
      const base: HeroBlockContent = current ?? { headline: fallbackHeadline };
      const { heroImagePath: _path, heroImageAlt: _alt, photos: _photos, ...rest } = base;
      const content: HeroBlockContent = {
        ...rest,
        ...replacePrimaryHeroImage(current, {
          photoPath: result.storagePath,
          legacyPath: result.variant1600Path,
          alt: result.altText,
        }),
      };
      await updateHero.mutateAsync(content);
      setOutcome('Hero image saved.');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'We couldn’t save your image. Try again.');
    }
  }

  return (
    <div className="space-y-3" data-testid="hero-image-field">
      <div>
        <label htmlFor="wizard-hero-image" className="block text-sm font-medium text-content">
          Hero image
        </label>
        <p id="wizard-hero-image-help" className="mt-0.5 text-xs text-content-secondary">
          JPEG, PNG, or WebP · at least {HERO_MIN_WIDTH}×{HERO_MIN_HEIGHT} · up to 10MB. Or skip to
          use a solid color from your preset.
        </p>
        <input
          id="wizard-hero-image"
          data-testid="wizard-hero-image-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-describedby="wizard-hero-image-help"
          onChange={(e) => void onSelectFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm"
        />
      </div>

      {fileError && (
        <p role="alert" data-testid="hero-image-file-error" className="text-sm text-error">
          {fileError}
        </p>
      )}

      {fileUrl && (
        <div className="rounded-md border border-default p-2">
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)} aspect={16 / 9}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={previewImgRef} src={fileUrl} alt="" className="max-w-full" />
          </ReactCrop>
          <p className="mt-1 text-xs text-content-secondary">Drag to crop. 16:9 recommended.</p>
        </div>
      )}

      {file && (
        <div className="space-y-1">
          <label htmlFor="wizard-hero-alt" className="block text-sm font-medium text-content">
            Image alt text <span className="text-error">*</span>
          </label>
          <input
            id="wizard-hero-alt"
            data-testid="wizard-hero-alt-input"
            type="text"
            maxLength={HERO_ALT_MAX}
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            required
            aria-invalid={altMissing ? 'true' : undefined}
            className="block w-full rounded-sm border border-default px-3 py-2 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          />
          <p className="text-xs text-content-secondary">
            Describe the image for screen readers (required).
          </p>
        </div>
      )}

      {serverError && (
        <p role="alert" data-testid="hero-image-server-error" className="text-sm text-error">
          {serverError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!canSave}
          data-testid="hero-image-save"
          className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:cursor-not-allowed disabled:opacity-50 hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          {upload.isPending ? 'Uploading…' : updateHero.isPending ? 'Saving…' : 'Save hero image'}
        </button>
        {outcome && (
          <span role="status" data-testid="hero-image-outcome" className="text-sm text-content-secondary">
            {outcome}
          </span>
        )}
      </div>
    </div>
  );
}
