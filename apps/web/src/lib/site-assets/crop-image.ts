'use client';

/**
 * Client-side crop: draw a source-pixel crop region of an image onto a canvas
 * and return it as a File. Used by the site-logo crop UI — the cropped File is
 * uploaded raw and the server (resizeSiteLogo) fits it to the wordmark box.
 *
 * Browser-only (uses <canvas>); not exercised in jsdom. Injected into
 * SiteLogoField so component tests can stub it.
 */
export interface CropPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function cropImageToFile(
  image: HTMLImageElement,
  cropPx: CropPx,
  fileName: string,
  mimeType: string = 'image/png',
): Promise<File> {
  const width = Math.max(1, Math.round(cropPx.width));
  const height = Math.max(1, Math.round(cropPx.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D canvas context for cropping');
  ctx.drawImage(image, cropPx.x, cropPx.y, cropPx.width, cropPx.height, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode cropped image'))),
      mimeType,
    );
  });
  return new File([blob], fileName, { type: mimeType });
}
