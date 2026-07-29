/**
 * Crop-coordinate scaling, shared by every surface that crops an upload.
 *
 * Lives here rather than beside one of its callers because there are three of
 * them across two editors: the legacy `ImageBlockForm`, `SiteLogoField`, and
 * the onboarding wizard's `HeroImageField`. It previously hung off
 * `ImageBlockForm`, which made a v2-only-looking component load-bearing for two
 * surfaces that outlive it.
 */

/** The four fields read off a `react-image-crop` `Crop`. */
export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The four fields read off the rendered preview `<img>`. */
export interface PreviewImageDimensions {
  naturalWidth: number;
  naturalHeight: number;
  clientWidth: number;
  clientHeight: number;
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
 * The `crop` parameter is structural rather than `react-image-crop`'s own
 * `Crop` type: only these four fields are read, and keeping the import out
 * means the v3 editor can use this module without pulling in a package it
 * deliberately does not ship.
 */
export function scaleCropToNatural(
  crop: CropBox,
  img: PreviewImageDimensions,
): CropBox | null {
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
