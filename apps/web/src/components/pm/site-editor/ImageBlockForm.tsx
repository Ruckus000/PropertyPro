'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import type { ImageBlockContent } from '@propertypro/shared';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';

interface Props {
  communityId: number;
  blockOrder: number;
  initial: ImageBlockContent | null;
  onSaved?: () => void;
}

/**
 * Scale a react-image-crop Crop (in display-pixel coordinates of the rendered
 * preview <img>) into the source image's natural-pixel coordinate space.
 *
 * react-image-crop v11's default unit is 'px' — those pixels are CSS pixels
 * of the rendered preview element, not the source file's natural pixels. The
 * preview <img className="max-w-full"> shrinks to fit the editor column
 * (~600px), so for any real-world source larger than ~600px wide, sending
 * the raw crop coords to sharp.extract crops a tiny region from the source's
 * top-left rather than the user's intended center selection — silent
 * UX-level corruption. Scale by naturalWidth/clientWidth (and the height
 * counterpart) before posting.
 *
 * Exported for testing.
 */
export function scaleCropToNatural(
  crop: Crop,
  img: { naturalWidth: number; naturalHeight: number; clientWidth: number; clientHeight: number },
): { x: number; y: number; width: number; height: number } | null {
  if (img.clientWidth <= 0 || img.clientHeight <= 0) return null;
  const ratioX = img.naturalWidth / img.clientWidth;
  const ratioY = img.naturalHeight / img.clientHeight;
  return {
    x: crop.x * ratioX,
    y: crop.y * ratioY,
    width: crop.width * ratioX,
    height: crop.height * ratioY,
  };
}

export function ImageBlockForm({ communityId, blockOrder, initial, onSaved }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>();
  const [altText, setAltText] = useState(initial?.altText ?? '');
  const [caption, setCaption] = useState(initial?.caption ?? '');
  const [decorative, setDecorative] = useState(initial?.decorative === true);
  const [serverError, setServerError] = useState<string | null>(null);
  const upload = useImageUpload({ communityId });
  const save = useUpsertContentBlock(communityId);
  const previewImgRef = useRef<HTMLImageElement | null>(null);

  // Create the preview URL once per file selection and revoke it on
  // change or unmount — keeps the <img src> stable across unrelated
  // re-renders (alt/caption typing) and avoids leaking object URLs.
  useEffect(() => {
    if (!file) {
      setFileUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const needsAlt = !decorative && altText.trim().length === 0;
  const needsFile = !file && !initial;
  const disabled = needsFile || needsAlt || upload.isPending || save.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    try {
      let imagePath = initial?.imagePath ?? '';
      if (file) {
        // Scale display-pixel crop coords into source-pixel coords. If the
        // preview img hasn't fully loaded (no natural dims yet) we send no
        // cropBox — finalize will treat the upload as no-crop and just
        // produce variants of the full source.
        const img = previewImgRef.current;
        const scaled = crop && crop.width > 0 && img && img.naturalWidth > 0
          ? scaleCropToNatural(crop, img)
          : null;
        const result = await upload.mutateAsync({
          file,
          kind: 'content',
          altText: decorative ? '' : altText.trim(),
          cropBox: scaled ?? undefined,
        });
        imagePath = result.storagePath;
      }
      const content: ImageBlockContent = {
        imagePath,
        ...(decorative ? { decorative: true as const } : { altText: altText.trim() }),
        ...(caption.trim() ? { caption: caption.trim() } : {}),
      } as ImageBlockContent;
      await save.mutateAsync({ blockType: 'image', blockOrder, content });
      onSaved?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor={`image-file-${blockOrder}`} className="block text-sm font-medium text-content">Image</label>
        <input
          id={`image-file-${blockOrder}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm"
        />
      </div>
      {fileUrl && (
        <div className="border border-default rounded-md p-2">
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)} aspect={16/9}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={previewImgRef} src={fileUrl} alt="" className="max-w-full" />
          </ReactCrop>
          <p className="text-xs text-content-secondary mt-1">Drag to crop. Recommended 16:9.</p>
        </div>
      )}
      <div>
        <label className="inline-flex items-center gap-2 text-sm text-content">
          <input type="checkbox" checked={decorative} onChange={(e) => setDecorative(e.target.checked)} />
          Decorative image (no alt text required)
        </label>
      </div>
      {!decorative && (
        <div>
          <label htmlFor={`image-alt-${blockOrder}`} className="block text-sm font-medium text-content">
            Alt text <span className="text-danger">*</span>
          </label>
          <input
            id={`image-alt-${blockOrder}`}
            type="text"
            maxLength={200}
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            required={!decorative}
            className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
          />
        </div>
      )}
      <div>
        <label htmlFor={`image-caption-${blockOrder}`} className="block text-sm font-medium text-content">Caption</label>
        <input
          id={`image-caption-${blockOrder}`}
          type="text"
          maxLength={200}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
        />
      </div>
      {serverError && (
        <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
      >
        {upload.isPending ? 'Uploading…' : save.isPending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
