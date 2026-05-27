import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { transformSiteImage } from '@/lib/site-assets/transform';

async function makeJpegFixture(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 100, b: 50 } },
  }).jpeg().toBuffer();
}

describe('transformSiteImage', () => {
  it('returns 2 WebP variants when no crop is supplied', async () => {
    const input = await makeJpegFixture(2000, 1125);
    const { at1600w, at800w } = await transformSiteImage(input);
    expect((await sharp(at1600w).metadata()).width).toBe(1600);
    expect((await sharp(at800w).metadata()).width).toBe(800);
  });

  it('applies the crop box before resizing', async () => {
    const input = await makeJpegFixture(2000, 1500);
    // Crop to 1600x900 starting at (0,300)
    const { at1600w } = await transformSiteImage(input, { x: 0, y: 300, width: 1600, height: 900 });
    const meta = await sharp(at1600w).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(900);
  });

  it('rejects an out-of-bounds crop', async () => {
    const input = await makeJpegFixture(1600, 900);
    await expect(transformSiteImage(input, { x: 0, y: 0, width: 5000, height: 5000 })).rejects.toThrow();
  });

  it('rejects negative crop origin', async () => {
    const input = await makeJpegFixture(1600, 900);
    await expect(transformSiteImage(input, { x: -10, y: 0, width: 100, height: 100 })).rejects.toThrow();
  });

  it('rejects zero/negative crop dimensions', async () => {
    const input = await makeJpegFixture(1600, 900);
    await expect(transformSiteImage(input, { x: 0, y: 0, width: 0, height: 100 })).rejects.toThrow();
    await expect(transformSiteImage(input, { x: 0, y: 0, width: 100, height: -5 })).rejects.toThrow();
  });
});
