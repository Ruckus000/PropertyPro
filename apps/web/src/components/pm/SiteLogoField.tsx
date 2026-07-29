'use client';

/**
 * Site (wordmark) logo upload with a manual crop tool. The PM selects an image
 * and frames a horizontal region; the cropped result is handed to the parent
 * as a File. On save it's uploaded raw and the server (resizeSiteLogo) fits it
 * within the wordmark box (≤600×180). Separate from the square avatar logo.
 */
import { useEffect, useRef, useState } from 'react';
import ReactCrop, { type Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { scaleCropToNatural } from '@/lib/site-assets/scale-crop';
import { cropImageToFile, type CropPx } from '@/lib/site-assets/crop-image';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  /** Receives the cropped File (or null when cleared / not yet cropped). */
  onChange: (file: File | null) => void;
  /** Presigned URL of the current site logo, shown when no new file is chosen. */
  initialUrl?: string | null;
  /** Injectable for tests (jsdom has no real canvas). */
  cropToFile?: (image: HTMLImageElement, cropPx: CropPx, fileName: string) => Promise<File>;
}

export function SiteLogoField({ onChange, initialUrl, cropToFile = cropImageToFile }: Props) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('site-logo.png');
  const [crop, setCrop] = useState<Crop | undefined>();
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!fileUrl) return;
    return () => URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError('Only PNG, JPEG, or WebP images are accepted');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be 10 MB or smaller');
      return;
    }
    setError(null);
    setFileName(`site-logo.${file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]}`);
    setCrop(undefined);
    onChange(null); // require a crop before we hand up a file
    setFileUrl(URL.createObjectURL(file));
  }

  async function handleComplete(c: Crop) {
    const img = imgRef.current;
    if (!img || !c.width || !c.height) return;
    const natural = scaleCropToNatural(c, img);
    if (!natural) return;
    try {
      const file = await cropToFile(img, natural, fileName);
      onChange(file);
      setError(null);
    } catch {
      setError('Could not process the crop. Try a different area.');
    }
  }

  return (
    <div data-testid="site-logo-field">
      <label htmlFor="site-logo-upload" className="mb-1.5 block text-sm font-medium text-content">
        Site logo (wordmark)
      </label>
      <p className="mb-2 text-xs text-content-secondary">
        Shown in your public site header. Upload a wide image and crop it — PNG, JPEG, or WebP, max 10 MB.
      </p>
      {!fileUrl && initialUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={initialUrl} alt="Current site logo" className="mb-2 h-10 w-auto max-w-[200px] object-contain" />
      ) : null}
      <input
        id="site-logo-upload"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        data-testid="site-logo-input"
        onChange={handleSelect}
        className="block text-sm"
      />
      {fileUrl ? (
        <div className="mt-3">
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={handleComplete}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imgRef} src={fileUrl} alt="Crop your site logo" data-testid="site-logo-crop-image" />
          </ReactCrop>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
