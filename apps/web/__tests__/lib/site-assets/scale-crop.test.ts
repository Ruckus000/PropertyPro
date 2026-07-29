import { describe, it, expect } from 'vitest';
import { scaleCropToNatural } from '@/lib/site-assets/scale-crop';

describe('scaleCropToNatural (ultrareview bug_028 regression)', () => {
  // ReactCrop returns CSS-pixel coords of the rendered <img>. The preview is
  // styled max-w-full and shrinks to ~600px in the editor column, so for a
  // typical 2400×1350 source the rendered img reports clientWidth=600 /
  // clientHeight=337. Without scaling, sharp.extract would treat the
  // display-pixel crop coords as source-pixel coords and crop a tiny region
  // from the upper-left of the source — silent UX corruption. The scaler
  // multiplies by naturalWidth/clientWidth so the coords sent to the server
  // match the user's intended region on the source.

  it('scales display-pixel crop coords up to source-pixel coords', () => {
    const result = scaleCropToNatural(
      { x: 50, y: 80, width: 500, height: 281 },
      { naturalWidth: 2400, naturalHeight: 1350, clientWidth: 600, clientHeight: 337 },
    );
    expect(result).not.toBeNull();
    // ratioX = 2400/600 = 4, ratioY ≈ 1350/337 ≈ 4.0059
    expect(result!.x).toBe(200);
    expect(result!.width).toBe(2000);
    expect(result!.y).toBeCloseTo(320, -1); // ratioY ≈ 4.006
    expect(result!.height).toBeCloseTo(1125, -1);
  });

  it('is the identity when displayed and natural sizes match (no shrink)', () => {
    const result = scaleCropToNatural(
      { x: 10, y: 20, width: 100, height: 56 },
      { naturalWidth: 600, naturalHeight: 337, clientWidth: 600, clientHeight: 337 },
    );
    expect(result).toEqual({ x: 10, y: 20, width: 100, height: 56 });
  });

  it('returns null when the preview img has zero client dimensions (not yet laid out)', () => {
    const result = scaleCropToNatural(
      { x: 10, y: 20, width: 100, height: 56 },
      { naturalWidth: 1600, naturalHeight: 900, clientWidth: 0, clientHeight: 0 },
    );
    expect(result).toBeNull();
  });

  // A real `react-image-crop` Crop carries a `unit` field the helper ignores.
  // Passing one through a variable (not an object literal) is what the callers
  // actually do, and is what the structural parameter type has to accept.
  it('accepts a full react-image-crop Crop shape', () => {
    const crop = { x: 4, y: 8, width: 40, height: 20, unit: 'px' as const };
    expect(scaleCropToNatural(crop, {
      naturalWidth: 200,
      naturalHeight: 100,
      clientWidth: 100,
      clientHeight: 50,
    })).toEqual({ x: 8, y: 16, width: 80, height: 40 });
  });
});
